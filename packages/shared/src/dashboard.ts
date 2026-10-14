import { absenceDays, weekdaysBetween, type AccountAbsence } from "./account";
import { monthRange } from "./hours";
import { entryMinutes, siteProfit, type SiteProfit } from "./profit";
import type { CalcSettings } from "./calculation";
import type { BillingMode, VisitStatus } from "./types";

// Zahlen auf einen Blick (Startseite des Büros) und Warnungen, die die App von selbst erkennt.

export interface DashSite {
  id: string;
  name: string;
  billingMode: BillingMode;
  priceCents: number;
}

export interface DashVisit {
  id: string;
  siteId: string;
  date: string;
  status: VisitStatus;
  plannedMinutes: number;
}

export interface DashEntry {
  visitId: string | null;
  clockInAt: string;
  clockOutAt: string | null;
}

export interface MonthFigures {
  period: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  workedMinutes: number;
  /** Anteil der Krankheitstage an den Arbeitstagen aller Mitarbeiter; null ohne Mitarbeiter */
  sickRatePercent: number | null;
}

/** Die letzten `count` Monate "YYYY-MM" bis einschließlich `period`, älteste zuerst. */
export function lastMonths(period: string, count: number): string[] {
  const [y, m] = period.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - count + i, 1)).toISOString().slice(0, 7));
}

/**
 * Gewinn je Objekt in einem Monat. Zeiten zählen zum Monat ihres Einsatzes.
 * Pauschal-Objekte zählen nur in Monaten, in denen dort gearbeitet wurde oder geplant war.
 */
export function siteProfits(period: string, sites: DashSite[], visits: DashVisit[], entries: DashEntry[], settings: CalcSettings): SiteProfit[] {
  const monthVisits = visits.filter((v) => v.date.startsWith(period) && v.status !== "ausgefallen");
  const siteOfVisit = new Map(monthVisits.map((v) => [v.id, v.siteId]));
  const worked = new Map<string, number>();
  for (const e of entries) {
    const site = e.visitId ? siteOfVisit.get(e.visitId) : undefined;
    if (site) worked.set(site, (worked.get(site) ?? 0) + entryMinutes(e.clockInAt, e.clockOutAt));
  }
  return sites
    .filter((s) => monthVisits.some((v) => v.siteId === s.id))
    .map((s) => {
      const done = monthVisits.filter((v) => v.siteId === s.id && v.status === "erledigt");
      return siteProfit(
        {
          siteId: s.id,
          siteName: s.name,
          billingMode: s.billingMode,
          priceCents: s.priceCents,
          doneVisits: done.length,
          plannedMinutes: done.reduce((sum, v) => sum + v.plannedMinutes, 0),
          workedMinutes: worked.get(s.id) ?? 0,
        },
        settings,
      );
    });
}

/** Umsatz, Kosten, Gewinn, Stunden und Krankenquote je Monat. */
export function monthFigures(input: {
  months: string[];
  sites: DashSite[];
  visits: DashVisit[];
  entries: DashEntry[];
  settings: CalcSettings;
  absences: (AccountAbsence & { employee_id: string })[];
  staff: number;
  today: string;
}): MonthFigures[] {
  return input.months.map((period) => {
    const profits = siteProfits(period, input.sites, input.visits, input.entries, input.settings);
    const revenue = profits.reduce((s, p) => s + p.revenueCents, 0);
    const cost = profits.reduce((s, p) => s + p.costCents, 0);
    const monthVisitIds = new Set(input.visits.filter((v) => v.date.startsWith(period)).map((v) => v.id));
    const worked = input.entries.filter((e) => e.visitId && monthVisitIds.has(e.visitId)).reduce((s, e) => s + entryMinutes(e.clockInAt, e.clockOutAt), 0);
    const { from, to } = monthRange(period);
    const until = input.today < to ? input.today : to;
    const workdays = until < from ? 0 : weekdaysBetween(from, until);
    const sick = until < from ? 0 : sickDaysAll(input.absences, from, until);
    return {
      period,
      revenueCents: revenue,
      costCents: cost,
      profitCents: revenue - cost,
      workedMinutes: worked,
      sickRatePercent: input.staff && workdays ? Math.round((sick / (input.staff * workdays)) * 1000) / 10 : null,
    };
  });
}

/** Krankheitstage aller Mitarbeiter in einem Zeitraum (je Person gezählt). */
export function sickDaysAll(absences: (AccountAbsence & { employee_id: string })[], from: string, to: string): number {
  const byEmployee = new Map<string, AccountAbsence[]>();
  for (const a of absences) byEmployee.set(a.employee_id, [...(byEmployee.get(a.employee_id) ?? []), a]);
  let total = 0;
  for (const list of byEmployee.values()) total += absenceDays(list, "krank", from, to);
  return total;
}

// Warnungen -----------------------------------------------------------------------------

export type WarningKind = "verlust" | "nicht_gestempelt" | "nicht_ausgestempelt" | "ueberstunden" | "material" | "tausch";

export interface AppWarning {
  kind: WarningKind;
  title: string;
  detail: string;
  href: string;
}

/** Ab so vielen Plusstunden im Monat warnt die App. */
export const OVERTIME_WARN_MINUTES = 10 * 60;
/** Nach so vielen Minuten ohne Einstempeln gilt ein Einsatz als nicht gestempelt. */
export const NOT_CLOCKED_AFTER_MINUTES = 60;
/** Nach so vielen Stunden eingestempelt gilt das Ausstempeln als vergessen. */
export const OPEN_ENTRY_HOURS = 12;

const euro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateDe = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".") + ".";

export function buildWarnings(input: {
  /** Objekte mit Verlust (abgeschlossener Vormonat und laufender Monat) */
  losses: { siteId: string; siteName: string; profitCents: number; monthLabel: string }[];
  /** Einsätze der letzten Tage, die geplant, aber nie begonnen wurden */
  unstarted: { visitId: string; siteName: string; employeeName: string; date: string; startTime: string }[];
  /** Noch offene Zeiteinträge */
  openEntries: { entryId: string; employeeName: string; siteName: string; clockInAt: string }[];
  overtime: { employeeId: string; employeeName: string; balanceMinutes: number }[];
  /** Material, das als knapp oder fehlend gemeldet ist */
  material?: { siteId: string; siteName: string; name: string; status: "wenig" | "fehlt" }[];
  /** Tauschanfragen, die ein Kollege übernommen hat und die auf Bestätigung warten */
  swaps?: { siteName: string; date: string; from: string; to: string }[];
  /** Jetzt in deutscher Zeit, "YYYY-MM-DDTHH:MM" */
  nowBerlin: string;
  now?: Date;
}): AppWarning[] {
  const warnings: AppWarning[] = [];
  const [today, nowTime] = input.nowBerlin.split("T");
  for (const l of input.losses) {
    warnings.push({ kind: "verlust", title: `${l.siteName} macht Verlust`, detail: `${l.monthLabel}: ${euro(l.profitCents)}. Preis oder Stunden prüfen.`, href: `/auswertung` });
  }
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  for (const v of input.unstarted) {
    const late = v.date < today || (v.date === today && minutes(nowTime) - minutes(v.startTime) >= NOT_CLOCKED_AFTER_MINUTES);
    if (!late) continue;
    warnings.push({
      kind: "nicht_gestempelt",
      title: `Nicht gestempelt: ${v.siteName}`,
      detail: `${v.employeeName}, ${v.date === today ? "heute" : dateDe(v.date)} ab ${v.startTime.slice(0, 5)} Uhr`,
      href: `/planung`,
    });
  }
  const now = (input.now ?? new Date()).getTime();
  for (const e of input.openEntries) {
    if (now - new Date(e.clockInAt).getTime() < OPEN_ENTRY_HOURS * 3_600_000) continue;
    warnings.push({ kind: "nicht_ausgestempelt", title: `Ausstempeln vergessen: ${e.employeeName}`, detail: `${e.siteName}, eingestempelt seit über ${OPEN_ENTRY_HOURS} Stunden`, href: `/stunden` });
  }
  for (const o of input.overtime) {
    if (o.balanceMinutes < OVERTIME_WARN_MINUTES) continue;
    const h = (o.balanceMinutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });
    warnings.push({ kind: "ueberstunden", title: `Überstunden: ${o.employeeName}`, detail: `+${h} Std. in diesem Monat`, href: `/mitarbeiter/${o.employeeId}` });
  }
  // Material je Objekt zusammenfassen, damit fünf leere Sachen nicht fünf Zeilen werden.
  const bySite = new Map<string, { siteName: string; names: string[]; missing: boolean }>();
  for (const m of input.material ?? []) {
    const entry = bySite.get(m.siteId) ?? { siteName: m.siteName, names: [], missing: false };
    entry.names.push(m.status === "fehlt" ? m.name : `${m.name} (knapp)`);
    entry.missing ||= m.status === "fehlt";
    bySite.set(m.siteId, entry);
  }
  for (const [siteId, m] of bySite) {
    warnings.push({ kind: "material", title: `${m.missing ? "Material fehlt" : "Material wird knapp"}: ${m.siteName}`, detail: m.names.join(", "), href: `/objekte/${siteId}#material` });
  }
  for (const s of input.swaps ?? []) {
    warnings.push({ kind: "tausch", title: `Schichttausch bestätigen: ${s.siteName}`, detail: `${s.to} übernimmt von ${s.from}, ${dateDe(s.date)}`, href: `/planung/tausch` });
  }
  return warnings;
}
