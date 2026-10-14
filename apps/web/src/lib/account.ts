import { addDays, berlinDate, monthAccount, monthRange, vacationLeft, type AccountAbsence, type AccountEntry, type MonthAccount, type PayrollRow } from "@gp/shared";
import type { db } from "./supabase";

type Db = Awaited<ReturnType<typeof db>>;

interface Person {
  id: string;
  full_name: string;
  weekly_hours: number | null;
  vacation_days: number;
}

/** Zeiten und Abwesenheiten für einen Monat (Abwesenheiten fürs ganze Jahr, wegen Resturlaub). */
async function loadRaw(supabase: Db, period: string, employeeId?: string) {
  const { from, to } = monthRange(period);
  const year = period.slice(0, 4);
  let entries = supabase.from("time_entries").select("employee_id, clock_in_at, clock_out_at").gte("clock_in_at", addDays(from, -1)).lte("clock_in_at", addDays(to, 2));
  let absences = supabase.from("absences").select("employee_id, kind, date_from, date_to, approved").lte("date_from", `${year}-12-31`).gte("date_to", `${year}-01-01`);
  if (employeeId) {
    entries = entries.eq("employee_id", employeeId);
    absences = absences.eq("employee_id", employeeId);
  }
  const [{ data: e }, { data: a }] = await Promise.all([entries, absences]);
  const byEmployee = <T extends { employee_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) map.set(r.employee_id, [...(map.get(r.employee_id) ?? []), r]);
    return map;
  };
  return {
    entries: byEmployee(e as (AccountEntry & { employee_id: string })[] | null),
    absences: byEmployee(a as (AccountAbsence & { employee_id: string })[] | null),
  };
}

export interface PersonAccount extends MonthAccount {
  vacationLeft: number;
}

/** Arbeitszeitkonto einer Person für einen Monat. */
export async function loadAccount(supabase: Db, person: Person, period: string): Promise<PersonAccount> {
  const raw = await loadRaw(supabase, period, person.id);
  return account(person, period, raw.entries.get(person.id) ?? [], raw.absences.get(person.id) ?? []);
}

function account(person: Person, period: string, entries: AccountEntry[], absences: AccountAbsence[]): PersonAccount {
  const month = monthAccount({ period, weeklyHours: person.weekly_hours === null ? null : Number(person.weekly_hours), entries, absences, today: berlinDate() });
  return { ...month, vacationLeft: vacationLeft(Number(person.vacation_days), absences, Number(period.slice(0, 4))) };
}

/** Monatsliste für den Steuerberater: alle aktiven Mitarbeiter (ohne Kunden-Zugänge). */
export async function loadPayroll(supabase: Db, period: string): Promise<PayrollRow[]> {
  const [{ data: people }, raw] = await Promise.all([
    supabase.from("profiles").select("id, full_name, weekly_hours, vacation_days, role, active").neq("role", "kunde").order("full_name"),
    loadRaw(supabase, period),
  ]);
  return ((people ?? []) as (Person & { active: boolean })[])
    .filter((p) => p.active || raw.entries.has(p.id))
    .map((p) => {
      const a = account(p, period, raw.entries.get(p.id) ?? [], raw.absences.get(p.id) ?? []);
      return {
        name: p.full_name,
        weeklyHours: p.weekly_hours === null ? null : Number(p.weekly_hours),
        workedMinutes: a.workedMinutes,
        targetMinutes: a.targetMinutes,
        balanceMinutes: a.balanceMinutes,
        vacationDays: a.vacationDays,
        sickDays: a.sickDays,
        vacationLeft: a.vacationLeft,
      };
    });
}
