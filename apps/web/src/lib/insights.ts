import {
  addDays,
  berlinDate,
  buildWarnings,
  defaultCalcSettings,
  lastMonths,
  monthAccount,
  monthFigures,
  monthLabel,
  monthRange,
  siteProfits,
  type AccountAbsence,
  type AppWarning,
  type BillingMode,
  type CalcSettings,
  type DashEntry,
  type DashSite,
  type DashVisit,
  type MonthFigures,
} from "@gp/shared";
import type { db } from "./supabase";
import { one } from "./format";

type Db = Awaited<ReturnType<typeof db>>;

/** Jetzt in deutscher Zeit als "YYYY-MM-DDTHH:MM". */
function nowBerlin(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  return parts.replace(" ", "T");
}

export interface Insights {
  warnings: AppWarning[];
  /** Nur für Büro und Chef (enthält Geld) */
  figures: MonthFigures[] | null;
}

/**
 * Warnungen und Monatszahlen für die Startseite. Büro und Chef sehen auch Geld
 * (Verlust-Objekte, Umsatz, Gewinn); Objektleiter nur die Zeit-Warnungen.
 */
export async function loadInsights(supabase: Db, isOffice: boolean): Promise<Insights> {
  const today = berlinDate();
  const period = today.slice(0, 7);
  const months = lastMonths(period, 6);
  const from = `${months[0]}-01`;
  const { to } = monthRange(period);
  const weekAgo = addDays(today, -7);

  const [{ data: visits }, { data: entries }, { data: people }, { data: absences }, { data: sites }, { data: settingsRow }] = await Promise.all([
    supabase.from("visits").select("id, site_id, employee_id, date, start_time, status, planned_minutes").gte("date", isOffice ? from : weekAgo).lte("date", to),
    supabase.from("time_entries").select("id, employee_id, visit_id, clock_in_at, clock_out_at").gte("clock_in_at", addDays(isOffice ? from : `${period}-01`, -1)),
    supabase.from("profiles").select("id, full_name, role, active, weekly_hours").neq("role", "kunde"),
    supabase.from("absences").select("employee_id, kind, date_from, date_to, approved").lte("date_from", to).gte("date_to", from),
    isOffice ? supabase.from("sites").select("id, name, site_billing(billing_mode, price_cents)") : Promise.resolve({ data: [] as never[] }),
    isOffice ? supabase.from("calc_settings").select("*").maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const name = new Map((people ?? []).map((p) => [p.id, p.full_name as string]));
  const dashSites: DashSite[] = (sites ?? []).map((s: { id: string; name: string; site_billing: unknown }) => {
    const billing = one(s.site_billing as { billing_mode: BillingMode; price_cents: number } | { billing_mode: BillingMode; price_cents: number }[] | null);
    return { id: s.id, name: s.name, billingMode: billing?.billing_mode ?? "pauschale", priceCents: billing?.price_cents ?? 0 };
  });
  const siteName = new Map(dashSites.map((s) => [s.id, s.name]));
  const dashVisits: DashVisit[] = (visits ?? []).map((v) => ({ id: v.id, siteId: v.site_id, date: v.date, status: v.status, plannedMinutes: v.planned_minutes }));
  const dashEntries: DashEntry[] = (entries ?? []).map((e) => ({ visitId: e.visit_id, clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at }));
  const settings: CalcSettings = settingsRow
    ? {
        wageCents: settingsRow.wage_cents,
        ancillaryPercent: Number(settingsRow.ancillary_percent),
        materialPercent: Number(settingsRow.material_percent),
        overheadPercent: Number(settingsRow.overhead_percent),
        profitPercent: Number(settingsRow.profit_percent),
      }
    : defaultCalcSettings;
  const absenceList = (absences ?? []) as (AccountAbsence & { employee_id: string })[];

  // Objekt-Namen auch für Objektleiter (ohne Preise): aus den Einsätzen nachladen.
  if (!isOffice) {
    const ids = [...new Set((visits ?? []).map((v) => v.site_id))];
    if (ids.length) {
      const { data } = await supabase.from("sites").select("id, name").in("id", ids);
      for (const s of data ?? []) siteName.set(s.id, s.name);
    }
  }

  const started = new Set((entries ?? []).map((e) => e.visit_id));
  const visitById = new Map((visits ?? []).map((v) => [v.id, v]));
  const losses = isOffice
    ? [months[4], period].flatMap((p) =>
        siteProfits(p, dashSites, dashVisits, dashEntries, settings)
          .filter((r) => r.profitCents < 0 && r.revenueCents > 0)
          .map((r) => ({ siteId: r.siteId, siteName: r.siteName, profitCents: r.profitCents, monthLabel: monthLabel(p) })),
      )
    : [];

  const warnings = buildWarnings({
    losses,
    unstarted: (visits ?? [])
      .filter((v) => v.date >= weekAgo && v.date <= today && v.status === "geplant" && v.employee_id && !started.has(v.id))
      .map((v) => ({ visitId: v.id, siteName: siteName.get(v.site_id) ?? "Objekt", employeeName: name.get(v.employee_id!) ?? "", date: v.date, startTime: v.start_time })),
    openEntries: (entries ?? [])
      .filter((e) => !e.clock_out_at)
      .map((e) => ({ entryId: e.id, employeeName: name.get(e.employee_id) ?? "", siteName: siteName.get(visitById.get(e.visit_id ?? "")?.site_id ?? "") ?? "ohne Einsatz", clockInAt: e.clock_in_at })),
    overtime: (people ?? [])
      .filter((p) => p.active && p.weekly_hours != null)
      .map((p) => {
        const account = monthAccount({
          period,
          weeklyHours: Number(p.weekly_hours),
          entries: (entries ?? []).filter((e) => e.employee_id === p.id),
          absences: absenceList.filter((a) => a.employee_id === p.id),
          today,
        });
        return { employeeId: p.id, employeeName: p.full_name, balanceMinutes: account.balanceMinutes ?? 0 };
      }),
    nowBerlin: nowBerlin(),
  });

  const staff = (people ?? []).filter((p) => p.active && (p.role === "mitarbeiter" || p.role === "objektleiter")).length;
  const figures = isOffice ? monthFigures({ months, sites: dashSites, visits: dashVisits, entries: dashEntries, settings, absences: absenceList, staff, today }) : null;
  return { warnings, figures };
}
