// Gewinn pro Objekt: Was bringt ein Objekt im Monat, was kostet es an Personal?
// Grundlage sind Preis, gestempelte Zeiten und Lohn mit Zuschlägen aus der Kalkulation.

import type { BillingMode } from "./types";
import type { CalcSettings } from "./calculation";

export interface SiteMonth {
  siteId: string;
  siteName: string;
  billingMode: BillingMode;
  priceCents: number;
  /** Erledigte Einsätze im Monat */
  doneVisits: number;
  /** Geplante Minuten der erledigten Einsätze (Ersatz, wenn nicht gestempelt wurde) */
  plannedMinutes: number;
  /** Gestempelte Minuten am Objekt */
  workedMinutes: number;
}

export type ProfitRating = "gut" | "knapp" | "verlust";

export interface SiteProfit {
  siteId: string;
  siteName: string;
  revenueCents: number;
  hours: number;
  /** true, wenn keine Stempelzeiten da sind und die Planzeit genommen wurde */
  estimated: boolean;
  costCents: number;
  profitCents: number;
  marginPercent: number;
  /** Umsatz je gearbeiteter Stunde */
  revenueCentsPerHour: number;
  rating: ProfitRating;
}

/** Ab dieser Marge gilt ein Objekt als gut. */
export const GOOD_MARGIN_PERCENT = 8;

export function siteProfit(m: SiteMonth, s: CalcSettings): SiteProfit {
  const revenue = m.billingMode === "pauschale" ? m.priceCents : m.doneVisits * m.priceCents;
  const estimated = m.workedMinutes <= 0;
  const hours = (estimated ? m.plannedMinutes : m.workedMinutes) / 60;
  const costPerHour = s.wageCents * (1 + s.ancillaryPercent / 100) * (1 + (s.materialPercent + s.overheadPercent) / 100);
  const cost = Math.round(costPerHour * hours);
  const profit = revenue - cost;
  const margin = revenue ? Math.round((profit / revenue) * 1000) / 10 : profit < 0 ? -100 : 0;
  return {
    siteId: m.siteId,
    siteName: m.siteName,
    revenueCents: revenue,
    hours,
    estimated,
    costCents: cost,
    profitCents: profit,
    marginPercent: margin,
    revenueCentsPerHour: hours ? Math.round(revenue / hours) : 0,
    rating: profit < 0 ? "verlust" : margin < GOOD_MARGIN_PERCENT ? "knapp" : "gut",
  };
}

/** Minuten zwischen Ein- und Ausstempeln; offene Einträge zählen nicht. */
export function entryMinutes(clockInAt: string, clockOutAt: string | null): number {
  if (!clockOutAt) return 0;
  return Math.max(0, Math.round((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 60000));
}
