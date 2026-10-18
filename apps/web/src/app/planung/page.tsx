import { Suspense } from "react";
import Link from "next/link";
import { addDays, berlinDate, mondayOf, type ProfileRow, type VisitStatus } from "@gp/shared";
import { Card, PageTitle, StatusPill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { dayLabel } from "@/lib/format";
import { createVisit, editVisit, endSeries, saveSeries } from "./actions";
import { WeekBoard } from "./board";
import { Skeleton } from "@/components/skeleton";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const RHYTHM = ["jede Woche", "alle 2 Wochen", "alle 3 Wochen", "alle 4 Wochen"];

type Option = { id: string; name: string };
type SeriesRow = { id: string; site_id: string; employee_id: string; weekdays: number[]; interval_weeks: number; start_time: string; planned_minutes: number; valid_from: string; valid_until: string | null };

/** Felder für einen wiederkehrenden Einsatz, leer zum Anlegen oder gefüllt zum Ändern. */
function SeriesFields({ sites, staff, series }: { sites: Option[]; staff: Option[]; series?: SeriesRow }) {
  return (
    <>
      <Field label="Objekt">
        <select name="site_id" required defaultValue={series?.site_id} className={inputClass}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Mitarbeiter">
        <select name="employee_id" required defaultValue={series?.employee_id} className={inputClass}>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Uhrzeit">
        <input name="start_time" type="time" required defaultValue={series ? series.start_time.slice(0, 5) : "06:00"} className={inputClass} />
      </Field>
      <Field label={series ? "Minuten" : "Minuten (leer = wie beim Objekt)"}>
        <input name="planned_minutes" type="number" min={5} defaultValue={series?.planned_minutes} className={inputClass} />
      </Field>
      <Field label="Rhythmus">
        <select name="interval_weeks" defaultValue={series?.interval_weeks ?? 1} className={inputClass}>
          {RHYTHM.map((r, i) => (
            <option key={r} value={i + 1}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Ab Datum (diese Woche ist dabei)">
        <input name="valid_from" type="date" defaultValue={series?.valid_from ?? berlinDate()} className={inputClass} />
      </Field>
      <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-semibold text-muted">Wochentage</span>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" name="weekday" value={i + 1} defaultChecked={series ? series.weekdays.includes(i + 1) : i < 5} /> {d}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

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

type VisitRow = { id: string; site_id: string; employee_id: string | null; date: string; start_time: string; planned_minutes: number; note: string | null; status: VisitStatus };

async function Planning({ searchParams }: { searchParams: PageProps<"/planung">["searchParams"] }) {
  const params = await searchParams;
  const week = typeof params.woche === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.woche) ? mondayOf(params.woche) : mondayOf(berlinDate());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const { supabase } = await requireMe();
  await supabase.rpc("ensure_visits", { p_from: week, p_to: days[6] });

  const [{ data: sites }, { data: people }, { data: visits }, { data: series }] = await Promise.all([
    supabase.from("sites").select("id, name, planned_minutes").eq("active", true).order("name"),
    supabase.from("profiles").select("*").eq("active", true).neq("role", "kunde").order("full_name"),
    supabase.from("visits").select("id, site_id, employee_id, date, start_time, planned_minutes, note, status").gte("date", week).lte("date", days[6]).order("start_time"),
    supabase.from("visit_series").select("id, site_id, employee_id, weekdays, interval_weeks, start_time, planned_minutes, valid_from, valid_until").or(`valid_until.is.null,valid_until.gte.${berlinDate()}`),
  ]);
  const staff = (people ?? []) as ProfileRow[];
  const name = (id: string | null) => staff.find((p) => p.id === id)?.full_name ?? "nicht besetzt";
  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? "";
  const rows = (visits ?? []) as VisitRow[];
  const siteOptions = (sites ?? []).map((s) => ({ id: s.id, name: s.name }));
  const staffOptions = staff.map((p) => ({ id: p.id, name: p.full_name }));

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={`Woche ${dayLabel(days[0])} bis ${dayLabel(days[6])}`}
        action={
          <div className="flex gap-2 text-sm font-semibold">
            <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/planung?woche=${addDays(week, -7)}`}>‹ Vorher</Link>
            <Link className="rounded-lg bg-soft px-3 py-1.5" href="/planung">Heute</Link>
            <Link className="rounded-lg bg-soft px-3 py-1.5" href={`/planung?woche=${addDays(week, 7)}`}>Weiter ›</Link>
            <Link className="rounded-lg bg-soft px-3 py-1.5" href="/planung/tausch">Schichttausch</Link>
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

      <Card title="Einzelnen Auftrag einplanen">
        <p className="text-sm text-muted mb-3">Für Aufträge, die nur einmal anfallen, z. B. eine Grundreinigung oder Fensterputz.</p>
        <ActionForm action={createVisit} submit="Einplanen" className="grid sm:grid-cols-2 gap-3">
          <Field label="Objekt">
            <select name="site_id" required className={inputClass}>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Mitarbeiter">
            <select name="employee_id" className={inputClass}>
              {staffOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="">Noch nicht besetzt</option>
            </select>
          </Field>
          <Field label="Tag">
            <input name="date" type="date" required min={berlinDate()} defaultValue={berlinDate()} className={inputClass} />
          </Field>
          <Field label="Uhrzeit">
            <input name="start_time" type="time" required defaultValue="08:00" className={inputClass} />
          </Field>
          <Field label="Minuten (leer = wie beim Objekt)">
            <input name="planned_minutes" type="number" min={5} className={inputClass} />
          </Field>
          <Field label="Hinweis für den Mitarbeiter">
            <input name="note" maxLength={300} className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      <Card title="Einsätze dieser Woche ändern">
        {rows.length === 0 && <p className="text-sm text-muted">Keine Einsätze in dieser Woche.</p>}
        <ul className="divide-y divide-line">
          {rows.map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <details>
                <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                  {dayLabel(v.date)} {v.start_time.slice(0, 5)} · <b>{siteName(v.site_id)}</b> · {name(v.employee_id)} <StatusPill status={v.status} />
                  {v.status === "geplant" && <span className="text-primary font-semibold">Ändern</span>}
                </summary>
                {v.status === "geplant" ? (
                  <ActionForm action={editVisit.bind(null, v.id)} submit="Speichern" className="grid sm:grid-cols-2 gap-3 mt-3">
                    <Field label="Mitarbeiter">
                      <select name="employee_id" defaultValue={v.employee_id ?? ""} className={inputClass}>
                        {staffOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="">Nicht besetzt</option>
                        <option value="ausfall">Fällt aus</option>
                      </select>
                    </Field>
                    <Field label="Tag">
                      <input name="date" type="date" required defaultValue={v.date} className={inputClass} />
                    </Field>
                    <Field label="Uhrzeit">
                      <input name="start_time" type="time" required defaultValue={v.start_time.slice(0, 5)} className={inputClass} />
                    </Field>
                    <Field label="Minuten">
                      <input name="planned_minutes" type="number" min={5} defaultValue={v.planned_minutes} className={inputClass} />
                    </Field>
                    <Field label="Hinweis für den Mitarbeiter">
                      <input name="note" maxLength={300} defaultValue={v.note ?? ""} className={inputClass} />
                    </Field>
                  </ActionForm>
                ) : (
                  <p className="text-muted mt-2">Dieser Einsatz läuft schon oder ist abgeschlossen.</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Wiederkehrende Einsätze">
        <ul className="divide-y divide-line mb-4">
          {((series ?? []) as SeriesRow[]).map((s) => (
            <li key={s.id} className="py-2 text-sm">
              <details>
                <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                  <b>{siteName(s.site_id)}</b> · {name(s.employee_id)} · {s.interval_weeks > 1 && `${RHYTHM[s.interval_weeks - 1]}: `}
                  {s.weekdays.map((d) => WEEKDAYS[d - 1]).join(", ")} um {String(s.start_time).slice(0, 5)}
                  {s.valid_until && ` (bis ${String(s.valid_until).split("-").reverse().join(".")})`}
                  {!s.valid_until && <span className="text-primary font-semibold">Ändern</span>}
                </summary>
                {!s.valid_until && (
                  <div className="mt-3 flex flex-col gap-3">
                    <ActionForm action={saveSeries.bind(null, s.id)} submit="Speichern" className="grid sm:grid-cols-2 gap-3">
                      <SeriesFields sites={siteOptions} staff={staffOptions} series={s} />
                    </ActionForm>
                    <form action={endSeries.bind(null, s.id)}>
                      <button className="rounded-lg bg-soft px-3 py-1.5 font-semibold">Serie beenden</button>
                    </form>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
        <h3 className="font-semibold mb-2">Neuen wiederkehrenden Einsatz anlegen</h3>
        <ActionForm action={saveSeries.bind(null, null)} submit="Hinzufügen" className="grid sm:grid-cols-2 gap-3">
          <SeriesFields sites={siteOptions} staff={staffOptions} />
        </ActionForm>
      </Card>
    </div>
  );
}
