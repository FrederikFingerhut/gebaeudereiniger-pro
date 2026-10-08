import { addDays, monthlyHours, monthRange, type EmployeeHours } from "@gp/shared";
import type { db } from "./supabase";

type Db = Awaited<ReturnType<typeof db>>;

export interface MonthHours {
  employees: EmployeeHours[];
  employeeName: (id: string) => string;
  siteName: (id: string | null) => string;
}

/** Lädt Einsätze und gestempelte Zeiten eines Monats und summiert sie. */
export async function loadMonthHours(supabase: Db, period: string): Promise<MonthHours> {
  const { from, to } = monthRange(period);
  const [{ data: visits }, { data: entries }, { data: profiles }, { data: sites }] = await Promise.all([
    supabase.from("visits").select("employee_id, site_id, date, planned_minutes, status").gte("date", from).lte("date", to).not("employee_id", "is", null),
    // Einen Tag Puffer je Seite wegen der Zeitzone; den Monat schneidet monthlyHours genau zu.
    supabase.from("time_entries").select("employee_id, clock_in_at, clock_out_at, visits(site_id)").gte("clock_in_at", addDays(from, -1)).lte("clock_in_at", addDays(to, 2)),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("sites").select("id, name"),
  ]);
  const employees = monthlyHours(
    period,
    (visits ?? []).map((v) => ({ employeeId: v.employee_id!, siteId: v.site_id, date: v.date, plannedMinutes: v.planned_minutes, cancelled: v.status === "ausgefallen" })),
    ((entries ?? []) as unknown as { employee_id: string; clock_in_at: string; clock_out_at: string | null; visits: { site_id: string } | { site_id: string }[] | null }[]).map((e) => {
      const visit = Array.isArray(e.visits) ? e.visits[0] : e.visits;
      return { employeeId: e.employee_id, siteId: visit?.site_id ?? null, clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at };
    }),
  );
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const siteNames = new Map((sites ?? []).map((s) => [s.id, s.name as string]));
  employees.sort((a, b) => (names.get(a.employeeId) ?? "").localeCompare(names.get(b.employeeId) ?? "", "de"));
  return {
    employees,
    employeeName: (id) => names.get(id) ?? "Unbekannt",
    siteName: (id) => (id ? (siteNames.get(id) ?? "Unbekanntes Objekt") : "ohne Einsatz"),
  };
}

export function periodFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
