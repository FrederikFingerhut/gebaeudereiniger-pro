import { describe, expect, it } from "vitest";
import { absenceDays, monthAccount, payrollCsv, vacationLeft, weekdaysBetween, type AccountAbsence } from "./index";

describe("Arbeitszeitkonto", () => {
  it("zählt Arbeitstage Mo–Fr", () => {
    expect(weekdaysBetween("2026-10-12", "2026-10-18")).toBe(5);
    expect(weekdaysBetween("2026-10-17", "2026-10-18")).toBe(0);
    expect(weekdaysBetween("2026-10-01", "2026-10-31")).toBe(22);
  });

  it("zählt Urlaub nur bestätigt und Krankheit auch unbestätigt", () => {
    const list: AccountAbsence[] = [
      { kind: "urlaub", date_from: "2026-10-12", date_to: "2026-10-16", approved: true },
      { kind: "urlaub", date_from: "2026-10-19", date_to: "2026-10-19", approved: null },
      { kind: "krank", date_from: "2026-10-05", date_to: "2026-10-06", approved: null },
      { kind: "krank", date_from: "2026-10-07", date_to: "2026-10-07", approved: false },
    ];
    expect(absenceDays(list, "urlaub", "2026-10-01", "2026-10-31")).toBe(5);
    expect(absenceDays(list, "krank", "2026-10-01", "2026-10-31")).toBe(2);
    expect(vacationLeft(30, list, 2026)).toBe(25);
  });

  it("zählt Urlaub über den Jahreswechsel nur im Jahr", () => {
    const list: AccountAbsence[] = [{ kind: "urlaub", date_from: "2026-12-28", date_to: "2027-01-08", approved: true }];
    expect(vacationLeft(30, list, 2026)).toBe(26);
    expect(vacationLeft(30, list, 2027)).toBe(24); // 1.1. ist ein Freitag
  });

  it("rechnet Soll bis heute und Überstunden", () => {
    const account = monthAccount({
      period: "2026-10",
      weeklyHours: 20,
      today: "2026-10-09",
      entries: [
        { clock_in_at: "2026-10-05T06:00:00Z", clock_out_at: "2026-10-05T11:00:00Z" },
        { clock_in_at: "2026-10-06T06:00:00Z", clock_out_at: null },
        { clock_in_at: "2026-09-30T06:00:00Z", clock_out_at: "2026-09-30T10:00:00Z" },
      ],
      absences: [{ kind: "krank", date_from: "2026-10-08", date_to: "2026-10-08", approved: null }],
    });
    // 1.–9.10.: 7 Arbeitstage, einer krank → 6 × 4 Std. = 24 Std.
    expect(account.targetMinutes).toBe(24 * 60);
    expect(account.workedMinutes).toBe(300);
    expect(account.balanceMinutes).toBe(300 - 24 * 60);
    expect(account.sickDays).toBe(1);
  });

  it("hat ohne Wochenstunden kein Soll", () => {
    const account = monthAccount({ period: "2026-10", weeklyHours: null, today: "2026-10-31", entries: [], absences: [] });
    expect(account.targetMinutes).toBeNull();
    expect(account.balanceMinutes).toBeNull();
  });

  it("schreibt die Liste für den Steuerberater", () => {
    const csv = payrollCsv("2026-10", [{ name: "Olena K.", weeklyHours: 20, workedMinutes: 90, targetMinutes: 60, balanceMinutes: 30, vacationDays: 1.5, sickDays: 2, vacationLeft: 28.5 }]);
    expect(csv.startsWith("﻿Monat;Mitarbeiter")).toBe(true);
    expect(csv).toContain("2026-10;Olena K.;20;1,00;1,50;0,50;1,5;2;28,5");
  });
});
