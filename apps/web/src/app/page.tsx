import { compareSiteHours, demoMonthHours, demoSites, demoVisitsToday, demoEmployees } from "@gp/shared";
import { Card, PageTitle, Pill, StatusPill } from "@/components/ui";

// Chef-Übersicht. Zahlen sind Beispieldaten, bis die Datenbank angebunden ist.
export default function Overview() {
  const hours = compareSiteHours(
    demoMonthHours.map((h) => ({ siteId: h.siteId, plannedMinutes: h.planned })),
    demoMonthHours.map((h) => ({ siteId: h.siteId, minutes: h.actual })),
  );
  const max = Math.max(...hours.map((h) => Math.max(h.plannedMinutes, h.actualMinutes)));
  const siteName = (id: string) => demoSites.find((s) => s.id === id)?.name ?? id;
  const employeeName = (id: string) => demoEmployees.find((e) => e.id === id)?.name ?? id;
  const done = demoVisitsToday.filter((v) => v.status === "erledigt").length;

  return (
    <>
      <PageTitle note="Beispieldaten">Übersicht</PageTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          ["Umsatz Oktober", "14.860 €", "netto, 8 Objekte"],
          ["Offene Rechnungen", "3.120 €", "2 Kunden, 1 überfällig"],
          ["Stunden diese Woche", "142,5 h", "geplant 136 h"],
          ["Ausfälle heute", "1", "Marco krank, vertreten"],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-surface border border-line rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted">{label}</div>
            <div className="font-display font-extrabold text-2xl mt-1">{value}</div>
            <div className="text-xs text-muted">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card title="Lohnt sich das Objekt?" action={<span className="text-xs text-muted">Balken = echte Stunden, Strich = kalkuliert</span>}>
          <ul className="flex flex-col gap-3">
            {hours.map((h) => (
              <li key={h.siteId} className="grid grid-cols-[minmax(0,1fr)_64px] sm:grid-cols-[180px_minmax(0,1fr)_64px] gap-x-3 gap-y-1 items-center text-sm">
                <span className="truncate">{siteName(h.siteId)}</span>
                <div className="relative h-4 rounded bg-soft col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto">
                  <div className={`h-full rounded ${h.deviationPercent > 10 ? "bg-warn" : "bg-primary"}`} style={{ width: `${(h.actualMinutes / max) * 100}%` }} />
                  <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${(h.plannedMinutes / max) * 100}%` }} />
                </div>
                <span className="justify-self-end">
                  <Pill tone={h.deviationPercent > 10 ? "warn" : "ok"}>
                    {h.deviationPercent > 0 ? "+" : ""}
                    {h.deviationPercent} %
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Heute live" action={<Pill tone="ok">{done} von {demoVisitsToday.length} erledigt</Pill>}>
          <ul className="divide-y divide-line">
            {demoVisitsToday.map((v) => (
              <li key={v.siteId + v.startTime} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{siteName(v.siteId)}</div>
                  <div className="text-xs text-muted">{employeeName(v.employeeId)} · {v.label}</div>
                </div>
                <StatusPill status={v.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
