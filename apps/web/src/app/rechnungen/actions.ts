"use server";

import { refresh } from "next/cache";
import { berlinDate, lexofficeContact, lexofficeInvoice } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import { loadDrafts } from "@/lib/invoices";
import { lexoffice, lexofficeMessage } from "@/lib/lexoffice";
import type { FormState } from "@/components/action-form";

/** API-Schlüssel aus Lexoffice speichern (leer = Verbindung trennen). Wird vorher geprüft. */
export async function saveLexofficeKey(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  const key = String(data.get("key") ?? "").trim();
  if (!key) {
    await supabase.from("company_integrations").delete().eq("company_id", profile.company_id);
    refresh();
    return { ok: "Verbindung zu Lexoffice getrennt." };
  }
  let companyName = "";
  try {
    const profileInfo = await lexoffice<{ companyName?: string }>(key, "/profile");
    companyName = profileInfo.companyName ?? "";
  } catch (e) {
    return { error: lexofficeMessage(e) };
  }
  const { error } = await supabase
    .from("company_integrations")
    .upsert({ company_id: profile.company_id, lexoffice_api_key: key, updated_at: new Date().toISOString() });
  if (error) return { error: "Speichern hat nicht geklappt." };
  refresh();
  return { ok: companyName ? `Verbunden mit „${companyName}“.` : "Mit Lexoffice verbunden." };
}

type Contact = { id: string; company?: { name?: string } };

/** Kontakt in Lexoffice finden (gleicher Name) oder neu anlegen; die ID merken wir uns beim Kunden. */
async function contactFor(key: string, supabase: Awaited<ReturnType<typeof requireMe>>["supabase"], customerId: string): Promise<string> {
  const { data: customer } = await supabase.from("customers").select("name, lexoffice_contact_id").eq("id", customerId).single();
  if (!customer) throw new Error("Kunde fehlt");
  if (customer.lexoffice_contact_id) return customer.lexoffice_contact_id;

  // Suche geht erst ab 3 Zeichen.
  const found: { content?: Contact[] } = customer.name.trim().length >= 3 ? await lexoffice<{ content?: Contact[] }>(key, `/contacts?customer=true&name=${encodeURIComponent(customer.name.trim())}`) : {};
  const same = (found.content ?? []).filter((c) => c.company?.name?.trim().toLowerCase() === customer.name.trim().toLowerCase());
  const id = same.length === 1 ? same[0].id : (await lexoffice<{ id: string }>(key, "/contacts", { method: "POST", body: lexofficeContact(customer.name) })).id;
  await supabase.from("customers").update({ lexoffice_contact_id: id }).eq("id", customerId);
  return id;
}

/** Rechnung eines Kunden für einen Monat als Entwurf an Lexoffice übergeben. */
export async function handOverInvoice(customerId: string, period: string): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Ungültiger Monat." };

  const { data: integration } = await supabase.from("company_integrations").select("lexoffice_api_key").maybeSingle();
  const key = integration?.lexoffice_api_key;
  if (!key) return { error: "Lexoffice ist noch nicht verbunden. Trag unten den API-Schlüssel ein." };

  const { data: existing } = await supabase.from("invoices").select("id, lexoffice_invoice_id").eq("customer_id", customerId).eq("period", `${period}-01`).maybeSingle();
  if (existing?.lexoffice_invoice_id) return { ok: "Schon in Lexoffice." };

  const draft = (await loadDrafts(supabase, period)).find((d) => d.customerId === customerId);
  if (!draft) return { error: "Für diesen Kunden gibt es in dem Monat nichts abzurechnen." };

  let lexId: string;
  try {
    const contactId = await contactFor(key, supabase, customerId);
    lexId = (await lexoffice<{ id: string }>(key, "/invoices", { method: "POST", body: lexofficeInvoice(draft, contactId, berlinDate()) })).id;
  } catch (e) {
    return { error: lexofficeMessage(e) };
  }

  // Übergabe festhalten, damit dieselbe Rechnung nicht zweimal in Lexoffice landet.
  const { data: invoice } = await supabase
    .from("invoices")
    .upsert(
      {
        company_id: profile.company_id,
        customer_id: customerId,
        period: `${period}-01`,
        status: "uebergeben",
        total_net_cents: draft.totalNetCents,
        lexoffice_invoice_id: lexId,
        handed_over_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,period" },
    )
    .select("id")
    .single();
  if (invoice) {
    await supabase.from("invoice_lines").delete().eq("invoice_id", invoice.id);
    await supabase.from("invoice_lines").insert(
      draft.lines.map((l, i) => ({ invoice_id: invoice.id, company_id: profile.company_id, position: i + 1, description: l.description, quantity: l.quantity, unit_price_cents: l.unitPriceCents })),
    );
  }
  refresh();
  return { ok: "In Lexoffice als Entwurf angelegt." };
}
