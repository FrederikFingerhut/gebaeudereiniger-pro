import type { Language, Role, Site, Visit, VisitSeries, VisitStatus, BillingMode } from "./types";

// Verbindung zur Datenbank (Supabase, Frankfurt). Adresse und öffentlicher
// Schlüssel sind kein Geheimnis: Sie stecken in jeder App, geschützt wird über
// die Anmeldung und die Zugriffsregeln in der Datenbank.
export const supabaseConfig = {
  url: "https://yvwykodhkkyyizajauln.supabase.co",
  publishableKey: "sb_publishable_d2pFvyNUJMIfr-nhdpAGfA_Fitm_AEI",
};

// Öffentlicher Schlüssel für Web-Push (VAPID). Der private Teil liegt nur als
// Geheimnis bei der Push-Funktion in Supabase.
export const pushConfig = {
  publicKey: "BKaQFeLcolSxYiqbrHhrSY8_dTFWJl_llhLcM1sDeGuhD_fbA-wVLTvKADgtyhVKvZDfSMWkvbEA5Zv2NV6VR9M",
};

// Zeilen, wie sie aus der Datenbank kommen (Spaltennamen mit Unterstrich).

export interface ProfileRow {
  id: string;
  company_id: string;
  full_name: string;
  role: Role;
  language: Language;
  phone: string | null;
  active: boolean;
}

export interface SiteRow {
  id: string;
  company_id: string;
  customer_id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  access_notes: string | null;
  contact: string | null;
  special_notes: string | null;
  planned_minutes: number;
  active: boolean;
  /** Nur für Büro/Chef lesbar */
  site_billing?: { billing_mode: BillingMode; price_cents: number } | { billing_mode: BillingMode; price_cents: number }[] | null;
}

export interface VisitRow {
  id: string;
  company_id: string;
  site_id: string;
  employee_id: string | null;
  series_id: string | null;
  date: string;
  start_time: string; // "06:00:00"
  planned_minutes: number;
  status: VisitStatus;
  note: string | null;
}

export interface VisitSeriesRow {
  id: string;
  site_id: string;
  employee_id: string;
  weekdays: number[];
  start_time: string;
  planned_minutes: number;
  valid_from: string;
  valid_until: string | null;
}

export interface TimeEntryRow {
  id: string;
  visit_id: string | null;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  method: "gps" | "qr" | "nfc" | "manuell";
}

export interface ChecklistItemRow {
  id: string;
  site_id: string;
  position: number;
  area: string | null;
  title: Partial<Record<Language, string>>;
}

/** "06:00:00" → "06:00" */
export const shortTime = (time: string) => time.slice(0, 5);

export function siteFromRow(row: SiteRow): Site {
  const billing = Array.isArray(row.site_billing) ? row.site_billing[0] : row.site_billing;
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    name: row.name,
    address: row.address,
    accessNotes: row.access_notes ?? undefined,
    contact: row.contact ?? undefined,
    specialNotes: row.special_notes ?? undefined,
    billingMode: billing?.billing_mode ?? "pauschale",
    priceCents: billing?.price_cents ?? 0,
    plannedMinutes: row.planned_minutes,
  };
}

export function visitFromRow(row: VisitRow): Visit {
  return {
    id: row.id,
    siteId: row.site_id,
    employeeId: row.employee_id ?? "",
    seriesId: row.series_id ?? undefined,
    date: row.date,
    startTime: shortTime(row.start_time),
    plannedMinutes: row.planned_minutes,
    status: row.status,
  };
}

export function seriesFromRow(row: VisitSeriesRow): VisitSeries {
  return {
    id: row.id,
    siteId: row.site_id,
    employeeId: row.employee_id,
    weekdays: row.weekdays,
    startTime: shortTime(row.start_time),
    plannedMinutes: row.planned_minutes,
    validFrom: row.valid_from,
    validUntil: row.valid_until ?? undefined,
  };
}

/** Checklisten-Text in der Sprache des Mitarbeiters, sonst Deutsch. */
export function checklistTitle(title: Partial<Record<Language, string>>, lang: Language): string {
  return title[lang] || title.de || Object.values(title).find(Boolean) || "";
}

/** Heutiges Datum in Deutschland als "2026-10-12" (unabhängig von der Zeitzone des Geräts). */
export function berlinDate(now: Date = new Date(), offsetDays = 0): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}

/** Montag der Woche, in der `date` liegt. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const wd = utc.getUTCDay() || 7;
  return new Date(utc.getTime() - (wd - 1) * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

// Fehler-Schlüssel, die clock_in/clock_out in der Datenbank werfen.
export const clockErrors = [
  "einsatz_unbekannt",
  "einsatz_abgeschlossen",
  "falscher_tag",
  "schon_eingestempelt",
  "qr_falsch",
  "kein_standort",
  "nicht_am_objekt",
  "standort_fehlt",
  "zeit_ungueltig",
  "nicht_eingestempelt",
] as const;
export type ClockError = (typeof clockErrors)[number];

/**
 * Kein Netz? Dann kam die Anfrage gar nicht beim Server an (kein Fehlercode).
 * Solche Aktionen merkt sich die App und sendet sie später.
 */
export function isNetworkError(error: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.code || (error.status && error.status >= 400)) return false;
  return /fetch|network|offline|timeout|abort/i.test(error.message ?? "");
}

/** Erkennt den Fehler-Schlüssel in einer Datenbank-Fehlermeldung. */
export function clockErrorKey(message: string | undefined | null): ClockError | null {
  if (!message) return null;
  return clockErrors.find((key) => message === key || message.startsWith(key)) ?? null;
}
