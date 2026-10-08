import type { ExtraService, InvoiceDraft, InvoiceLine, Site, Visit } from "./types";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Baut die Rechnungsentwürfe eines Monats pro Kunde:
 * - Objekte mit Pauschale: eine Zeile mit der Monatspauschale
 * - Objekte mit Preis pro Einsatz: erledigte Einsätze × Preis
 * - Sonderleistungen des Monats als eigene Zeilen
 * Die Entwürfe werden danach an Lexoffice übergeben.
 */
export function buildInvoiceDrafts(
  period: string,
  sites: Site[],
  visits: Visit[],
  extras: ExtraService[],
): InvoiceDraft[] {
  const inPeriod = (date: string) => date.startsWith(period + "-");
  const label = monthLabel(period);
  const byCustomer = new Map<string, InvoiceLine[]>();
  const add = (customerId: string, line: InvoiceLine) => {
    const lines = byCustomer.get(customerId) ?? [];
    lines.push(line);
    byCustomer.set(customerId, lines);
  };

  for (const site of sites) {
    if (site.billingMode === "pauschale") {
      add(site.customerId, { description: `Unterhaltsreinigung ${site.name}, ${label}`, quantity: 1, unitPriceCents: site.priceCents });
    } else {
      const done = visits.filter((v) => v.siteId === site.id && v.status === "erledigt" && inPeriod(v.date)).length;
      if (done > 0) {
        add(site.customerId, { description: `Reinigung ${site.name}, ${label} (Einsätze)`, quantity: done, unitPriceCents: site.priceCents });
      }
    }
  }

  const siteById = new Map(sites.map((s) => [s.id, s]));
  for (const e of extras) {
    const site = siteById.get(e.siteId);
    if (!site || !inPeriod(e.date)) continue;
    add(site.customerId, { description: `${e.description} (${site.name}, ${e.date.split("-").reverse().join(".")})`, quantity: 1, unitPriceCents: e.priceCents });
  }

  return [...byCustomer.entries()].map(([customerId, lines]) => ({
    customerId,
    period,
    lines,
    totalNetCents: lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0),
  }));
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
