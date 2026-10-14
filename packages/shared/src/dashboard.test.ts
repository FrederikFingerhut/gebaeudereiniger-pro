import { describe, expect, it } from "vitest";
import { buildWarnings, defaultCalcSettings, lastMonths, monthFigures, siteProfits, type DashEntry, type DashSite, type DashVisit } from "./index";

const settings = { ...defaultCalcSettings, wageCents: 1500, ancillaryPercent: 0, materialPercent: 0, overheadPercent: 0 };
const sites: DashSite[] = [
  { id: "a", name: "Praxis", billingMode: "pauschale", priceCents: 50000 },
  { id: "b", name: "Lager", billingMode: "pro_einsatz", priceCents: 4000 },
  { id: "c", name: "Neu", billingMode: "pauschale", priceCents: 90000 },
];
const visits: DashVisit[] = [
  { id: "v1", siteId: "a", date: "2026-09-07", status: "erledigt", plannedMinutes: 120 },
  { id: "v2", siteId: "b", date: "2026-09-08", status: "erledigt", plannedMinutes: 60 },
  { id: "v3", siteId: "b", date: "2026-10-05", status: "erledigt", plannedMinutes: 60 },
];
const entries: DashEntry[] = [
  { visitId: "v1", clockInAt: "2026-09-07T05:00:00Z", clockOutAt: "2026-09-07T07:00:00Z" },
  { visitId: "v2", clockInAt: "2026-09-08T05:00:00Z", clockOutAt: "2026-09-08T08:00:00Z" },
];

describe("Zahlen auf einen Blick", () => {
  it("listet die letzten Monate über den Jahreswechsel", () => {
    expect(lastMonths("2027-02", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("rechnet Gewinn je Objekt nur für bediente Objekte", () => {
    const profits = siteProfits("2026-09", sites, visits, entries, settings);
    expect(profits.map((p) => p.siteId)).toEqual(["a", "b"]);
    expect(profits.find((p) => p.siteId === "b")?.profitCents).toBe(4000 - 3 * 1500);
  });

  it("summiert Monate mit Krankenquote je Person", () => {
    const [sep, oct] = monthFigures({
      months: ["2026-09", "2026-10"],
      sites,
      visits,
      entries,
      settings,
      absences: [
        { employee_id: "m1", kind: "krank", date_from: "2026-09-01", date_to: "2026-09-02", approved: null },
        { employee_id: "m2", kind: "krank", date_from: "2026-09-01", date_to: "2026-09-01", approved: null },
      ],
      staff: 2,
      today: "2026-10-14",
    });
    expect(sep.revenueCents).toBe(54000);
    expect(sep.costCents).toBe(5 * 1500);
    expect(sep.workedMinutes).toBe(300);
    // 3 Krankheitstage von 2 × 22 Arbeitstagen
    expect(sep.sickRatePercent).toBe(6.8);
    expect(oct.revenueCents).toBe(4000);
    expect(oct.sickRatePercent).toBe(0);
  });
});

describe("Warnungen", () => {
  it("warnt bei Verlust, fehlendem Stempeln, vergessenem Ausstempeln und Überstunden", () => {
    const warnings = buildWarnings({
      losses: [{ siteId: "b", siteName: "Lager", profitCents: -12000, monthLabel: "September 2026" }],
      unstarted: [
        { visitId: "v1", siteName: "Praxis", employeeName: "Olena", date: "2026-10-14", startTime: "06:00:00" },
        { visitId: "v2", siteName: "Kanzlei", employeeName: "Olena", date: "2026-10-14", startTime: "09:30:00" },
        { visitId: "v3", siteName: "Lager", employeeName: "Pawel", date: "2026-10-12", startTime: "17:00:00" },
      ],
      openEntries: [
        { entryId: "e1", employeeName: "Arjeta", siteName: "Praxis", clockInAt: "2026-10-13T16:00:00Z" },
        { entryId: "e2", employeeName: "Mahmoud", siteName: "Lager", clockInAt: "2026-10-14T06:00:00Z" },
      ],
      overtime: [
        { employeeId: "m1", employeeName: "Olena", balanceMinutes: 11 * 60 },
        { employeeId: "m2", employeeName: "Pawel", balanceMinutes: 3 * 60 },
      ],
      nowBerlin: "2026-10-14T10:00",
      now: new Date("2026-10-14T08:00:00Z"),
    });
    expect(warnings.map((w) => w.kind)).toEqual(["verlust", "nicht_gestempelt", "nicht_gestempelt", "nicht_ausgestempelt", "ueberstunden"]);
    expect(warnings[1].detail).toBe("Olena, heute ab 06:00 Uhr");
    expect(warnings[2].detail).toBe("Pawel, 12.10. ab 17:00 Uhr");
    expect(warnings[4].href).toBe("/mitarbeiter/m1");
  });

  it("fasst Material je Objekt zusammen und meldet Tauschanfragen", () => {
    const w = buildWarnings({
      losses: [],
      unstarted: [],
      openEntries: [],
      overtime: [],
      material: [
        { siteId: "s1", siteName: "Praxis", name: "Müllbeutel", status: "fehlt" },
        { siteId: "s1", siteName: "Praxis", name: "Seife", status: "wenig" },
        { siteId: "s2", siteName: "Lager", name: "Papier", status: "wenig" },
      ],
      swaps: [{ siteName: "Lager", date: "2026-10-16", from: "Olena", to: "Mahmoud" }],
      nowBerlin: "2026-10-14T10:00",
    });
    expect(w.map((x) => x.title)).toEqual(["Material fehlt: Praxis", "Material wird knapp: Lager", "Schichttausch bestätigen: Lager"]);
    expect(w[0].detail).toBe("Müllbeutel, Seife (knapp)");
    expect(w[2].detail).toBe("Mahmoud übernimmt von Olena, 16.10.");
  });
});
