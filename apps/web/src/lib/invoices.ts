import { buildInvoiceDrafts, siteFromRow, visitFromRow, type InvoiceDraft, type SiteRow, type VisitRow } from "@gp/shared";
import type { db } from "./supabase";

export type Draft = InvoiceDraft & { customerName: string };

export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { from: `${period}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Rechnungsentwürfe eines Monats aus Pauschalen, erledigten Einsätzen und Sonderleistungen. */
export async function loadDrafts(supabase: Awaited<ReturnType<typeof db>>, period: string): Promise<Draft[]> {
  const { from, to } = periodRange(period);
  const [{ data: siteRows }, { data: visitRows }, { data: extras }, { data: customers }] = await Promise.all([
    supabase.from("sites").select("*, site_billing(billing_mode, price_cents)").eq("active", true),
    supabase.from("visits").select("*").eq("status", "erledigt").gte("date", from).lte("date", to),
    supabase.from("extra_services").select("site_id, date, description, price_cents").gte("date", from).lte("date", to),
    supabase.from("customers").select("id, name"),
  ]);
  return buildInvoiceDrafts(
    period,
    ((siteRows ?? []) as unknown as SiteRow[]).map(siteFromRow).filter((s) => s.priceCents > 0),
    ((visitRows ?? []) as VisitRow[]).map(visitFromRow),
    (extras ?? []).map((e) => ({ siteId: e.site_id, date: e.date, description: e.description, priceCents: e.price_cents })),
  ).map((d) => ({ ...d, customerName: customers?.find((c) => c.id === d.customerId)?.name ?? "" }));
}
