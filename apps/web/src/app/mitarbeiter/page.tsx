import { Suspense } from "react";
import { berlinDate, languages, workedMinutes, type ProfileRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { hours, one } from "@/lib/format";
import { createEmployee, decideAbsence, setActive, setPassword } from "./actions";
import { Skeleton } from "@/components/skeleton";

const roleLabel = { mitarbeiter: "Mitarbeiter", objektleiter: "Objektleiter", buero: "Büro", chef: "Chef" };

export default function EmployeesPage() {
  return (
    <>
      <PageTitle>Mitarbeiter</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Employees />
      </Suspense>
    </>
  );
}

async function Employees() {
  const { supabase, isOffice, userId } = await requireMe();
  const today = berlinDate();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: people }, { data: entries }, { data: absences }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("time_entries").select("employee_id, clock_in_at, clock_out_at").gte("clock_in_at", monthStart),
    supabase.from("absences").select("id, kind, date_from, date_to, approved, profiles(full_name)").gte("date_to", today).order("date_from"),
  ]);
  const minutes = new Map<string, number>();
  for (const e of entries ?? []) {
    minutes.set(e.employee_id, (minutes.get(e.employee_id) ?? 0) + workedMinutes({ visitId: "", employeeId: e.employee_id, clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at ?? undefined }));
  }
  const list = (people ?? []) as ProfileRow[];
  type AbsenceRow = { id: string; kind: string; date_from: string; date_to: string; approved: boolean | null; profiles: { full_name: string } | null };

  return (
    <div className="flex flex-col gap-4">
      <Card title={`${list.length} Personen`} action={<span className="text-xs text-muted">Stunden = gestempelt seit 1. des Monats</span>}>
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">
                  {p.full_name} {!p.active && <Pill tone="bad">deaktiviert</Pill>}
                </div>
                <div className="text-xs text-muted">
                  {roleLabel[p.role]} · {languages.find((l) => l.code === p.language)?.label} · {hours(minutes.get(p.id) ?? 0)}
                </div>
              </div>
              {isOffice && p.id !== userId && (
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm action={setPassword.bind(null, p.id)} submit="Passwort setzen" className="flex items-center gap-2">
                    <input name="password" type="text" placeholder="Neues Passwort" minLength={8} className={inputClass} />
                  </ActionForm>
                  <form action={setActive.bind(null, p.id, !p.active)}>
                    <button className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">{p.active ? "Deaktivieren" : "Aktivieren"}</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Krank und Urlaub">
        {(absences ?? []).length === 0 && <p className="text-sm text-muted">Keine aktuellen Abwesenheiten.</p>}
        <ul className="divide-y divide-line">
          {((absences ?? []) as unknown as AbsenceRow[]).map((a) => (
            <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <b>{one(a.profiles)?.full_name}</b> · {a.kind === "krank" ? "krank" : "Urlaub"} · {a.date_from.split("-").reverse().join(".")}
                {a.date_to !== a.date_from && ` bis ${a.date_to.split("-").reverse().join(".")}`}
              </span>
              {a.approved === null ? (
                <span className="flex gap-2">
                  <form action={decideAbsence.bind(null, a.id, true)}>
                    <button className="rounded-lg bg-soft px-3 py-1.5 font-semibold">Bestätigen</button>
                  </form>
                  <form action={decideAbsence.bind(null, a.id, false)}>
                    <button className="rounded-lg bg-soft px-3 py-1.5 font-semibold">Ablehnen</button>
                  </form>
                </span>
              ) : (
                <Pill tone={a.approved ? "ok" : "bad"}>{a.approved ? "bestätigt" : "abgelehnt"}</Pill>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isOffice && (
        <Card title="Neuer Mitarbeiter">
          <ActionForm action={createEmployee} submit="Anlegen" className="grid sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="E-Mail (für die Anmeldung in der App)">
              <input name="email" type="email" required className={inputClass} />
            </Field>
            <Field label="Start-Passwort (mindestens 8 Zeichen)">
              <input name="password" type="text" required minLength={8} className={inputClass} />
            </Field>
            <Field label="Telefon">
              <input name="phone" type="tel" className={inputClass} />
            </Field>
            <Field label="Sprache der App">
              <select name="language" defaultValue="de" className={inputClass}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Rolle">
              <select name="role" defaultValue="mitarbeiter" className={inputClass}>
                {Object.entries(roleLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
