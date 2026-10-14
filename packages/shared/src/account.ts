import { berlinDate } from "./database";
import { monthRange } from "./hours";
import { workedMinutes } from "./time";

// Arbeitszeitkonto: Soll und Ist je Monat, Urlaub und Krankheit.
// Gerechnet wird mit Arbeitstagen Montag bis Freitag; Feiertage zählen (noch) als Arbeitstag.

export interface AccountAbsence {
  kind: "krank" | "urlaub";
  date_from: string;
  date_to: string;
  approved: boolean | null;
}

export interface AccountEntry {
  clock_in_at: string;
  clock_out_at: string | null;
}

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Arbeitstage (Mo–Fr) von `from` bis `to`, beide eingeschlossen. */
export function weekdaysBetween(from: string, to: string): number {
  let count = 0;
  for (let t = day(from); t <= day(to); t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return count;
}

/** Zählt eine Abwesenheit? Urlaub nur bestätigt, Krankheit auch unbestätigt (nicht abgelehnt). */
export function absenceCounts(a: AccountAbsence): boolean {
  return a.kind === "urlaub" ? a.approved === true : a.approved !== false;
}

/** Arbeitstage einer Art im Zeitraum. Überschneidungen mehrerer Meldungen zählen einmal. */
export function absenceDays(absences: AccountAbsence[], kind: AccountAbsence["kind"], from: string, to: string): number {
  const days = new Set<string>();
  for (const a of absences) {
    if (a.kind !== kind || !absenceCounts(a)) continue;
    const start = Math.max(day(a.date_from), day(from));
    const end = Math.min(day(a.date_to), day(to));
    for (let t = start; t <= end; t += 86_400_000) {
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6) days.add(iso(t));
    }
  }
  return days.size;
}

/** Resturlaub im Kalenderjahr: Anspruch minus bestätigte Urlaubstage (auch geplante). */
export function vacationLeft(entitlement: number, absences: AccountAbsence[], year: number): number {
  return entitlement - absenceDays(absences, "urlaub", `${year}-01-01`, `${year}-12-31`);
}

export interface MonthAccount {
  /** Gestempelte Minuten (nur abgeschlossene Einträge) */
  workedMinutes: number;
  /** Soll bis heute (laufender Monat) bzw. für den ganzen Monat; null ohne Wochenstunden */
  targetMinutes: number | null;
  /** Ist minus Soll; null ohne Wochenstunden */
  balanceMinutes: number | null;
  sickDays: number;
  vacationDays: number;
}

/**
 * Konto eines Monats "YYYY-MM". Im laufenden Monat zählt das Soll nur bis heute.
 * Urlaubs- und Krankheitstage gelten als erfüllt und senken das Soll.
 */
export function monthAccount(input: {
  period: string;
  weeklyHours: number | null;
  entries: AccountEntry[];
  absences: AccountAbsence[];
  today?: string;
}): MonthAccount {
  const { from, to } = monthRange(input.period);
  const today = input.today ?? berlinDate();
  const until = today < to ? today : to;
  const worked = input.entries
    .filter((e) => e.clock_out_at && berlinDate(new Date(e.clock_in_at)).startsWith(input.period))
    .reduce((s, e) => s + workedMinutes({ visitId: "", employeeId: "", clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at! }), 0);
  const sickDays = absenceDays(input.absences, "krank", from, to);
  const vacationDays = absenceDays(input.absences, "urlaub", from, to);
  if (!input.weeklyHours || until < from) {
    return { workedMinutes: worked, targetMinutes: input.weeklyHours ? 0 : null, balanceMinutes: input.weeklyHours ? worked : null, sickDays, vacationDays };
  }
  const workdays = weekdaysBetween(from, until) - absenceDays(input.absences, "krank", from, until) - absenceDays(input.absences, "urlaub", from, until);
  const target = Math.round(Math.max(0, workdays) * (input.weeklyHours / 5) * 60);
  return { workedMinutes: worked, targetMinutes: target, balanceMinutes: worked - target, sickDays, vacationDays };
}

/** Eine Zeile der Monatsliste für den Steuerberater. */
export interface PayrollRow {
  name: string;
  weeklyHours: number | null;
  workedMinutes: number;
  targetMinutes: number | null;
  balanceMinutes: number | null;
  vacationDays: number;
  sickDays: number;
  vacationLeft: number;
}

/** CSV für den Steuerberater (Semikolon, Dezimalkomma, BOM für Excel). */
export function payrollCsv(period: string, rows: PayrollRow[]): string {
  const num = (minutes: number | null) => (minutes === null ? "" : (minutes / 60).toFixed(2).replace(".", ","));
  const plain = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [["Monat", "Mitarbeiter", "Wochenstunden", "Soll (Std.)", "Ist (Std.)", "Differenz (Std.)", "Urlaubstage", "Krankheitstage", "Resturlaub"]];
  for (const r of rows) {
    lines.push([period, r.name, plain(r.weeklyHours), num(r.targetMinutes), num(r.workedMinutes), num(r.balanceMinutes), plain(r.vacationDays), plain(r.sickDays), plain(r.vacationLeft)]);
  }
  return "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}
