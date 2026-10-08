import { demoSites, demoToday, type Visit } from "@gp/shared";

// Beispiel: Einsätze von Oksana am Montag. Wird durch die Datenbank ersetzt.
export const me = { id: "m2", name: "Oksana" };

export const myVisits: Visit[] = [
  { siteId: "o1", employeeId: "m2", date: demoToday, startTime: "06:00", plannedMinutes: 90, status: "geplant" },
  { siteId: "o2", employeeId: "m2", date: demoToday, startTime: "09:30", plannedMinutes: 75, status: "geplant" },
  { siteId: "o5", employeeId: "m2", date: demoToday, startTime: "17:30", plannedMinutes: 90, status: "geplant" },
];

export const siteById = (id: string) => demoSites.find((s) => s.id === id)!;

// Checklisten-Texte je Sprache (kommen später aus checklist_items.title)
export const checklist: Record<string, Record<"de" | "en" | "ru" | "uk", string>> = {
  bins: { de: "Papierkörbe leeren", en: "Empty bins", ru: "Опорожнить корзины", uk: "Спорожнити кошики" },
  desks: { de: "Tische abwischen", en: "Wipe desks", ru: "Протереть столы", uk: "Протерти столи" },
  floors: { de: "Böden saugen und wischen", en: "Vacuum and mop floors", ru: "Пропылесосить и вымыть полы", uk: "Пропилососити й помити підлогу" },
  restrooms: { de: "Sanitärräume reinigen", en: "Clean restrooms", ru: "Убрать санузлы", uk: "Прибрати санвузли" },
  kitchen: { de: "Küche: Spüle und Geräte", en: "Kitchen: sink and appliances", ru: "Кухня: раковина и техника", uk: "Кухня: мийка й техніка" },
};
