// Angebote und Übergabe an Lexoffice: reine Rechen- und Formatlogik ohne Netz.

import { monthLabel } from "./billing";
import type { InvoiceDraft } from "./types";

/** Umsatzsteuer in Deutschland, Regelsatz */
export const VAT_PERCENT = 19;

export interface OfferLine {
  description: string;
  quantity: number;
  /** z. B. "Monat", "Std.", "m²", "pauschal" */
  unit: string;
  unitPriceCents: number;
}

export const offerUnits = ["Monat", "Einsatz", "Std.", "m²", "Stück", "pauschal"];

export interface OfferTotals {
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export function lineTotalCents(line: OfferLine): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function offerTotals(lines: OfferLine[], vatPercent = VAT_PERCENT): OfferTotals {
  const net = lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
  const vat = Math.round((net * vatPercent) / 100);
  return { netCents: net, vatCents: vat, grossCents: net + vat };
}

/** Liest Positionen aus der Datenbank (jsonb) und verwirft Unbrauchbares. */
export function parseOfferLines(value: unknown): OfferLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((l) => ({
      description: String(l?.description ?? "").trim(),
      quantity: Number(l?.quantity),
      unit: String(l?.unit ?? "").trim(),
      unitPriceCents: Math.round(Number(l?.unitPriceCents)),
    }))
    .filter((l) => l.description && Number.isFinite(l.quantity) && l.quantity > 0 && Number.isFinite(l.unitPriceCents) && l.unitPriceCents >= 0);
}

/** Nächste Angebotsnummer im Jahr, z. B. "A-2026-007". */
export function nextOfferNumber(existing: string[], year: number): string {
  const prefix = `A-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Lexoffice (Lexware Office) Public API ------------------------------------------

export const LEXOFFICE_API = "https://api.lexware.io/v1";

/** Neuer Kontakt als Kunde (Firma). */
export function lexofficeContact(name: string) {
  return { version: 0, roles: { customer: {} }, company: { name } };
}

/**
 * Rechnung als Entwurf in Lexoffice: Leistungszeitraum ist der Abrechnungsmonat,
 * Preise netto zuzüglich Umsatzsteuer. Fertig schreiben und versenden passiert in Lexoffice.
 */
export function lexofficeInvoice(draft: InvoiceDraft, contactId: string, today: string) {
  const [y, m] = draft.period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const at = (date: string) => `${date}T00:00:00.000+01:00`;
  return {
    voucherDate: at(today),
    address: { contactId },
    lineItems: draft.lines.map((l) => ({
      type: "custom",
      name: l.description,
      quantity: l.quantity,
      unitName: l.quantity > 1 ? "Einsatz" : "pauschal",
      unitPrice: { currency: "EUR", netAmount: l.unitPriceCents / 100, taxRatePercentage: VAT_PERCENT },
    })),
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: "net" },
    shippingConditions: {
      shippingType: "serviceperiod",
      shippingDate: at(`${draft.period}-01`),
      shippingEndDate: at(`${draft.period}-${String(lastDay).padStart(2, "0")}`),
    },
    title: "Rechnung",
    introduction: `Unsere Leistungen im ${monthLabel(draft.period)}:`,
  };
}
