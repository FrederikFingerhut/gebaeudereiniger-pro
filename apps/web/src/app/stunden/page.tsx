import { Suspense } from "react";
import { berlinDate, monthLabel } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { hours } from "@/lib/format";
import { loadMonthHours, periodFrom } from "@/lib/hours";
import { requireMe } from "@/lib/supabase";
import { Skeleton } from "@/components/skeleton";

export default function HoursPage({ searchParams }: PageProps<"/stunden">) {
  return (
    <>
      <PageTitle note="Geplante Zeit aus dem Einsatzplan neben der gestempelten Zeit. Die Liste lässt sich fürs Lohnbüro herunterladen.">Stunden</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Hours searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Diff({ planned, actual }: { planned: number; actual: number }) {
  const diff = actual - planned;
  if (!planned && !actual) return null;
  const text = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${hours(Math.abs(diff))}`;
  return <Pill tone={planned && diff > planned * 0.1 ? "warn" : "muted"}>{text}</Pill>;
}

async function Hours({ searchParams }: { searchParams: PageProps<"/stunden">["searchParams"] }) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Die Stundenübersicht sehen nur Büro und Chef.</p></Card>;

  const period = periodFrom((await searchParams).monat, berlinDate().slice(0, 7));
  const { employees, employeeName, siteName } = await loadMonthHours(supabase, period);
  const [y, m] = period.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const open = employees.reduce((s, e) => s + e.open, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/stunden?monat=${prev}`}>‹</a>
        <span className="font-display text-lg">{monthLabel(period)}</span>
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/stunden?monat=${next}`}>›</a>
        <a className="ml-auto rounded-lg bg-primary text-on-primary px-3 py-1.5" href={`/stunden/csv?monat=${period}`} download>
          Liste herunterladen (Excel)
        </a>
      </div>
      {open > 0 && <p className="text-sm text-warn">{open === 1 ? "Ein Einsatz läuft" : `${open} Einsätze laufen`} noch und zählt erst nach dem Ausstempeln.</p>}
      {employees.length === 0 && <p className="text-sm text-muted">In diesem Monat gibt es keine Einsätze und keine gestempelten Zeiten.</p>}
      {employees.map((e) => (
        <Card
          key={e.employeeId}
          title={employeeName(e.employeeId)}
          action={
            <span className="text-sm">
              <b>{hours(e.actualMinutes)}</b> <span className="text-muted">von {hours(e.plannedMinutes)} geplant · {e.days} Tage</span>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-semibold">Objekt</th>
                  <th className="py-1 font-semibold text-right">Einsätze</th>
                  <th className="py-1 font-semibold text-right">Geplant</th>
                  <th className="py-1 font-semibold text-right">Gestempelt</th>
                  <th className="py-1 font-semibold text-right">Differenz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...e.rows]
                  .sort((a, b) => siteName(a.siteId).localeCompare(siteName(b.siteId), "de"))
                  .map((r) => (
                    <tr key={r.siteId ?? ""}>
                      <td className="py-1.5 pr-3">{siteName(r.siteId)}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.visits}</td>
                      <td className="py-1.5 text-right tabular-nums">{hours(r.plannedMinutes)}</td>
                      <td className="py-1.5 text-right tabular-nums">{hours(r.actualMinutes)}</td>
                      <td className="py-1.5 text-right">
                        <Diff planned={r.plannedMinutes} actual={r.actualMinutes} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
