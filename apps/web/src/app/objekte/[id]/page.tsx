import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteFromRow, type SiteRow } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { SiteForm } from "../site-form";

export default function SitePage({ params }: PageProps<"/objekte/[id]">) {
  return (
    <>
      <PageTitle>Objekt bearbeiten</PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <EditSite params={params} />
      </Suspense>
    </>
  );
}

async function EditSite({ params }: { params: PageProps<"/objekte/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, isOffice } = await requireMe();
  const [{ data: row }, { data: customers }, { data: items }] = await Promise.all([
    supabase.from("sites").select(isOffice ? "*, site_billing(billing_mode, price_cents)" : "*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("checklist_items").select("title").eq("site_id", id).eq("active", true).order("position"),
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
    </div>
  );
}
