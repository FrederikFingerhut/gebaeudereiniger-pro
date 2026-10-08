import { berlinDate } from "./database";
import { workedMinutes } from "./time";

// Monatsübersicht der Stunden für die Lohnabrechnung: je Mitarbeiter und Objekt
// die geplante Zeit (Einsätze) neben der gestempelten Zeit.

export interface PlannedVisit {
  employeeId: string;
  siteId: string;
  date: string; // YYYY-MM-DD
  plannedMinutes: number;
  /** Ausgefallene Einsätze zählen nicht als geplant. */
  cancelled?: boolean;
}

export interface StampedEntry {
  employeeId: string;
  /** Objekt des Einsatzes; null, wenn ohne Einsatz gestempelt */
  siteId: string | null;
  clockInAt: string;
  /** Noch eingestempelt: zählt erst nach dem Ausstempeln. */
  clockOutAt: string | null;
}

export interface HoursRow {
  employeeId: string;
  siteId: string | null;
  visits: number;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface EmployeeHours {
  employeeId: string;
  rows: HoursRow[];
  plannedMinutes: number;
  actualMinutes: number;
  /** Tage mit gestempelter Zeit */
  days: number;
  /** Einträge, die noch laufen und nicht mitgezählt sind */
  open: number;
}

/** Erster und letzter Tag eines Monats "YYYY-MM". */
export function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  return { from: `${period}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Summiert einen Monat. Gestempelte Zeit zählt zum Tag des Einstempelns (deutsche Zeit). */
export function monthlyHours(period: string, planned: PlannedVisit[], entries: StampedEntry[]): EmployeeHours[] {
  const byEmployee = new Map<string, { rows: Map<string, HoursRow>; days: Set<string>; open: number }>();
  const employee = (id: string) => {
    let e = byEmployee.get(id);
    if (!e) byEmployee.set(id, (e = { rows: new Map(), days: new Set(), open: 0 }));
    return e;
  };
  const row = (employeeId: string, siteId: string | null) => {
    const rows = employee(employeeId).rows;
    const key = siteId ?? "";
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { employeeId, siteId, visits: 0, plannedMinutes: 0, actualMinutes: 0 }));
    return r;
  };

  for (const v of planned) {
    if (v.cancelled || !v.date.startsWith(period)) continue;
    const r = row(v.employeeId, v.siteId);
    r.visits += 1;
    r.plannedMinutes += v.plannedMinutes;
  }
  for (const e of entries) {
    const day = berlinDate(new Date(e.clockInAt));
    if (!day.startsWith(period)) continue;
    if (!e.clockOutAt) {
      employee(e.employeeId).open += 1;
      continue;
    }
    row(e.employeeId, e.siteId).actualMinutes += workedMinutes({ visitId: "", employeeId: e.employeeId, clockInAt: e.clockInAt, clockOutAt: e.clockOutAt });
    employee(e.employeeId).days.add(day);
  }

  return [...byEmployee.entries()].map(([employeeId, e]) => {
    const rows = [...e.rows.values()];
    return {
      employeeId,
      rows,
      plannedMinutes: rows.reduce((s, r) => s + r.plannedMinutes, 0),
      actualMinutes: rows.reduce((s, r) => s + r.actualMinutes, 0),
      days: e.days.size,
      open: e.open,
    };
  });
}

/** Stunden mit Komma, wie Excel und Lohnbüro sie erwarten: 90 → "1,50". */
export function decimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2).replace(".", ",");
}

/**
 * CSV für die Lohnabrechnung (Semikolon, Dezimalkomma, BOM für Umlaute in Excel).
 * Pro Objekt eine Zeile und je Mitarbeiter eine Summenzeile.
 */
export function hoursCsv(
  period: string,
  employees: EmployeeHours[],
  names: { employee: (id: string) => string; site: (id: string | null) => string },
): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Monat", "Mitarbeiter", "Objekt", "Einsätze", "Geplant (Std.)", "Gestempelt (Std.)", "Differenz (Std.)"]];
  const sorted = [...employees].sort((a, b) => names.employee(a.employeeId).localeCompare(names.employee(b.employeeId), "de"));
  for (const e of sorted) {
    const name = names.employee(e.employeeId);
    const rows = [...e.rows].sort((a, b) => names.site(a.siteId).localeCompare(names.site(b.siteId), "de"));
    for (const r of rows) {
      lines.push([period, name, names.site(r.siteId), String(r.visits), decimalHours(r.plannedMinutes), decimalHours(r.actualMinutes), decimalHours(r.actualMinutes - r.plannedMinutes)]);
    }
    const visits = e.rows.reduce((s, r) => s + r.visits, 0);
    lines.push([period, name, "Summe", String(visits), decimalHours(e.plannedMinutes), decimalHours(e.actualMinutes), decimalHours(e.actualMinutes - e.plannedMinutes)]);
  }
  return "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}
