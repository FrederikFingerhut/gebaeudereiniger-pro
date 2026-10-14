import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { berlinDate, languages, monthLabel, type ProfileRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { loadAccount, type PersonAccount } from "@/lib/account";
import { adminDb, requireMe } from "@/lib/supabase";
import { hours } from "@/lib/format";
import { deletePayslip, resendWelcome, saveEmployee, setActive, setPassword, uploadPayslip } from "../actions";
import { roleLabel } from "../roles";
import { Skeleton } from "@/components/skeleton";

export default function EmployeePage({ params }: PageProps<"/mitarbeiter/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Employee params={params} />
    </Suspense>
  );
}

const decimal = (n: number) => String(n).replace(".", ",");

function signed(minutes: number) {
  return `${minutes > 0 ? "+" : minutes < 0 ? "−" : "±"}${hours(Math.abs(minutes))}`;
}

function AccountTable({ title, account }: { title: string; account: PersonAccount }) {
  return (
    <div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Gestempelt</dt>
        <dd className="text-right tabular-nums">{hours(account.workedMinutes)}</dd>
        <dt className="text-muted">Soll</dt>
        <dd className="text-right tabular-nums">{account.targetMinutes === null ? "–" : hours(account.targetMinutes)}</dd>
        <dt className="text-muted">Plus/Minus</dt>
        <dd className="text-right">
          {account.balanceMinutes === null ? "–" : <Pill tone={account.balanceMinutes < 0 ? "warn" : "ok"}>{signed(account.balanceMinutes)}</Pill>}
        </dd>
        <dt className="text-muted">Urlaub / krank</dt>
        <dd className="text-right tabular-nums">
          {decimal(account.vacationDays)} / {decimal(account.sickDays)} Tage
        </dd>
      </dl>
    </div>
  );
}

async function Employee({ params }: { params: PageProps<"/mitarbeiter/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, isOffice, userId } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Diese Seite sehen nur Büro und Chef.</p></Card>;
  const { data } = await supabase.from("profiles").select("*").eq("id", id).neq("role", "kunde").maybeSingle();
  if (!data) notFound();
  const p = data as ProfileRow;
  const person = { id: p.id, full_name: p.full_name, weekly_hours: p.weekly_hours ?? null, vacation_days: p.vacation_days ?? 0 };

  const thisMonth = berlinDate().slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number);
  const lastMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const loginInfo = async () => {
    try {
      const { data } = await adminDb().auth.admin.getUserById(id);
      return { email: data.user?.email ?? null, lastSignIn: data.user?.last_sign_in_at ?? null };
    } catch {
      return { email: null, lastSignIn: null };
    }
  };
  const [current, previous, { data: slips }, login] = await Promise.all([
    loadAccount(supabase, person, thisMonth),
    loadAccount(supabase, person, lastMonth),
    supabase.from("payslips").select("id, period").eq("employee_id", id).order("period", { ascending: false }),
    loginInfo(),
  ]);
  const self = id === userId;

  return (
    <div className="flex flex-col gap-4 max-w-[52rem]">
      <div>
        <Link href="/mitarbeiter" className="text-sm font-semibold text-muted hover:underline">‹ Alle Mitarbeiter</Link>
      </div>
      <PageTitle note={`${roleLabel[p.role]}${login.email ? ` · ${login.email}` : ""}`}>{p.full_name}</PageTitle>

      <Card title="Arbeitszeitkonto" action={<span className="text-sm">Resturlaub {y}: <b>{decimal(current.vacationLeft)} Tage</b></span>}>
        <div className="grid sm:grid-cols-2 gap-6">
          <AccountTable title={`${monthLabel(thisMonth)} (bis heute)`} account={current} />
          <AccountTable title={monthLabel(lastMonth)} account={previous} />
        </div>
        {person.weekly_hours === null && <p className="text-xs text-muted mt-3">Ohne Wochenstunden gibt es kein Soll und keine Überstunden. Trag sie unten ein.</p>}
      </Card>

      <Card title="Vertrag und Kontakt">
        <ActionForm action={saveEmployee.bind(null, id)} submit="Speichern" className="grid sm:grid-cols-2 gap-3">
          <Field label="Wochenstunden laut Vertrag">
            <input name="weekly_hours" inputMode="decimal" defaultValue={person.weekly_hours === null ? "" : decimal(person.weekly_hours)} className={inputClass} />
          </Field>
          <Field label="Urlaubstage pro Jahr">
            <input name="vacation_days" inputMode="decimal" defaultValue={decimal(person.vacation_days)} className={inputClass} />
          </Field>
          <Field label="Telefon">
            <input name="phone" type="tel" defaultValue={p.phone ?? ""} className={inputClass} />
          </Field>
          <Field label="Sprache der App">
            <select name="language" defaultValue={p.language} className={inputClass}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </Field>
        </ActionForm>
      </Card>

      <Card title="Lohnabrechnungen">
        <ActionForm action={uploadPayslip.bind(null, id)} submit="Hochladen" className="flex flex-wrap items-end gap-3">
          <Field label="Monat">
            <input name="month" type="month" defaultValue={lastMonth} required className={inputClass} />
          </Field>
          <Field label="PDF-Datei">
            <input name="file" type="file" accept="application/pdf" required className="text-sm" />
          </Field>
        </ActionForm>
        <p className="text-xs text-muted mt-2">Der Mitarbeiter sieht seine Lohnabrechnungen in der App unter „Profil“ und bekommt beim Hochladen eine Nachricht.</p>
        {(slips ?? []).length > 0 && (
          <ul className="divide-y divide-line mt-3">
            {(slips ?? []).map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <a href={`/mitarbeiter/lohn/${s.id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  {monthLabel(s.period.slice(0, 7))}
                </a>
                <form action={deletePayslip.bind(null, s.id)}>
                  <button className="rounded-lg px-3 py-1.5 font-semibold text-bad hover:bg-soft">Löschen</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!self && (
        <Card title="Zugang">
          <p className="text-sm mb-3">
            {login.lastSignIn
              ? `Zuletzt angemeldet am ${new Date(login.lastSignIn).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" })}.`
              : "Hat sich noch nie angemeldet."}
          </p>
          <div className="flex flex-col gap-4">
            <ActionForm action={resendWelcome.bind(null, id)} submit="Willkommens-Mail schicken" className="flex flex-col gap-2">
              <p className="text-xs text-muted">Mit Link zur App und zum Festlegen eines eigenen Passworts.</p>
            </ActionForm>
            <ActionForm action={setPassword.bind(null, id)} submit="Passwort setzen" className="flex flex-wrap items-center gap-2">
              <input name="password" type="text" placeholder="Neues Passwort" minLength={8} className={inputClass} />
            </ActionForm>
            <form action={setActive.bind(null, id, !p.active)}>
              <button className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">{p.active ? "Deaktivieren" : "Wieder aktivieren"}</button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
