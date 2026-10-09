"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { berlinDate, nextOfferNumber, parseEuro, parseOfferLines } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import type { FormState } from "@/components/action-form";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** Angebot speichern und gleich die Druckansicht öffnen. */
export async function saveOffer(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile, isOffice } = await requireMe();
  if (!isOffice) return { error: "Keine Berechtigung." };

  const descriptions = data.getAll("description").map(String);
  const quantities = data.getAll("quantity").map(String);
  const units = data.getAll("unit").map(String);
  const prices = data.getAll("price").map(String);
  const lines = parseOfferLines(
    descriptions.map((description, i) => ({
      description,
      quantity: Number((quantities[i] ?? "").replace(",", ".")),
      unit: units[i],
      unitPriceCents: parseEuro(prices[i] ?? "") ?? NaN,
    })),
  );
  const recipient = text(data, "recipient");
  const title = text(data, "title");
  if (!recipient || !title) return { error: "Bitte Empfänger und Betreff angeben." };
  if (lines.length === 0) return { error: "Bitte mindestens eine Position mit Menge und Preis eintragen." };

  const year = Number(berlinDate().slice(0, 4));
  const { data: numbers } = await supabase.from("offers").select("number").like("number", `A-${year}-%`);
  const { data: offer, error } = await supabase
    .from("offers")
    .insert({
      company_id: profile.company_id,
      number: nextOfferNumber((numbers ?? []).map((n) => n.number), year),
      customer_id: text(data, "customer_id") || null,
      recipient,
      title,
      lines,
      note: text(data, "note") || null,
      valid_until: text(data, "valid_until") || null,
    })
    .select("id")
    .single();
  if (error || !offer) return { error: "Speichern hat nicht geklappt. Bitte noch einmal versuchen." };
  redirect(`/angebote/${offer.id}`);
}

export async function deleteOffer(id: string) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return;
  await supabase.from("offers").delete().eq("id", id);
  redirect("/angebote");
}

/** Briefkopf: Name, Anschrift und Kontakt der Firma (darf nur der Chef ändern). */
export async function saveLetterhead(_: FormState, data: FormData): Promise<FormState> {
  const { supabase, profile } = await requireMe();
  if (profile.role !== "chef") return { error: "Den Briefkopf kann nur der Chef ändern." };
  const name = text(data, "name");
  if (!name) return { error: "Bitte den Firmennamen angeben." };
  const { error } = await supabase
    .from("companies")
    .update({ name, address: text(data, "address") || null, phone: text(data, "phone") || null, email: text(data, "email") || null })
    .eq("id", profile.company_id);
  if (error) return { error: "Speichern hat nicht geklappt." };
  refresh();
  return { ok: "Briefkopf gespeichert." };
}
