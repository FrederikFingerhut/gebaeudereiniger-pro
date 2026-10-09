import { Suspense } from "react";
import Link from "next/link";
import { formatEuro, siteFromRow, type SiteRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { emptySite, SiteForm } from "./site-form";
import { Skeleton } from "@/components/skeleton";

export default function SitesPage() {
  return (
    <>
      <PageTitle>Objekte</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Sites />
      </Suspense>
    </>
  );
}

async function Sites() {
  const { supabase, isOffice } = await requireMe();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    supabase.from("sites").select(isOffice ? "*, site_billing(billing_mode, price_cents)" : "*").eq("active", true).order("name"),
    supabase.from("customers").select("id, name").order("name"),
  ]);
  const sites = ((rows ?? []) as unknown as SiteRow[]).map((r) => ({ ...siteFromRow(r), hasLocation: r.latitude !== null }));

  return (
    <div className="flex flex-col gap-4">
      {sites.length === 0 && <p className="text-sm text-muted">Noch keine Objekte. Lege unten das erste an.</p>}
      <div className="grid md:grid-cols-2 gap-4">
        {sites.map((s) => (
          <Card key={s.id} title={s.name} action={<Link href={`/objekte/${s.id}`} className="text-sm font-semibold text-primary">Bearbeiten</Link>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Adresse</dt>
              <dd>{s.address}</dd>
              {isOffice && (
                <>
                  <dt className="text-muted">Abrechnung</dt>
                  <dd>{s.billingMode === "pauschale" ? `${formatEuro(s.priceCents)} im Monat` : `${formatEuro(s.priceCents)} pro Einsatz`}</dd>
                </>
              )}
              <dt className="text-muted">Kalkuliert</dt>
              <dd>{s.plannedMinutes} Minuten pro Einsatz</dd>
              <dt className="text-muted">Stempeln</dt>
              <dd>{s.hasLocation ? <Pill tone="ok">GPS und QR-Code</Pill> : <Pill tone="warn">nur QR-Code</Pill>}</dd>
            </dl>
          </Card>
        ))}
      </div>
      <Card title="Neues Objekt">
        <SiteForm site={emptySite} customers={customers ?? []} showPrices={isOffice} />
      </Card>
    </div>
  );
}
