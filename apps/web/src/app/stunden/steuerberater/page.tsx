import { Suspense } from "react";
import Link from "next/link";
import { berlinDate, monthLabel } from "@gp/shared";
import { Card } from "@/components/ui";
import { loadPayroll } from "@/lib/account";
import { hours } from "@/lib/format";
import { periodFrom } from "@/lib/hours";
import { requireMe } from "@/lib/supabase";
import { PrintButton } from "../../angebote/[id]/print-button";
import { Skeleton } from "@/components/skeleton";

// Monatsliste für den Steuerberater: Soll, Ist, Urlaub und Krankheit je Mitarbeiter.
// Zum Drucken bzw. als PDF speichern; daneben dieselbe Liste als Excel-Datei.
export default function PayrollPage({ searchParams }: PageProps<"/stunden/steuerberater">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Payroll searchParams={searchParams} />
    </Suspense>
  );
}

const decimal = (n: number | null) => (n === null ? "–" : String(n).replace(".", ","));
const signed = (minutes: number | null) => (minutes === null ? "–" : `${minutes > 0 ? "+" : minutes < 0 ? "−" : "±"}${hours(Math.abs(minutes))}`);

async function Payroll({ searchParams }: { searchParams: PageProps<"/stunden/steuerberater">["searchParams"] }) {
  const { supabase, isOffice, profile } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Diese Liste sehen nur Büro und Chef.</p></Card>;
  const period = periodFrom((await searchParams).monat, berlinDate().slice(0, 7));
  const [rows, { data: company }] = await Promise.all([
    loadPayroll(supabase, period),
    supabase.from("companies").select("name, address").eq("id", profile.company_id).single(),
  ]);
  const [y, m] = period.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-4 max-w-[60rem]">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold print:hidden">
        <Link href={`/stunden?monat=${period}`} className="rounded-lg bg-soft px-3 py-2">‹ Stunden</Link>
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/stunden/steuerberater?monat=${prev}`}>‹</a>
        <span className="font-display text-lg">{monthLabel(period)}</span>
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/stunden/steuerberater?monat=${next}`}>›</a>
        <span className="ml-auto flex flex-wrap gap-2">
          <a className="rounded-lg bg-soft px-4 py-2" href={`/stunden/steuerberater/csv?monat=${period}`} download>
            Als Excel herunterladen
          </a>
          <PrintButton />
        </span>
      </div>

      <article className="bg-white text-black rounded-2xl border border-line p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Lohnliste {monthLabel(period)}</h1>
            <p className="text-sm">Arbeitszeiten, Urlaub und Krankheit für die Lohnabrechnung</p>
          </div>
          <div className="text-sm text-right">
            <b>{company?.name}</b>
            {company?.address && <div className="whitespace-pre-line">{company.address}</div>}
          </div>
        </header>
        {rows.length === 0 ? (
          <p className="text-sm">Keine Mitarbeiter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left border-b-2 border-black">
              <tr>
                <th className="py-1 pr-2">Mitarbeiter</th>
                <th className="py-1 px-2 text-right">Std./Woche</th>
                <th className="py-1 px-2 text-right">Soll</th>
                <th className="py-1 px-2 text-right">Ist</th>
                <th className="py-1 px-2 text-right">Plus/Minus</th>
                <th className="py-1 px-2 text-right">Urlaub</th>
                <th className="py-1 px-2 text-right">Krank</th>
                <th className="py-1 pl-2 text-right">Resturlaub</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-gray-300">
                  <td className="py-1.5 pr-2 font-semibold">{r.name}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{decimal(r.weeklyHours)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.targetMinutes === null ? "–" : hours(r.targetMinutes)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{hours(r.workedMinutes)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{signed(r.balanceMinutes)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{decimal(r.vacationDays)} T.</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{decimal(r.sickDays)} T.</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{decimal(r.vacationLeft)} T.</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs mt-6">
          Ist = gestempelte Zeit. Soll = Wochenstunden ÷ 5 je Arbeitstag (Mo–Fr), Urlaubs- und Krankheitstage gelten als erfüllt; im laufenden Monat nur bis heute.
          Urlaub zählt nur bestätigt, Krankheit ab der Meldung. Feiertage sind nicht abgezogen. Erstellt am {new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}.
        </p>
      </article>
    </div>
  );
}
