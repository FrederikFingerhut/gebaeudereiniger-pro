// Standorte: Abstände und Prüfung, ob ein Objekt-Standort plausibel ist.

import type { Language } from "./types";

const locales: Record<Language, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", uk: "uk-UA" };

/** Abstand zweier Punkte in Metern (wie distance_m in der Datenbank). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** 340 → "340 m", 2300 → "2,3 km", 150000 → "150 km" */
export function formatDistance(lang: Language, meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km.toLocaleString(locales[lang], { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Objekte, deren Standort weit weg von allen anderen liegt (meist eine Adresse
 * ohne Ort, die in eine falsche Stadt übersetzt wurde). Braucht mindestens 3 Objekte.
 */
export function suspiciousSites<T extends { id: string; latitude: number | null; longitude: number | null }>(sites: T[], maxKm = 80): Set<string> {
  const located = sites.filter((s): s is T & { latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null);
  if (located.length < 3) return new Set();
  const lat = median(located.map((s) => s.latitude));
  const lng = median(located.map((s) => s.longitude));
  return new Set(located.filter((s) => distanceMeters(lat, lng, s.latitude, s.longitude) > maxKm * 1000).map((s) => s.id));
}
