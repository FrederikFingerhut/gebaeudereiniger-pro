import { Suspense } from "react";
import Link from "next/link";
import { addDays, berlinDate, mondayOf, type ProfileRow, type VisitStatus } from "@gp/shared";
import { Card, PageTitle, StatusPill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { dayLabel } from "@/lib/format";
import { createSeries, endSeries, reassignVisit } from "./actions";
import { WeekBoard } from "./board";
import { Skeleton } from "@/components/skeleton";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function PlanningPage({ searchParams }: PageProps<"/planung">) {
  return (
    <>
      <PageTitle note="Wird automatisch aus den wiederkehrenden Einsätzen erzeugt">Einsatzplan</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Planning searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type VisitRow = { id: string; site_id: string; employee_id: string | null; date: string; start_time: string; status: VisitStatus };

async function Planning({ searchParams }: { searchParams: PageProps<"/planung">["searchParams"] }) {
  const params = await searchParams;
  const week = typeof params.woche === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.woche) ? mondayOf(params.woche) : mondayOf(berlinDate());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const { supabase } = await requireMe();
  await supabase.rpc("ensure_visits", { p_from: week, p_to: days[6] });

  const [{ data: sites }, { data: people }, { data: visits }, { data: series }] = await Promise.all([
    supabase.from("sites").select("id, name, planned_minutes").eq("active", true).order("name"),
    supabase.from("profiles").select("*").eq("active", true).neq("role", "kunde").order("full_name"),
    supabase.from("visits").select("id, site_id, employee_id, date, start_time, status").gte("date", week).lte("date", days[6]).order("start_time"),
    supabase.from("visit_series").select("id, site_id, employee_id, weekdays, start_time, valid_from, valid_until").or(`valid_until.is.null,valid_until.gte.${berlinDate()}`),
  ]);
  const staff = (people ?? []) as ProfileRow[];
  const name = (id: string | null) => staff.find((p) => p.id === id)?.full_name ?? "nicht besetzt";
  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? "";
  const rows = (visits ?? []) as VisitRow[];

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={`Woche ${dayLabel(days[0])} bis ${dayLabel(days[6])}`}
        action={
          <div className="flex gap-2 text-sm font-semibold">
            <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/planung?woche=${addDays(week, -7)}`}>‹ Vorher</Link>
            <Link className="rounded-lg bg-soft px-3 py-1.5" href="/planung">Heute</Link>
            <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/planung?woche=${addDays(week, 7)}`}>Weiter ›</Link>
          </div>
        }
      >
        {(sites ?? []).length === 0 && <p className="text-sm text-muted">Lege zuerst unter „Objekte“ ein Objekt an.</p>}
        <WeekBoard
          days={days}
          staff={staff.map((p) => ({ id: p.id, name: p.full_name }))}
          visits={rows.map((v) => ({ id: v.id, siteName: siteName(v.site_id), employeeId: v.employee_id, date: v.date, startTime: v.start_time, status: v.status }))}
        />
      </Card>

      <Card title="Einsätze dieser Woche umplanen">
        {rows.length === 0 && <p className="text-sm text-muted">Keine Einsätze in dieser Woche.</p>}
        <ul className="divide-y divide-line">
          {rows.map((v) => (
            <li key={v.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {dayLabel(v.date)} {v.start_time.slice(0, 5)} · <b>{siteName(v.site_id)}</b> · {name(v.employee_id)} <StatusPill status={v.status} />
              </span>
              {v.status === "geplant" && (
                <ActionForm action={reassignVisit.bind(null, v.id)} submit="Ändern" className="flex items-center gap-2">
                  <select name="employee_id" defaultValue={v.employee_id ?? ""} className={inputClass}>
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                    <option value="ausfall">Fällt aus</option>
                  </select>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Wiederkehrende Einsätze">
        <ul className="divide-y divide-line mb-4">
          {(series ?? []).map((s) => (
            <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <b>{siteName(s.site_id)}</b> · {name(s.employee_id)} · {(s.weekdays as number[]).map((d) => WEEKDAYS[d - 1]).join(", ")} um {String(s.start_time).slice(0, 5)}
                {s.valid_until && ` (bis ${String(s.valid_until).split("-").reverse().join(".")})`}
              </span>
              {!s.valid_until && (
                <form action={endSeries.bind(null, s.id)}>
                  <button className="rounded-lg bg-soft px-3 py-1.5 font-semibold">Beenden</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={createSeries} submit="Hinzufügen" className="grid sm:grid-cols-2 gap-3">
          <Field label="Objekt">
            <select name="site_id" required className={inputClass}>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Mitarbeiter">
            <select name="employee_id" required className={inputClass}>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Uhrzeit">
            <input name="start_time" type="time" required defaultValue="06:00" className={inputClass} />
          </Field>
          <Field label="Minuten (leer = wie beim Objekt)">
            <input name="planned_minutes" type="number" min={5} className={inputClass} />
          </Field>
          <Field label="Ab Datum">
            <input name="valid_from" type="date" defaultValue={berlinDate()} className={inputClass} />
          </Field>
          <fieldset className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-muted">Wochentage</span>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1">
                  <input type="checkbox" name="weekday" value={i + 1} defaultChecked={i < 5} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}
