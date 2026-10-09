// Qualitätskontrolle: Objektbegehung mit Schulnoten je Bereich.

export interface InspectionItem {
  title: string;
  /** 1 = sehr gut … 5 = mangelhaft */
  grade: number;
  note?: string;
}

export const gradeLabels: Record<number, string> = {
  1: "sehr gut",
  2: "gut",
  3: "befriedigend",
  4: "ausreichend",
  5: "mangelhaft",
};

/** Bereiche, wenn das Objekt noch keine Checkliste hat. */
export const defaultInspectionAreas = ["Böden", "Sanitär", "Küche und Teeküche", "Oberflächen und Staub", "Abfall", "Glas und Spiegel"];

export function parseInspectionItems(value: unknown): InspectionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((i) => ({ title: String(i?.title ?? "").trim(), grade: Math.round(Number(i?.grade)), note: String(i?.note ?? "").trim() || undefined }))
    .filter((i) => i.title && i.grade >= 1 && i.grade <= 5);
}

/** Durchschnittsnote, eine Nachkommastelle; null ohne bewertete Punkte. */
export function inspectionScore(items: InspectionItem[]): number | null {
  if (items.length === 0) return null;
  return Math.round((items.reduce((s, i) => s + i.grade, 0) / items.length) * 10) / 10;
}

export function scoreTone(score: number | null): "ok" | "warn" | "bad" | "muted" {
  if (score === null) return "muted";
  return score <= 2.4 ? "ok" : score <= 3.4 ? "warn" : "bad";
}
