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

// Ungefähre Marktwerte (Stand 2026) als Orientierung. Jede Firma prüft sie
// gegen ihre eigenen Zahlen; sie ersetzen keine Kalkulation.

/** Untergrenzen für den Stundensatz netto, darunter wird nicht angeboten. */
export const minimumRates = {
  /** Regelmäßige Unterhaltsreinigung */
  unterhalt: 3150,
  /** Grundreinigung und einmalige Projekte */
  grund: 3650,
} as const;

export type RateKind = keyof typeof minimumRates;

export interface MarketRate {
  title: string;
  /** Wofür der Wert gedacht ist, kurz */
  hint: string;
  kind: RateKind;
  /** Leistungswert m² pro Stunde, wenn üblich */
  m2PerHour: number | null;
  fromCents: number;
  toCents: number;
}

export const marketRates: MarketRate[] = [
  { title: "Büro", hint: "Arbeitsplätze, Böden, Abfall", kind: "unterhalt", m2PerHour: 150, fromCents: 3150, toCents: 3650 },
  { title: "Gewerbeobjekt", hint: "Standardobjekt mit klarem Leistungsverzeichnis", kind: "unterhalt", m2PerHour: 150, fromCents: 3150, toCents: 3650 },
  { title: "Treppenhaus", hint: "Eingang, Stufen, Geländer, Briefkästen", kind: "unterhalt", m2PerHour: 200, fromCents: 3150, toCents: 3450 },
  { title: "Schule und Kita", hint: "Stark genutzt, robuste Flächen", kind: "unterhalt", m2PerHour: 120, fromCents: 3150, toCents: 3650 },
  { title: "Fitnessstudio", hint: "Geräte, Duschen, viele Kontaktflächen", kind: "unterhalt", m2PerHour: 100, fromCents: 3150, toCents: 3650 },
  { title: "Sanitär intensiv", hint: "Mehr Reinigungsmittel und Zeit", kind: "unterhalt", m2PerHour: null, fromCents: 3150, toCents: 3650 },
  { title: "Vertretung kurzfristig", hint: "Einspringen bei Urlaub oder Krankheit", kind: "unterhalt", m2PerHour: 100, fromCents: 3350, toCents: 3850 },
];

export interface YieldInput {
  /** Richtpreis netto pro Stunde in Cent */
  priceCentsPerHour: number;
  /** Bruttolohn pro Stunde in Cent */
  wageCentsPerHour: number;
  /** Material pro Stunde in Cent */
  materialCentsPerHour: number;
  /** Verschleiß der Maschinen pro Stunde in Cent */
  wearCentsPerHour: number;
  /** Anfahrt pauschal je Reinigung in Cent */
  travelCentsPerVisit: number;
  /** Mannstunden je Reinigung (alle Kräfte zusammen) */
  hoursPerVisit: number;
  /** Anzahl Reinigungen (1 = einmalig, mehr = z. B. pro Monat) */
  visits: number;
}

export interface YieldResult {
  hours: number;
  revenueCents: number;
  wageCents: number;
  materialCents: number;
  travelCents: number;
  costCents: number;
  profitCents: number;
  profitCentsPerHour: number;
  profitCentsPerVisit: number;
  /** Anteil des Ertrags am Umsatz in Prozent */
  marginPercent: number;
}

/** Was bleibt übrig? Richtpreis mal Stunden minus Lohn, Material, Verschleiß und Anfahrt. */
export function calculateYield(input: YieldInput): YieldResult {
  const visits = Math.max(0, input.visits);
  const hours = Math.max(0, input.hoursPerVisit) * visits;
  const revenue = Math.round(input.priceCentsPerHour * hours);
  const wage = Math.round(input.wageCentsPerHour * hours);
  const material = Math.round((input.materialCentsPerHour + input.wearCentsPerHour) * hours);
  const travel = Math.round(input.travelCentsPerVisit * visits);
  const cost = wage + material + travel;
  const profit = revenue - cost;
  return {
    hours,
    revenueCents: revenue,
    wageCents: wage,
    materialCents: material,
    travelCents: travel,
    costCents: cost,
    profitCents: profit,
    profitCentsPerHour: hours ? Math.round(profit / hours) : 0,
    profitCentsPerVisit: visits ? Math.round(profit / visits) : 0,
    marginPercent: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
  };
}
