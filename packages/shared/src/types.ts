// Gemeinsame Datentypen für Handy-App, Büro-Web und Datenbank.
// Spiegeln die Tabellen in supabase/migrations wider.

export type Role = "mitarbeiter" | "objektleiter" | "buero" | "chef" | "kunde";
export type Language = "de" | "en" | "ru" | "uk";
export type VisitStatus = "geplant" | "laeuft" | "erledigt" | "ausgefallen";
export type ReportKind = "problem" | "material" | "reklamation";
export type BillingMode = "pauschale" | "pro_einsatz";

export interface Site {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  address: string;
  accessNotes?: string;
  contact?: string;
  specialNotes?: string;
  billingMode: BillingMode;
  /** Monatspauschale oder Preis pro Einsatz, netto in Cent */
  priceCents: number;
  /** Kalkulierte Minuten pro Einsatz */
  plannedMinutes: number;
}

/** Wiederkehrender Einsatz, z. B. Mo/Mi/Fr um 6 Uhr */
export interface VisitSeries {
  id: string;
  siteId: string;
  employeeId: string;
  /** ISO-Wochentage: 1 = Montag … 7 = Sonntag */
  weekdays: number[];
  startTime: string; // "06:00"
  plannedMinutes: number;
  validFrom: string; // "2026-10-01"
  validUntil?: string;
}

export interface Visit {
  id?: string;
  siteId: string;
  employeeId: string;
  seriesId?: string;
  date: string; // "2026-10-12"
  startTime: string;
  plannedMinutes: number;
  status: VisitStatus;
}

export interface TimeEntry {
  visitId: string;
  employeeId: string;
  clockInAt: string; // ISO-Zeitstempel
  clockOutAt?: string;
}

export interface ExtraService {
  siteId: string;
  date: string;
  description: string;
  priceCents: number;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceDraft {
  customerId: string;
  period: string; // "2026-10"
  lines: InvoiceLine[];
  totalNetCents: number;
}
