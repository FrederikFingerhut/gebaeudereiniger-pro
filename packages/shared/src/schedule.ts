import type { Visit, VisitSeries } from "./types";

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO-Wochentag (1 = Montag … 7 = Sonntag) */
export function isoWeekday(date: string): number {
  const wd = parseDate(date).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Erzeugt aus wiederkehrenden Einsätzen die konkreten Einsätze im Zeitraum
 * [from, to] (beide inklusive). Bereits vorhandene Einsätze (gleiche Serie und
 * gleiches Datum) werden übersprungen, damit man die Funktion beliebig oft
 * laufen lassen kann.
 */
export function expandSeries(
  series: VisitSeries[],
  from: string,
  to: string,
  existing: Pick<Visit, "seriesId" | "date">[] = [],
): Visit[] {
  const taken = new Set(existing.map((v) => `${v.seriesId}|${v.date}`));
  const out: Visit[] = [];
  const end = parseDate(to);
  for (const s of series) {
    const start = parseDate(from > s.validFrom ? from : s.validFrom);
    const last = s.validUntil && s.validUntil < to ? parseDate(s.validUntil) : end;
    for (let d = start; d <= last; d = new Date(d.getTime() + 86_400_000)) {
      const date = formatDate(d);
      if (!s.weekdays.includes(isoWeekday(date))) continue;
      if (taken.has(`${s.id}|${date}`)) continue;
      out.push({
        siteId: s.siteId,
        employeeId: s.employeeId,
        seriesId: s.id,
        date,
        startTime: s.startTime,
        plannedMinutes: s.plannedMinutes,
        status: "geplant",
      });
    }
  }
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
