// Kalkulation eines Reinigungsangebots (Unterhaltsreinigung).
// Rechenweg wie in der Branche üblich: Zeit aus Fläche und Leistungswert,
// Stundenverrechnungssatz aus Lohn plus Zuschlägen, daraus der Monatspreis.

/** Zuschläge und Lohn, die für alle Angebote gelten (im Büro-Web einstellbar). */
export interface CalcSettings {
  /** Stundenlohn in Cent */
  wageCents: number;
  /** Lohnnebenkosten (Sozialversicherung, Urlaub, Krankheit, Feiertage) in Prozent vom Lohn */
  ancillaryPercent: number;
  /** Reinigungsmittel und Material in Prozent der Lohnkosten */
  materialPercent: number;
  /** Verwaltung, Fahrzeuge, Versicherung in Prozent der Lohnkosten */
  overheadPercent: number;
  /** Wagnis und Gewinn in Prozent der Selbstkosten */
  profitPercent: number;
}

/** Startwerte; jede Firma passt sie an ihre eigenen Zahlen an. */
export const defaultCalcSettings: CalcSettings = {
  wageCents: 1500,
  ancillaryPercent: 80,
  materialPercent: 5,
  overheadPercent: 12,
  profitPercent: 8,
};

export interface CalcInput {
  /** Zu reinigende Fläche in m² */
  areaM2: number;
  /** Leistungswert: m² pro Stunde und Kraft */
  m2PerHour: number;
  /** Zusätzliche Minuten je Einsatz (Rüstzeit, Müll, Sonderflächen) */
  extraMinutes: number;
  /** Einsätze pro Woche */
  visitsPerWeek: number;
}

export interface CalcResult {
  minutesPerVisit: number;
  visitsPerMonth: number;
  hoursPerMonth: number;
  /** Lohn plus Lohnnebenkosten pro Stunde */
  laborCentsPerHour: number;
  /** Selbstkosten pro Stunde (Lohn, Material, Gemeinkosten) */
  costCentsPerHour: number;
  /** Stundenverrechnungssatz (mit Gewinn) */
  rateCentsPerHour: number;
  costCentsPerMonth: number;
  priceCentsPerMonth: number;
  priceCentsPerVisit: number;
  /** Monatspreis je m² Fläche */
  priceCentsPerM2: number;
  profitCentsPerMonth: number;
}

/** Durchschnittliche Wochen pro Monat (52 / 12). */
export const WEEKS_PER_MONTH = 52 / 12;

export function calculateOffer(input: CalcInput, s: CalcSettings): CalcResult {
  const area = Math.max(0, input.areaM2);
  const perf = Math.max(1, input.m2PerHour);
  const minutesPerVisit = Math.round((area / perf) * 60 + Math.max(0, input.extraMinutes));
  const visitsPerMonth = Math.max(0, input.visitsPerWeek) * WEEKS_PER_MONTH;
  const hoursPerMonth = (minutesPerVisit * visitsPerMonth) / 60;

  const labor = s.wageCents * (1 + s.ancillaryPercent / 100);
  const cost = labor * (1 + (s.materialPercent + s.overheadPercent) / 100);
  const rate = cost * (1 + s.profitPercent / 100);

  const costPerMonth = Math.round(cost * hoursPerMonth);
  const pricePerMonth = Math.round(rate * hoursPerMonth);
  return {
    minutesPerVisit,
    visitsPerMonth,
    hoursPerMonth,
    laborCentsPerHour: Math.round(labor),
    costCentsPerHour: Math.round(cost),
    rateCentsPerHour: Math.round(rate),
    costCentsPerMonth: costPerMonth,
    priceCentsPerMonth: pricePerMonth,
    priceCentsPerVisit: visitsPerMonth ? Math.round(pricePerMonth / visitsPerMonth) : 0,
    priceCentsPerM2: area ? Math.round((pricePerMonth / area) * 100) / 100 : 0,
    profitCentsPerMonth: pricePerMonth - costPerMonth,
  };
}

export type PriceGuideUnit = "m2" | "stunde" | "einsatz" | "monat" | "stueck";

export const priceGuideUnits: Record<PriceGuideUnit, string> = {
  m2: "pro m²",
  stunde: "pro Stunde",
  einsatz: "pro Einsatz",
  monat: "pro Monat",
  stueck: "pro Stück",
};

/** Liest einen Betrag wie "1.234,50" oder "18,5" in Cent. Ungültig → null. */
export function parseEuro(value: string): number | null {
  const clean = value.replace(/[€\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
