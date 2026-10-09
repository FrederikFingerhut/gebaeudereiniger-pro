// Texte für Benachrichtigungen in der Sprache des Empfängers.
// Die Datenbank speichert nur Art (kind) und Werte (params); daraus entsteht hier der Text.
// Wird auch von der Push-Funktion in supabase/functions/push benutzt.

import { t, type TextKey } from "./i18n";
import type { Language } from "./types";

const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

type Params = Record<string, unknown>;

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

/** "2026-10-12" → "Mo., 12.10." in der jeweiligen Sprache */
export function shortDate(lang: Language, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locales[lang], { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** ISO-Wochentage [1, 3, 5] → "Mo, Mi, Fr" in der jeweiligen Sprache */
export function weekdayList(lang: Language, days: number[]): string {
  const format = new Intl.DateTimeFormat(locales[lang], { weekday: "short", timeZone: "UTC" });
  // 2026-10-12 ist ein Montag.
  return days.map((d) => format.format(new Date(Date.UTC(2026, 9, 11 + d)))).join(", ");
}

const titles: Record<string, TextKey> = {
  visit_new: "n_visit_new",
  visit_changed: "n_visit_changed",
  visit_removed: "n_visit_removed",
  series_new: "n_series_new",
  absence_ok: "n_absence_ok",
  absence_no: "n_absence_no",
  absence_new: "n_absence_new",
  report_new: "n_report_new",
  complaint_new: "n_complaint_new",
  chat: "n_chat",
};

const bodies: Record<string, TextKey> = {
  visit_new: "n_visit_new_body",
  visit_changed: "n_visit_changed_body",
  visit_removed: "n_visit_removed_body",
  series_new: "n_series_new_body",
  absence_ok: "n_absence_body",
  absence_no: "n_absence_body",
  absence_new: "n_absence_new_body",
  report_new: "n_report_body",
  complaint_new: "n_report_body",
  chat: "n_chat_body",
};

export function notificationText(lang: Language, kind: string, params: Params): { title: string; body: string } {
  const str = (key: string) => (params[key] == null ? "" : String(params[key]));
  const from = str("from");
  const to = str("to");
  const values: Record<string, string> = {
    site: str("site"),
    name: str("name"),
    text: str("text"),
    time: str("time"),
    date: str("date") ? shortDate(lang, str("date")) : "",
    weekdays: Array.isArray(params.weekdays) ? weekdayList(lang, params.weekdays.map(Number)) : "",
    kind: str("kind") === "krank" ? t(lang, "sick") : t(lang, "vacation"),
    range: from && to && from !== to ? `${shortDate(lang, from)} – ${shortDate(lang, to)}` : from ? shortDate(lang, from) : "",
  };
  const title = titles[kind] ? fill(t(lang, titles[kind]), values) : kind;
  const body = bodies[kind] ? fill(t(lang, bodies[kind]), values).replace(/\s\(\)$/, "") : "";
  return { title, body };
}
