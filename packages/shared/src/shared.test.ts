import { describe, expect, it } from "vitest";
import { addDays, berlinDate, buildInvoiceDrafts, checklistTitle, clockErrorKey, clockErrors, compareSiteHours, expandSeries, isoWeekday, mondayOf, siteFromRow, texts, visitFromRow, workedMinutes } from "./index";
import type { Site } from "./types";

describe("Einsatzplanung", () => {
  it("erkennt Wochentage", () => {
    expect(isoWeekday("2026-10-12")).toBe(1); // Montag
    expect(isoWeekday("2026-10-18")).toBe(7); // Sonntag
  });

  it("erzeugt Mo/Mi/Fr-Einsätze und überspringt vorhandene", () => {
    const series = [{ id: "s1", siteId: "o1", employeeId: "m1", weekdays: [1, 3, 5], startTime: "06:00", plannedMinutes: 90, validFrom: "2026-10-01" }];
    const visits = expandSeries(series, "2026-10-12", "2026-10-18", [{ seriesId: "s1", date: "2026-10-14" }]);
    expect(visits.map((v) => v.date)).toEqual(["2026-10-12", "2026-10-16"]);
    expect(visits[0].status).toBe("geplant");
  });

  it("beachtet Gültigkeitszeitraum", () => {
    const series = [{ id: "s1", siteId: "o1", employeeId: "m1", weekdays: [1, 2, 3, 4, 5], startTime: "06:00", plannedMinutes: 60, validFrom: "2026-10-14", validUntil: "2026-10-15" }];
    expect(expandSeries(series, "2026-10-12", "2026-10-18").map((v) => v.date)).toEqual(["2026-10-14", "2026-10-15"]);
  });
});

describe("Zeiterfassung", () => {
  it("rechnet gearbeitete Minuten", () => {
    expect(workedMinutes({ visitId: "v", employeeId: "m", clockInAt: "2026-10-12T06:02:00Z", clockOutAt: "2026-10-12T07:41:00Z" })).toBe(99);
  });

  it("vergleicht geplante und echte Stunden", () => {
    const [row] = compareSiteHours([{ siteId: "o1", plannedMinutes: 600 }], [{ siteId: "o1", minutes: 720 }]);
    expect(row.deviationPercent).toBe(20);
  });
});

describe("Rechnungen", () => {
  const sites: Site[] = [
    { id: "o1", companyId: "c", customerId: "k1", name: "Praxis Dr. Meyer", address: "", billingMode: "pauschale", priceCents: 168000, plannedMinutes: 90 },
    { id: "o2", companyId: "c", customerId: "k2", name: "Treppenhaus Lindenstr. 12", address: "", billingMode: "pro_einsatz", priceCents: 8000, plannedMinutes: 60 },
  ];
  const visit = (date: string, status: "erledigt" | "ausgefallen") => ({ siteId: "o2", employeeId: "m", date, startTime: "08:00", plannedMinutes: 60, status });

  it("rechnet Pauschale, Einsätze und Sonderleistungen", () => {
    const drafts = buildInvoiceDrafts(
      "2026-10",
      sites,
      [visit("2026-10-05", "erledigt"), visit("2026-10-12", "erledigt"), visit("2026-10-19", "ausgefallen"), visit("2026-09-28", "erledigt")],
      [{ siteId: "o1", date: "2026-10-20", description: "Grundreinigung Wartezimmer", priceCents: 25000 }],
    );
    const k1 = drafts.find((d) => d.customerId === "k1")!;
    const k2 = drafts.find((d) => d.customerId === "k2")!;
    expect(k1.totalNetCents).toBe(193000);
    expect(k1.lines[0].description).toContain("Oktober 2026");
    expect(k2.lines[0].quantity).toBe(2);
    expect(k2.totalNetCents).toBe(16000);
  });
});

describe("Übersetzungen", () => {
  it("haben in jeder Sprache alle Texte", () => {
    const keys = Object.keys(texts.de).sort();
    for (const lang of Object.values(texts)) expect(Object.keys(lang).sort()).toEqual(keys);
  });
});

describe("Datenbank", () => {
  it("wandelt Zeilen in App-Daten um", () => {
    const site = siteFromRow({
      id: "o1", company_id: "c", customer_id: "k1", name: "Praxis", address: "Bahnhofstr. 8", latitude: null, longitude: null,
      geofence_radius_m: 150, access_notes: null, contact: "Frau Becker", special_notes: null, planned_minutes: 90, active: true,
      site_billing: [{ billing_mode: "pro_einsatz", price_cents: 8000 }],
    });
    expect(site.billingMode).toBe("pro_einsatz");
    expect(site.priceCents).toBe(8000);
    expect(site.accessNotes).toBeUndefined();
    const visit = visitFromRow({ id: "v", company_id: "c", site_id: "o1", employee_id: "m", series_id: null, date: "2026-10-12", start_time: "06:00:00", planned_minutes: 90, status: "geplant", note: null });
    expect(visit.startTime).toBe("06:00");
  });

  it("nimmt Checklisten-Text in der Sprache, sonst Deutsch", () => {
    expect(checklistTitle({ de: "Böden wischen", uk: "Помити підлогу" }, "uk")).toBe("Помити підлогу");
    expect(checklistTitle({ de: "Böden wischen" }, "ru")).toBe("Böden wischen");
  });

  it("rechnet mit deutschem Datum", () => {
    expect(berlinDate(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12"); // 00:30 Uhr in Berlin
    expect(mondayOf("2026-10-15")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("erkennt Stempel-Fehler und hat Texte dafür", () => {
    expect(clockErrorKey("nicht_am_objekt")).toBe("nicht_am_objekt");
    expect(clockErrorKey("irgendwas")).toBeNull();
    for (const key of clockErrors) expect(texts.de[`err_${key}`]).toBeTruthy();
  });
});
