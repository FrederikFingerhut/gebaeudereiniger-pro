import { describe, expect, it } from "vitest";
import { addMonths, contractDates, daysUntil } from "./index";

describe("Verträge", () => {
  it("rechnet Monate mit Monatsende", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-31", 3)).toBe("2027-03-31");
  });

  it("berechnet die Kündigungsfrist", () => {
    expect(contractDates({ endsOn: "2027-03-31", noticeMonths: 3, autoRenewMonths: null }, "2026-10-14")).toEqual({ end: "2027-03-31", noticeBy: "2026-12-31", ended: false });
  });

  it("schreibt verlängerte Verträge fort", () => {
    // Frist für Ende 31.12.2026 war am 30.09.2026 vorbei → verlängert bis 31.12.2027
    expect(contractDates({ endsOn: "2026-12-31", noticeMonths: 3, autoRenewMonths: 12 }, "2026-10-14")).toEqual({ end: "2027-12-31", noticeBy: "2027-09-30", ended: false });
  });

  it("erkennt abgelaufene und unbefristete Verträge", () => {
    expect(contractDates({ endsOn: "2026-01-31", noticeMonths: 1, autoRenewMonths: null }, "2026-10-14").ended).toBe(true);
    expect(contractDates({ endsOn: null, noticeMonths: 3, autoRenewMonths: null }, "2026-10-14")).toEqual({ end: null, noticeBy: null, ended: false });
  });

  it("zählt Tage", () => {
    expect(daysUntil("2026-10-14", "2026-12-31")).toBe(78);
  });
});
