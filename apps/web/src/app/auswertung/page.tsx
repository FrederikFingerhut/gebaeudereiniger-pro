import { Suspense } from "react";
import Link from "next/link";
import {
  addDays,
  berlinDate,
  defaultCalcSettings,
  entryMinutes,
  formatEuro,
  monthLabel,
  siteProfit,
  type BillingMode,
  type CalcSettings,
  type ProfitRating,
} from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { periodRange } from "@/lib/invoices";

export default function ProfitPage({ searchParams }: PageProps<"/auswertung">) {
  return (
    <>
      <PageTitle note="Umsatz je Objekt minus Personalkosten aus den gestempelten Zeiten, mit Lohn und Zuschlägen aus der Kalkulation.">Gewinn pro Objekt</PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <Profit searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const ratingLabel: Record<ProfitRating, { label: string; tone: "ok" | "warn" | "bad" }> = {
  gut: { label: "lohnt sich", tone: "ok" },
  knapp: { label: "knapp", tone: "warn" },
  verlust: { label: "zahlt drauf", tone: "bad" },
};

async function Profit({ searchParams }: { searchParams: PageProps<"/auswertung">["searchParams"] }) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Die Auswertung sehen nur Büro und Chef.</p></Card>;

  const params = await searchParams;
  const period = typeof params.monat === "string" && /^\d{4}-\d{2}$/.test(params.monat) ? params.monat : berlinDate().slice(0, 7);
  const { from, to } = periodRange(period);
  const [y, m] = period.split("-").map(Number);

  const [{ data: sites }, { data: visits }, { data: entries }, { data: settingsRow }] = await Promise.all([
    supabase.from("sites").select("id, name, site_billing(billing_mode, price_cents)").eq("active", true).order("name"),
    supabase.from("visits").select("id, site_id, status, planned_minutes").gte("date", from).lte("date", to),
    supabase.from("time_entries").select("visit_id, clock_in_at, clock_out_at").gte("clock_in_at", addDays(from, -1)).lte("clock_in_at", addDays(to, 2)),
    supabase.from("calc_settings").select("*").maybeSingle(),
  ]);
  const settings: CalcSettings = settingsRow
    ? {
        wageCents: settingsRow.wage_cents,
        ancillaryPercent: Number(settingsRow.ancillary_percent),
        materialPercent: Number(settingsRow.material_percent),
        overheadPercent: Number(settingsRow.overhead_percent),
        profitPercent: Number(settingsRow.profit_percent),
      }
    : defaultCalcSettings;

  // Nur Zeiten zu Einsätzen dieses Monats zählen; der Zeitraum oben ist bewusst etwas weiter.
  const siteOfVisit = new Map((visits ?? []).map((v) => [v.id, v.site_id]));
  const worked = new Map<string, number>();
  for (const e of entries ?? []) {
    const site = e.visit_id ? siteOfVisit.get(e.visit_id) : undefined;
    if (site) worked.set(site, (worked.get(site) ?? 0) + entryMinutes(e.clock_in_at, e.clock_out_at));
  }

  const rows = (sites ?? [])
    .map((s) => {
      const billing = (Array.isArray(s.site_billing) ? s.site_billing[0] : s.site_billing) as { billing_mode: BillingMode; price_cents: number } | null;
      const done = (visits ?? []).filter((v) => v.site_id === s.id && v.status === "erledigt");
      return siteProfit(
        {
          siteId: s.id,
          siteName: s.name,
          billingMode: billing?.billing_mode ?? "pauschale",
          priceCents: billing?.price_cents ?? 0,
          doneVisits: done.length,
          plannedMinutes: done.reduce((sum, v) => sum + v.planned_minutes, 0),
          workedMinutes: worked.get(s.id) ?? 0,
        },
        settings,
      );
    })
    .filter((r) => r.revenueCents > 0 || r.hours > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent);

  const sum = (key: "revenueCents" | "costCents" | "profitCents") => rows.reduce((acc, r) => acc + r[key], 0);
  const revenue = sum("revenueCents");
  const profit = sum("profitCents");
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.profitCents)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/auswertung?monat=${prev}`}>‹</Link>
        <span className="font-display text-lg">{monthLabel(period)}</span>
        <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/auswertung?monat=${next}`}>›</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Umsatz", formatEuro(revenue)],
          ["Personal und Material", formatEuro(sum("costCents"))],
          ["Gewinn", formatEuro(profit)],
          ["Marge", revenue ? `${((profit / revenue) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` : "–"],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface border border-line rounded-2xl p-4">
            <div className="text-xs text-muted font-semibold">{label}</div>
            <div className={`font-display font-bold text-2xl tabular-nums ${label === "Gewinn" && profit < 0 ? "text-bad" : ""}`}>{value}</div>
          </div>
        ))}
      </div>

      <Card title="Objekte, schwächste zuerst">
        {rows.length === 0 && <p className="text-sm text-muted">Für diesen Monat gibt es noch keine Preise oder Einsätze.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-semibold">Objekt</th>
                <th className="py-2 px-2 font-semibold text-right">Umsatz</th>
                <th className="py-2 px-2 font-semibold text-right">Stunden</th>
                <th className="py-2 px-2 font-semibold text-right">€ je Std.</th>
                <th className="py-2 px-2 font-semibold text-right">Gewinn</th>
                <th className="py-2 pl-2 font-semibold w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.siteId}>
                  <td className="py-2 pr-3">
                    <Link href={`/objekte/${r.siteId}`} className="font-semibold hover:underline">{r.siteName}</Link>
                    <div className="mt-0.5"><Pill tone={ratingLabel[r.rating].tone}>{ratingLabel[r.rating].label}</Pill></div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatEuro(r.revenueCents)}</td>
                  <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                    {r.hours.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                    {r.estimated && <span className="text-muted" title="Nicht gestempelt, Planzeit genommen"> *</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.hours ? formatEuro(r.revenueCentsPerHour) : "–"}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${r.profitCents < 0 ? "text-bad" : ""}`}>
                    {formatEuro(r.profitCents)}
                    <div className="text-[11px] font-normal text-muted">{r.marginPercent.toLocaleString("de-DE")} %</div>
                  </td>
                  <td className="py-2 pl-2">
                    <div className="h-2 rounded-full bg-soft overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${r.rating === "verlust" ? "bg-bad" : r.rating === "knapp" ? "bg-warn" : "bg-ok"}`}
                        style={{ width: `${Math.round((Math.abs(r.profitCents) / maxAbs) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">
          Kosten je Stunde: Lohn {formatEuro(settings.wageCents)} plus {settings.ancillaryPercent} % Lohnnebenkosten, {settings.materialPercent} % Material und {settings.overheadPercent} % Gemeinkosten.
          Ändern in der <Link href="/kalkulation" className="underline">Kalkulation</Link>. * = nicht gestempelt, Planzeit genommen.
        </p>
      </Card>
    </div>
  );
}
