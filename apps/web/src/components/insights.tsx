import Link from "next/link";
import { formatEuro, monthLabel, type AppWarning, type MonthFigures } from "@gp/shared";
import { Card, Pill } from "@/components/ui";
import { hours } from "@/lib/format";
import { loadInsights } from "@/lib/insights";
import { requireMe } from "@/lib/supabase";

const warningTone: Record<AppWarning["kind"], { label: string; tone: "bad" | "warn" }> = {
  verlust: { label: "Geld", tone: "bad" },
  nicht_gestempelt: { label: "Stempeln", tone: "warn" },
  nicht_ausgestempelt: { label: "Stempeln", tone: "warn" },
  ueberstunden: { label: "Stunden", tone: "warn" },
  material: { label: "Material", tone: "warn" },
  tausch: { label: "Tausch", tone: "warn" },
};

/** Warnungen und „Zahlen auf einen Blick“ auf der Startseite (lädt getrennt von der Übersicht). */
export async function Insights() {
  const { supabase, isOffice, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return null;
  return <InsightsView {...await loadInsights(supabase, isOffice)} />;
}

export function InsightsView({ warnings, figures }: { warnings: AppWarning[]; figures: MonthFigures[] | null }) {
  return (
    <div className="flex flex-col gap-4 mb-4">
      <Card title="Warnungen" action={warnings.length ? <Pill tone="warn">{warnings.length}</Pill> : <Pill tone="ok">alles im Lot</Pill>}>
        {warnings.length === 0 && <p className="text-sm text-muted">Keine Verlust-Objekte, keine vergessenen Einsätze, keine auffälligen Überstunden, kein fehlendes Material.</p>}
        <ul className="divide-y divide-line">
          {warnings.map((w, i) => (
            <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{w.title}</div>
                <div className="text-xs text-muted">{w.detail}</div>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                <Pill tone={warningTone[w.kind].tone}>{warningTone[w.kind].label}</Pill>
                <Link href={w.href} className="rounded-lg bg-soft px-3 py-1.5 font-semibold">
                  Ansehen
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {figures && <Figures figures={figures} />}
    </div>
  );
}

const shortMonth = (period: string) => monthLabel(period).slice(0, 3);
const euroShort = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (n: number | null) => (n === null ? "–" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

function Figures({ figures }: { figures: MonthFigures[] }) {
  const current = figures[figures.length - 1];
  const charts = [
    { title: "Umsatz", values: figures.map((f) => f.revenueCents), format: euroShort, hero: formatEuro(current.revenueCents) },
    { title: "Gewinn", values: figures.map((f) => f.profitCents), format: euroShort, hero: formatEuro(current.profitCents) },
    { title: "Gearbeitete Stunden", values: figures.map((f) => f.workedMinutes), format: hours, hero: hours(current.workedMinutes) },
    { title: "Krankenquote", values: figures.map((f) => f.sickRatePercent ?? 0), format: (n: number) => percent(n), hero: percent(current.sickRatePercent) },
  ];
  return (
    <Card title="Zahlen auf einen Blick" action={<Link href="/auswertung" className="text-sm font-semibold text-muted hover:underline">Gewinn je Objekt ›</Link>}>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {charts.map((c) => (
          <figure key={c.title} className="min-w-0">
            <figcaption className="text-[11px] uppercase tracking-wider font-semibold text-muted">{c.title}</figcaption>
            <div className={`font-display font-extrabold text-xl tabular-nums ${c.title === "Gewinn" && current.profitCents < 0 ? "text-bad" : ""}`}>{c.hero}</div>
            <div className="text-xs text-muted mb-2">{monthLabel(current.period)} bis heute</div>
            <MiniBars labels={figures.map((f) => shortMonth(f.period))} values={c.values} format={c.format} title={c.title} />
          </figure>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted font-semibold">Als Tabelle</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm min-w-[32rem]">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-semibold">Monat</th>
                <th className="py-1 font-semibold text-right">Umsatz</th>
                <th className="py-1 font-semibold text-right">Kosten</th>
                <th className="py-1 font-semibold text-right">Gewinn</th>
                <th className="py-1 font-semibold text-right">Stunden</th>
                <th className="py-1 font-semibold text-right">Krankenquote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {figures.map((f) => (
                <tr key={f.period}>
                  <td className="py-1">{monthLabel(f.period)}</td>
                  <td className="py-1 text-right tabular-nums">{formatEuro(f.revenueCents)}</td>
                  <td className="py-1 text-right tabular-nums">{formatEuro(f.costCents)}</td>
                  <td className={`py-1 text-right tabular-nums ${f.profitCents < 0 ? "text-bad" : ""}`}>{formatEuro(f.profitCents)}</td>
                  <td className="py-1 text-right tabular-nums">{hours(f.workedMinutes)}</td>
                  <td className="py-1 text-right tabular-nums">{percent(f.sickRatePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs text-muted mt-2">Umsatz aus Pauschalen und erledigten Einsätzen der Objekte, an denen im Monat gearbeitet wurde. Kosten aus gestempelten Stunden mit den Sätzen der Kalkulation.</p>
    </Card>
  );
}

/** Kleines Säulendiagramm über sechs Monate; negative Werte zeigen nach unten. Werte beim Darüberfahren. */
function MiniBars({ labels, values, format, title }: { labels: string[]; values: number[]; format: (n: number) => string; title: string }) {
  const w = 240;
  const h = 96;
  const labelH = 16;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotH = h - labelH;
  const zero = (max / span) * plotH;
  const slot = w / values.length;
  const bar = Math.min(26, slot - 10);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label={`${title} der letzten ${values.length} Monate`}>
      <line x1={0} x2={w} y1={zero} y2={zero} className="stroke-line" strokeWidth={1} />
      {values.map((v, i) => {
        const height = Math.max(v === 0 ? 0 : 2, (Math.abs(v) / span) * plotH);
        const x = i * slot + (slot - bar) / 2;
        const y = v >= 0 ? zero - height : zero;
        const last = i === values.length - 1;
        return (
          <g key={i}>
            <title>{`${labels[i]}: ${format(v)}`}</title>
            {/* Großzügige Fläche zum Darüberfahren, unsichtbar */}
            <rect x={i * slot} y={0} width={slot} height={plotH} fill="transparent" />
            <rect x={x} y={y} width={bar} height={height} rx={4} className={v < 0 ? "fill-bad" : last ? "fill-primary" : "fill-primary/45"} />
            <text x={i * slot + slot / 2} y={h - 3} textAnchor="middle" className={`text-[10px] ${last ? "fill-ink font-semibold" : "fill-muted"}`}>
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
