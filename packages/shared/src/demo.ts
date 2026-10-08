import type { ExtraService, Site, Visit, VisitSeries } from "./types";

// Beispieldaten für Entwicklung und Vorführung, bis die Datenbank angebunden ist.
// Keine echten Kunden.

export const demoEmployees = [
  { id: "m1", name: "Anna", language: "de" },
  { id: "m2", name: "Oksana", language: "uk" },
  { id: "m3", name: "Dmytro", language: "uk" },
  { id: "m4", name: "Marco", language: "de" },
  { id: "m5", name: "Lena", language: "en" },
] as const;

export const demoCustomers = [
  { id: "k1", name: "Praxis Dr. Meyer" },
  { id: "k2", name: "Kanzlei Hoffmann" },
  { id: "k3", name: "Autohaus Brandt" },
  { id: "k4", name: "Kita Sonnenschein" },
  { id: "k5", name: "Nordwind GmbH" },
  { id: "k6", name: "Hausverwaltung Lindenstraße" },
  { id: "k7", name: "Fitnessstudio Vital" },
  { id: "k8", name: "Bäckerei Krüger" },
];

const site = (id: string, customerId: string, name: string, address: string, billingMode: Site["billingMode"], priceCents: number, plannedMinutes: number, extra: Partial<Site> = {}): Site => ({
  id, companyId: "demo", customerId, name, address, billingMode, priceCents, plannedMinutes, ...extra,
});

export const demoSites: Site[] = [
  site("o1", "k1", "Praxis Dr. Meyer", "Bahnhofstr. 8", "pauschale", 168000, 90, { accessNotes: "Schlüsselsafe am Hintereingang", contact: "Frau Becker", specialNotes: "Behandlungsräume nur mit Flächendesinfektion" }),
  site("o2", "k2", "Kanzlei Hoffmann", "Georgsplatz 3", "pauschale", 89000, 75, { accessNotes: "Empfang klingeln, 2. OG", specialNotes: "Aktenräume nicht betreten" }),
  site("o3", "k3", "Autohaus Brandt", "Vahrenwalder Str. 200", "pauschale", 296000, 150),
  site("o4", "k4", "Kita Sonnenschein", "Am Lindenhofe 5", "pauschale", 215000, 120),
  site("o5", "k5", "Büro Nordwind GmbH", "Podbielskistr. 120", "pauschale", 146000, 90, { specialNotes: "Freitags Kühlschrank leeren" }),
  site("o6", "k6", "Treppenhaus Lindenstr. 12", "Lindenstr. 12", "pro_einsatz", 8000, 60),
  site("o7", "k7", "Fitnessstudio Vital", "Lister Meile 40", "pauschale", 198000, 120),
  site("o8", "k8", "Bäckerei Krüger, Filiale", "Limmerstr. 15", "pauschale", 72000, 45),
];

export const demoToday = "2026-10-12";

export const demoVisitsToday: (Visit & { label: string })[] = [
  { siteId: "o1", employeeId: "m2", date: demoToday, startTime: "06:00", plannedMinutes: 90, status: "erledigt", label: "06:02 bis 07:41" },
  { siteId: "o4", employeeId: "m1", date: demoToday, startTime: "06:30", plannedMinutes: 120, status: "laeuft", label: "seit 06:30" },
  { siteId: "o3", employeeId: "m3", date: demoToday, startTime: "07:00", plannedMinutes: 150, status: "laeuft", label: "seit 07:05" },
  { siteId: "o2", employeeId: "m2", date: demoToday, startTime: "09:30", plannedMinutes: 75, status: "geplant", label: "ab 09:30" },
  { siteId: "o7", employeeId: "m5", date: demoToday, startTime: "13:00", plannedMinutes: 120, status: "geplant", label: "ab 13:00, vertritt Marco" },
  { siteId: "o5", employeeId: "m2", date: demoToday, startTime: "17:30", plannedMinutes: 90, status: "geplant", label: "ab 17:30" },
];

export const demoTreppenhausVisits: Visit[] = ["2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22", "2026-10-26"].map((date) => ({
  siteId: "o6", employeeId: "m4", date, startTime: "08:00", plannedMinutes: 60, status: "erledigt",
}));

export const demoExtras: ExtraService[] = [
  { siteId: "o3", date: "2026-10-09", description: "Glasreinigung Ausstellungsraum", priceCents: 28000 },
  { siteId: "o7", date: "2026-10-17", description: "Sonderreinigung nach Umbau", priceCents: 40000 },
];

/** Kalkulierte und echte Minuten im Monat pro Objekt */
export const demoMonthHours = [
  { siteId: "o1", planned: 36 * 60, actual: 35 * 60 },
  { siteId: "o2", planned: 14 * 60, actual: 13 * 60 },
  { siteId: "o3", planned: 48 * 60, actual: 59 * 60 },
  { siteId: "o4", planned: 44 * 60, actual: 46 * 60 },
  { siteId: "o5", planned: 30 * 60, actual: 27 * 60 },
  { siteId: "o6", planned: 8 * 60, actual: 11 * 60 },
  { siteId: "o7", planned: 40 * 60, actual: 42 * 60 },
  { siteId: "o8", planned: 15 * 60, actual: 14 * 60 },
];

const series = (id: string, siteId: string, employeeId: string, weekdays: number[], startTime: string, plannedMinutes: number): VisitSeries => ({
  id, siteId, employeeId, weekdays, startTime, plannedMinutes, validFrom: "2026-10-01",
});

export const demoSeries: VisitSeries[] = [
  series("s1", "o1", "m2", [1, 2, 3, 4, 5], "06:00", 90),
  series("s2", "o2", "m2", [1, 3, 5], "09:30", 75),
  series("s3", "o3", "m3", [1, 2, 3, 4, 5], "07:00", 150),
  series("s4", "o4", "m1", [1, 2, 3, 4, 5], "06:30", 120),
  series("s5", "o5", "m2", [1, 3, 5], "17:30", 90),
  series("s6", "o5", "m5", [2, 4], "17:30", 90),
  series("s7", "o6", "m4", [1, 4], "08:00", 60),
  series("s8", "o7", "m4", [1, 3, 5], "13:00", 120),
  series("s9", "o7", "m5", [2, 4], "13:00", 120),
  series("s10", "o8", "m5", [1, 3, 5], "05:30", 45),
];
