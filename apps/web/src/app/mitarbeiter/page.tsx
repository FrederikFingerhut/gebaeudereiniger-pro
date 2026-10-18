import { Suspense } from "react";
import Link from "next/link";
import { berlinDate, languages, workedMinutes, type ProfileRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { adminDb, requireMe } from "@/lib/supabase";
import { hours, one } from "@/lib/format";
import { createEmployee, decideAbsence } from "./actions";
import { roleLabel } from "./roles";
import { Skeleton } from "@/components/skeleton";

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
    supabase.from("profiles").select("*").neq("role", "kunde").order("full_name"),
    supabase.from("time_entries").select("employee_id, clock_in_at, clock_out_at").gte("clock_in_at", monthStart),
    supabase.from("absences").select("id, kind, date_from, date_to, approved, attachment_paths, profiles(full_name)").gte("date_to", today).order("date_from"),
  ]);
  const minutes = new Map<string, number>();
  for (const e of entries ?? []) {
    minutes.set(e.employee_id, (minutes.get(e.employee_id) ?? 0) + workedMinutes({ visitId: "", employeeId: e.employee_id, clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at ?? undefined }));
  }
  const list = (people ?? []) as ProfileRow[];
  // Wer sich noch nie angemeldet hat, bekommt den Hinweis auf die Willkommens-Mail.
  const neverSignedIn = new Set<string>();
  if (isOffice) {
    try {
      const { data } = await adminDb().auth.admin.listUsers({ perPage: 1000 });
      for (const u of data.users) if (!u.last_sign_in_at) neverSignedIn.add(u.id);
    } catch {
      // Ohne geheimen Schlüssel kein Hinweis.
    }
  }
  type AbsenceRow = { id: string; kind: string; date_from: string; date_to: string; approved: boolean | null; attachment_paths: string[] | null; profiles: { full_name: string } | null };

  return (
    <div className="flex flex-col gap-4">
      <Card title={`${list.length} Personen`} action={<span className="text-xs text-muted">Stunden = gestempelt seit 1. des Monats</span>}>
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold flex flex-wrap items-center gap-2">
                  {isOffice ? (
                    <Link href={`/mitarbeiter/${p.id}`} className="hover:underline">
                      {p.full_name}
                    </Link>
                  ) : (
                    p.full_name
                  )}
                  {!p.active && <Pill tone="bad">deaktiviert</Pill>}
                  {p.active && neverSignedIn.has(p.id) && <Pill tone="warn">noch nie angemeldet</Pill>}
                </div>
                <div className="text-xs text-muted">
                  {roleLabel[p.role]} · {languages.find((l) => l.code === p.language)?.label} · {hours(minutes.get(p.id) ?? 0)}
                  {p.weekly_hours != null && ` · ${String(p.weekly_hours).replace(".", ",")} Std./Woche`}
                </div>
              </div>
              {isOffice && p.id !== userId && (
                <Link href={`/mitarbeiter/${p.id}`} className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">
                  Konto, Lohn und Zugang
                </Link>
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
                {/* Fotos der Krankmeldung: Gesundheitsdaten, nur für Büro und Chef */}
                {isOffice &&
                  (a.attachment_paths ?? []).map((_, n) => (
                    <a key={n} href={`/mitarbeiter/krankmeldung/${a.id}/${n}`} target="_blank" rel="noreferrer" className="ml-2 text-primary underline">
                      Krankmeldung{(a.attachment_paths ?? []).length > 1 ? ` ${n + 1}` : ""}
                    </a>
                  ))}
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
            <Field label="Wochenstunden laut Vertrag">
              <input name="weekly_hours" inputMode="decimal" placeholder="z. B. 20" className={inputClass} />
            </Field>
            <Field label="Urlaubstage pro Jahr">
              <input name="vacation_days" inputMode="decimal" placeholder="z. B. 28" className={inputClass} />
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
                {Object.entries(roleLabel).filter(([value]) => value !== "kunde").map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <label className="sm:col-span-2 flex items-start gap-2 text-sm">
              <input type="checkbox" name="welcome" defaultChecked className="mt-1" />
              <span>
                <b>Willkommens-Mail schicken</b>
                <span className="block text-muted">Der Mitarbeiter bekommt den Link zur App und legt sein Passwort selbst fest.</span>
              </span>
            </label>
            <Field label="Oder Start-Passwort selbst vergeben (mindestens 8 Zeichen)">
              <input name="password" type="text" minLength={8} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
