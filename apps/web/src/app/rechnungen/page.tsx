import { Suspense } from "react";
import { berlinDate, buildInvoiceDrafts, monthLabel, siteFromRow, visitFromRow, type SiteRow, type VisitRow } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { InvoiceList } from "./invoice-list";

export default function InvoicesPage({ searchParams }: PageProps<"/rechnungen">) {
  return (
    <>
      <PageTitle note="Die App berechnet die Entwürfe aus Pauschalen, erledigten Einsätzen und Sonderleistungen. Schreiben, versenden und mahnen macht weiter Lexoffice.">
        Rechnungen
      </PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <Invoices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Invoices({ searchParams }: { searchParams: PageProps<"/rechnungen">["searchParams"] }) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Rechnungen sehen nur Büro und Chef.</p></Card>;

  const params = await searchParams;
  const period = typeof params.monat === "string" && /^\d{4}-\d{2}$/.test(params.monat) ? params.monat : berlinDate().slice(0, 7);
  const from = `${period}-01`;
  const [y, m] = period.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [{ data: siteRows }, { data: visitRows }, { data: extras }, { data: customers }] = await Promise.all([
    supabase.from("sites").select("*, site_billing(billing_mode, price_cents)").eq("active", true),
    supabase.from("visits").select("*").eq("status", "erledigt").gte("date", from).lte("date", to),
    supabase.from("extra_services").select("site_id, date, description, price_cents").gte("date", from).lte("date", to),
    supabase.from("customers").select("id, name"),
  ]);
  const drafts = buildInvoiceDrafts(
    period,
    ((siteRows ?? []) as unknown as SiteRow[]).map(siteFromRow).filter((s) => s.priceCents > 0),
    ((visitRows ?? []) as VisitRow[]).map(visitFromRow),
    (extras ?? []).map((e) => ({ siteId: e.site_id, date: e.date, description: e.description, priceCents: e.price_cents })),
  ).map((d) => ({ ...d, customerName: customers?.find((c) => c.id === d.customerId)?.name ?? "" }));

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/rechnungen?monat=${prev}`}>‹</a>
        <span className="font-display text-lg">{monthLabel(period)}</span>
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/rechnungen?monat=${next}`}>›</a>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted">Keine Entwürfe: Hinterlege bei den Objekten einen Preis.</p>
      ) : (
        <InvoiceList drafts={drafts} />
      )}
    </div>
  );
}
