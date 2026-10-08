import type { TimeEntry } from "./types";

/** Gearbeitete Minuten eines Zeiteintrags (laufende Einträge bis `now`). */
export function workedMinutes(entry: TimeEntry, now: Date = new Date()): number {
  const start = new Date(entry.clockInAt).getTime();
  const end = entry.clockOutAt ? new Date(entry.clockOutAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

export interface SiteHours {
  siteId: string;
  plannedMinutes: number;
  actualMinutes: number;
  /** Abweichung in Prozent, positiv = länger als kalkuliert */
  deviationPercent: number;
}

/**
 * Vergleicht kalkulierte mit echten Stunden pro Objekt.
 * Grundlage für die Chef-Ansicht „Lohnt sich das Objekt?“.
 */
export function compareSiteHours(
  planned: { siteId: string; plannedMinutes: number }[],
  actual: { siteId: string; minutes: number }[],
): SiteHours[] {
  const map = new Map<string, SiteHours>();
  for (const p of planned) {
    const row = map.get(p.siteId) ?? { siteId: p.siteId, plannedMinutes: 0, actualMinutes: 0, deviationPercent: 0 };
    row.plannedMinutes += p.plannedMinutes;
    map.set(p.siteId, row);
  }
  for (const a of actual) {
    const row = map.get(a.siteId) ?? { siteId: a.siteId, plannedMinutes: 0, actualMinutes: 0, deviationPercent: 0 };
    row.actualMinutes += a.minutes;
    map.set(a.siteId, row);
  }
  for (const row of map.values()) {
    row.deviationPercent = row.plannedMinutes
      ? Math.round((row.actualMinutes / row.plannedMinutes - 1) * 100)
      : 0;
  }
  return [...map.values()];
}
