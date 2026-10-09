import { describe, expect, it } from "vitest";
import { addDays, brand, lexofficeInvoice, nextOfferNumber, offerTotals, parseOfferLines, calculateOffer, calculateYield, marketRates, minimumRates, defaultCalcSettings, parseEuro, decimalHours, hoursCsv, monthRange, monthlyHours, logoSvg, berlinDate, buildInvoiceDrafts, checklistTitle, clockErrorKey, clockErrors, isNetworkError, compareSiteHours, expandSeries, isoWeekday, mondayOf, siteFromRow, texts, visitFromRow, workedMinutes } from "./index";
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
    expect(clockErrorKey("zeit_ungueltig")).toBe("zeit_ungueltig");
    for (const key of clockErrors) expect(texts.de[`err_${key}`]).toBeTruthy();
  });
});

describe("Logo", () => {
  it("nutzt die Farben aus brand.ts", () => {
    const svg = logoSvg();
    expect(svg).toContain(brand.colors.primaryLight);
    expect(svg).toContain(brand.colors.signal);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("hat alle Varianten in der gewünschten Größe", () => {
    for (const v of ["rounded", "square", "foreground", "background", "monochrome"] as const) {
      expect(logoSvg(v, 512)).toContain('width="512"');
    }
    expect(logoSvg("square")).toContain('rx="0"');
    expect(logoSvg("foreground")).not.toContain("gp-bg");
  });
});

describe("Monatsübersicht Stunden", () => {
  const planned = [
    { employeeId: "o", siteId: "praxis", date: "2026-10-05", plannedMinutes: 90 },
    { employeeId: "o", siteId: "praxis", date: "2026-10-07", plannedMinutes: 90 },
    { employeeId: "o", siteId: "lager", date: "2026-10-07", plannedMinutes: 60, cancelled: true },
    { employeeId: "o", siteId: "praxis", date: "2026-11-02", plannedMinutes: 90 },
  ];
  const entries = [
    { employeeId: "o", siteId: "praxis", clockInAt: "2026-10-05T04:00:00Z", clockOutAt: "2026-10-05T05:45:00Z" },
    { employeeId: "o", siteId: "praxis", clockInAt: "2026-10-07T04:00:00Z", clockOutAt: "2026-10-07T05:15:00Z" },
    // 31.10. 23:30 deutsche Zeit gehört noch zum Oktober
    { employeeId: "o", siteId: null, clockInAt: "2026-10-31T22:30:00Z", clockOutAt: "2026-10-31T23:00:00Z" },
    { employeeId: "o", siteId: "praxis", clockInAt: "2026-10-08T04:00:00Z", clockOutAt: null },
  ];

  it("summiert je Mitarbeiter und Objekt", () => {
    const [o] = monthlyHours("2026-10", planned, entries);
    expect(o.plannedMinutes).toBe(180); // ausgefallen und November zählen nicht
    expect(o.actualMinutes).toBe(105 + 75 + 30);
    expect(o.days).toBe(3);
    expect(o.open).toBe(1);
    expect(o.rows.find((r) => r.siteId === "praxis")).toMatchObject({ visits: 2, plannedMinutes: 180, actualMinutes: 180 });
    expect(o.rows.find((r) => r.siteId === null)?.actualMinutes).toBe(30);
  });

  it("kennt Monatsgrenzen", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("schreibt CSV fürs Lohnbüro", () => {
    expect(decimalHours(90)).toBe("1,50");
    expect(decimalHours(-30)).toBe("-0,50");
    const csv = hoursCsv("2026-10", monthlyHours("2026-10", planned, entries), {
      employee: () => "Oksana; K.",
      site: (id) => (id === "praxis" ? "Praxis Dr. Meyer" : "ohne Objekt"),
    });
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe("Monat;Mitarbeiter;Objekt;Einsätze;Geplant (Std.);Gestempelt (Std.);Differenz (Std.)");
    expect(lines).toContain('2026-10;"Oksana; K.";Praxis Dr. Meyer;2;3,00;3,00;0,00');
    expect(lines.at(-1)).toBe('2026-10;"Oksana; K.";Summe;2;3,00;3,50;0,50');
  });
});

describe("Offline", () => {
  it("erkennt fehlendes Netz", () => {
    expect(isNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "Network request failed" })).toBe(true);
    expect(isNetworkError({ message: "nicht_am_objekt", code: "P0001" })).toBe(false);
    expect(isNetworkError({ message: "fetch failed", status: 500 })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe("Kalkulation", () => {
  const s = { wageCents: 1500, ancillaryPercent: 80, materialPercent: 5, overheadPercent: 12, profitPercent: 8 };

  it("rechnet Zeit, Stundensatz und Monatspreis", () => {
    const r = calculateOffer({ areaM2: 600, m2PerHour: 200, extraMinutes: 15, visitsPerWeek: 3 }, s);
    expect(r.minutesPerVisit).toBe(195); // 3 h + 15 min
    expect(r.visitsPerMonth).toBeCloseTo(13, 0);
    expect(r.laborCentsPerHour).toBe(2700); // 15 € + 80 %
    expect(r.costCentsPerHour).toBe(3159); // + 17 %
    expect(r.rateCentsPerHour).toBe(3412); // + 8 %
    expect(r.hoursPerMonth).toBeCloseTo(42.25, 2);
    expect(r.priceCentsPerMonth).toBe(Math.round(3159 * 1.08 * 42.25));
    expect(r.profitCentsPerMonth).toBe(r.priceCentsPerMonth - r.costCentsPerMonth);
    expect(r.priceCentsPerM2).toBeCloseTo(r.priceCentsPerMonth / 600, 1);
  });

  it("verträgt leere Eingaben", () => {
    const r = calculateOffer({ areaM2: 0, m2PerHour: 0, extraMinutes: 0, visitsPerWeek: 0 }, defaultCalcSettings);
    expect(r.priceCentsPerMonth).toBe(0);
    expect(r.priceCentsPerVisit).toBe(0);
    expect(r.priceCentsPerM2).toBe(0);
  });

  it("liest Euro-Beträge", () => {
    expect(parseEuro("18,50")).toBe(1850);
    expect(parseEuro("1.234,5 €")).toBe(123450);
    expect(parseEuro("0.35")).toBe(35);
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("-3")).toBeNull();
  });
  it("rechnet die Rendite aus Richtpreis und Kosten", () => {
    const base = { priceCentsPerHour: 3500, wageCentsPerHour: 1540, materialCentsPerHour: 100, wearCentsPerHour: 100, travelCentsPerVisit: 0, hoursPerVisit: 1, visits: 1 };
    const r = calculateYield(base);
    expect(r.revenueCents).toBe(3500);
    expect(r.costCents).toBe(1740);
    expect(r.profitCents).toBe(1760);
    expect(r.profitCentsPerHour).toBe(1760);

    const month = calculateYield({ ...base, hoursPerVisit: 2, visits: 20, travelCentsPerVisit: 500 });
    expect(month.hours).toBe(40);
    expect(month.travelCents).toBe(10000);
    expect(month.profitCents).toBe(1760 * 40 - 10000);
    expect(month.profitCentsPerVisit).toBe(month.profitCents / 20);
    expect(calculateYield({ ...base, visits: 0 }).profitCentsPerHour).toBe(0);
  });

  it("Marktwerte liegen nie unter dem Mindestsatz", () => {
    for (const m of marketRates) {
      expect(m.fromCents).toBeGreaterThanOrEqual(minimumRates[m.kind]);
      expect(m.toCents).toBeGreaterThanOrEqual(m.fromCents);
    }
  });
});

describe("Angebote", () => {
  it("rechnet Netto, Umsatzsteuer und Brutto", () => {
    const t = offerTotals([
      { description: "Unterhaltsreinigung", quantity: 1, unit: "Monat", unitPriceCents: 96097 },
      { description: "Glasreinigung", quantity: 120, unit: "m²", unitPriceCents: 150 },
    ]);
    expect(t.netCents).toBe(96097 + 18000);
    expect(t.vatCents).toBe(Math.round(114097 * 0.19));
    expect(t.grossCents).toBe(t.netCents + t.vatCents);
  });

  it("zählt Angebotsnummern pro Jahr hoch", () => {
    expect(nextOfferNumber([], 2026)).toBe("A-2026-001");
    expect(nextOfferNumber(["A-2026-001", "A-2026-009", "A-2025-044"], 2026)).toBe("A-2026-010");
  });

  it("verwirft kaputte Positionen", () => {
    expect(parseOfferLines(null)).toEqual([]);
    expect(parseOfferLines([{ description: "", quantity: 1, unitPriceCents: 1 }, { description: "Büro", quantity: "2", unit: "Monat", unitPriceCents: 500 }]))
      .toEqual([{ description: "Büro", quantity: 2, unit: "Monat", unitPriceCents: 500 }]);
  });
});

describe("Lexoffice", () => {
  it("baut einen Rechnungsentwurf mit Leistungszeitraum", () => {
    const inv = lexofficeInvoice(
      { customerId: "k1", period: "2026-02", totalNetCents: 52000, lines: [{ description: "Büro", quantity: 1, unitPriceCents: 40000 }, { description: "Treppenhaus", quantity: 4, unitPriceCents: 3000 }] },
      "c-123",
      "2026-03-01",
    );
    expect(inv.address).toEqual({ contactId: "c-123" });
    expect(inv.lineItems[0].unitPrice).toEqual({ currency: "EUR", netAmount: 400, taxRatePercentage: 19 });
    expect(inv.lineItems[1].quantity).toBe(4);
    expect(inv.shippingConditions.shippingDate.startsWith("2026-02-01")).toBe(true);
    expect(inv.shippingConditions.shippingEndDate.startsWith("2026-02-28")).toBe(true);
    expect(inv.taxConditions).toEqual({ taxType: "net" });
  });
});
