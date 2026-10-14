// Verträge mit Laufzeit, Kündigungsfrist und automatischer Verlängerung.

export interface ContractTerms {
  /** Laufzeitende "YYYY-MM-DD"; null = unbefristet */
  endsOn: string | null;
  /** Kündigungsfrist in Monaten vor dem Laufzeitende */
  noticeMonths: number | null;
  /** Verlängert sich ohne Kündigung um so viele Monate; null = endet einfach */
  autoRenewMonths: number | null;
}

/** Datum plus/minus Monate; der Tag wird auf das Monatsende gekürzt (31.03. − 1 Monat = 28./29.02.). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Nächstes Laufzeitende ab heute (bei automatischer Verlängerung fortgeschrieben)
 * und der letzte Tag, an dem noch gekündigt werden kann.
 */
export function contractDates(terms: ContractTerms, today: string): { end: string | null; noticeBy: string | null; ended: boolean } {
  if (!terms.endsOn) return { end: null, noticeBy: null, ended: false };
  let end = terms.endsOn;
  const notice = terms.noticeMonths ?? 0;
  if (terms.autoRenewMonths && terms.autoRenewMonths > 0) {
    // Ist die Kündigungsfrist für dieses Ende schon vorbei, läuft der Vertrag weiter.
    while (addMonths(end, -notice) < today) end = addMonths(end, terms.autoRenewMonths);
  } else if (end < today) {
    return { end, noticeBy: null, ended: true };
  }
  const noticeBy = addMonths(end, -notice);
  return { end, noticeBy: noticeBy >= today ? noticeBy : null, ended: false };
}

/** Tage von `from` bis `to` (positiv, wenn `to` später ist). */
export function daysUntil(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}
