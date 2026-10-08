import { demoEmployees, demoSeries, demoSites, expandSeries } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";

const WEEK = { from: "2026-10-12", to: "2026-10-16" };
const DAYS = ["Mo 12.", "Di 13.", "Mi 14.", "Do 15.", "Fr 16."];

export default function Planning() {
  const visits = expandSeries(demoSeries, WEEK.from, WEEK.to);
  const dates = [...new Set(visits.map((v) => v.date))].sort();
  const initials = (id: string) => demoEmployees.find((e) => e.id === id)?.name.slice(0, 2).toUpperCase() ?? "?";

  return (
    <>
      <PageTitle note="Wird automatisch aus den wiederkehrenden Einsätzen erzeugt (Beispieldaten)">Einsatzplan</PageTitle>
      <Card title="Woche 12. bis 16. Oktober">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-semibold">Objekt</th>
                {DAYS.map((d) => (
                  <th key={d} className="py-2 px-2 font-semibold">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {demoSites.map((site) => (
                <tr key={site.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{site.name}</td>
                  {dates.map((date) => {
                    const v = visits.filter((x) => x.siteId === site.id && x.date === date);
                    return (
                      <td key={date} className="py-2 px-2">
                        <div className="flex gap-1">
                          {v.map((x) => (
                            <span key={x.seriesId} title={`${x.startTime} Uhr`} className="inline-grid place-items-center size-8 rounded-full bg-soft text-[11px] font-bold">
                              {initials(x.employeeId)}
                            </span>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
