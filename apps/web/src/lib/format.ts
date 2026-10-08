/** Uhrzeit eines Zeitstempels in deutscher Zeit, z. B. "06:02". */
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "2026-10-12" → "Mo 12.10." */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d}.${m}.`;
}

export function hours(minutes: number): string {
  return `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`;
}

export const one = <T,>(value: T | T[] | null | undefined): T | undefined => (Array.isArray(value) ? value[0] : (value ?? undefined));
