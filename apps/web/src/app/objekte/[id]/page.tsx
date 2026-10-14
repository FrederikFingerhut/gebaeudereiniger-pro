import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteFromRow, type SiteRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { addMaterial, deleteMaterial, refillMaterial } from "../material-actions";
import { requireMe } from "@/lib/supabase";
import { SiteForm } from "../site-form";
import { Skeleton } from "@/components/skeleton";

export default function SitePage({ params }: PageProps<"/objekte/[id]">) {
  return (
    <>
      <PageTitle>Objekt bearbeiten</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <EditSite params={params} />
      </Suspense>
    </>
  );
}

async function EditSite({ params }: { params: PageProps<"/objekte/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, isOffice } = await requireMe();
  const [{ data: row }, { data: customers }, { data: items }, { data: material }] = await Promise.all([
    supabase.from("sites").select(isOffice ? "*, site_billing(billing_mode, price_cents)" : "*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("checklist_items").select("title").eq("site_id", id).eq("active", true).order("position"),
    supabase.from("material_items").select("id, name, status, status_at, status_note, profiles!material_items_status_by_fkey(full_name)").eq("site_id", id).order("position").order("name"),
  ]);
  if (!row) notFound();
  const r = row as unknown as SiteRow;
  const site = siteFromRow(r);

  return (
    <div className="flex flex-col gap-4">
      <Card title={site.name} action={<Link href={`/objekte/${id}/qr`} className="text-sm font-semibold text-primary">QR-Code drucken</Link>}>
        <SiteForm
          site={{
            id,
            customerId: site.customerId,
            name: site.name,
            address: site.address,
            latitude: r.latitude,
            longitude: r.longitude,
            geofenceRadius: r.geofence_radius_m,
            plannedMinutes: site.plannedMinutes,
            accessNotes: site.accessNotes ?? "",
            contact: site.contact ?? "",
            specialNotes: site.specialNotes ?? "",
            billingMode: site.billingMode,
            priceCents: site.priceCents,
            checklist: (items ?? []).map((i) => (i.title as { de?: string }).de ?? ""),
          }}
          customers={customers ?? []}
          showPrices={isOffice}
        />
      </Card>
      <p className="text-sm text-muted">
        Die Checkliste sehen Mitarbeiter auf Deutsch. Übersetzungen kommen in einem späteren Schritt.
      </p>
      <MaterialCard siteId={id} items={(material ?? []) as unknown as MaterialRow[]} />
    </div>
  );
}

type MaterialRow = { id: string; name: string; status: "ok" | "wenig" | "fehlt"; status_at: string | null; status_note: string | null; profiles: { full_name: string } | null };
const statusPill = { ok: { tone: "ok", label: "da" }, wenig: { tone: "warn", label: "wird knapp" }, fehlt: { tone: "bad", label: "fehlt" } } as const;

/** Material, das vor Ort sein muss. Mitarbeiter melden in der App „da“, „wird knapp“ oder „fehlt“. */
function MaterialCard({ siteId, items }: { siteId: string; items: MaterialRow[] }) {
  return (
    <Card title="Material vor Ort">
      <p className="text-sm text-muted mb-3">Mitarbeiter sehen diese Liste im Einsatz und melden, was knapp wird oder fehlt. Du bekommst dann eine Nachricht.</p>
      {items.length > 0 && (
        <ul id="material" className="divide-y divide-line mb-4">
          {items.map((m) => (
            <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-semibold">{m.name}</span>{" "}
                <Pill tone={statusPill[m.status].tone}>{statusPill[m.status].label}</Pill>
                {m.status_at && (
                  <div className="text-xs text-muted">
                    {m.profiles?.full_name ?? "Jemand"} am {new Date(m.status_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                    {m.status_note ? `: ${m.status_note}` : ""}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                {m.status !== "ok" && (
                  <form action={refillMaterial.bind(null, m.id)}>
                    <button className="rounded-lg bg-primary text-on-primary px-3 py-1.5 font-semibold">Nachgefüllt</button>
                  </form>
                )}
                <form action={deleteMaterial.bind(null, m.id)}>
                  <button className="rounded-lg px-3 py-1.5 font-semibold text-bad hover:bg-soft" aria-label={`${m.name} entfernen`}>
                    Entfernen
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={addMaterial.bind(null, siteId)} submit="Hinzufügen" className="flex flex-col gap-3 max-w-lg">
        <Field label="Material, eins pro Zeile">
          <textarea name="names" rows={3} placeholder={"Müllbeutel 120 l\nHandtuchpapier\nAllzweckreiniger"} className={inputClass} />
        </Field>
      </ActionForm>
    </Card>
  );
}
