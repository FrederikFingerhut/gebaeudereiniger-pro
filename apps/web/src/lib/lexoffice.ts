import { LEXOFFICE_API } from "@gp/shared";

export class LexofficeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Aufruf der Lexoffice-Schnittstelle. Bei zu vielen Anfragen (429) einmal kurz warten. */
export async function lexoffice<T>(key: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${LEXOFFICE_API}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LexofficeError(res.status, detail.slice(0, 300));
    }
    return (await res.json()) as T;
  }
}

/** Verständliche Meldung für Fehler der Schnittstelle. */
export function lexofficeMessage(e: unknown): string {
  if (e instanceof LexofficeError) {
    if (e.status === 401 || e.status === 403) return "Lexoffice lehnt den Schlüssel ab. Bitte den API-Schlüssel neu eintragen.";
    if (e.status === 429) return "Lexoffice ist gerade ausgelastet. Bitte in einer Minute noch einmal.";
    if (e.status === 400 || e.status === 406) return "Lexoffice hat die Rechnung nicht angenommen. Bitte Kunde und Positionen prüfen.";
    return `Lexoffice antwortet mit Fehler ${e.status}.`;
  }
  return "Lexoffice ist nicht erreichbar.";
}
