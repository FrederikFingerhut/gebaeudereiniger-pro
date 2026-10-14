import { Suspense } from "react";
import Link from "next/link";
import { berlinDate } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { decideSwap } from "./actions";

export default function SwapsPage() {
  return (
    <>
      <PageTitle note="Mitarbeiter bieten in der App Einsätze an, ein Kollege übernimmt. Erst wenn du bestätigst, wechselt der Einsatz.">Schichttausch</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Swaps />
      </Suspense>
    </>
  );
}

type SwapRow = {
  id: string;
  status: "offen" | "angenommen" | "bestaetigt" | "abgelehnt" | "zurueckgezogen";
  note: string | null;
  created_at: string;
  decided_at: string | null;
  visits: { date: string; start_time: string; sites: { name: string } | null } | null;
  offered: { full_name: string } | null;
  taken: { full_name: string } | null;
};

const dateDe = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
const statusLabel = {
  offen: { tone: "muted", label: "wartet auf Kollegen" },
  angenommen: { tone: "warn", label: "bitte bestätigen" },
  bestaetigt: { tone: "ok", label: "bestätigt" },
  abgelehnt: { tone: "bad", label: "abgelehnt" },
  zurueckgezogen: { tone: "muted", label: "zurückgezogen" },
} as const;

async function Swaps() {
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return <Card title="Keine Berechtigung"><p className="text-sm">Tausch bestätigen Vorarbeiter, Büro und Chef.</p></Card>;
  const { data } = await supabase
    .from("visit_swaps")
    .select("id, status, note, created_at, decided_at, visits(date, start_time, sites(name)), offered:profiles!visit_swaps_offered_by_fkey(full_name), taken:profiles!visit_swaps_taken_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as unknown as SwapRow[];
  const today = berlinDate();
  const active = rows.filter((r) => (r.status === "offen" || r.status === "angenommen") && (r.visits?.date ?? "") >= today);
  const past = rows.filter((r) => !active.includes(r)).slice(0, 20);

  return (
    <div className="flex flex-col gap-4 max-w-[52rem]">
      <Card title="Offene Anfragen" action={active.length ? <Pill tone="warn">{active.length}</Pill> : undefined}>
        {active.length === 0 && <p className="text-sm text-muted">Gerade keine offenen Tauschanfragen.</p>}
        <ul className="divide-y divide-line">
          {active.map((r) => (
            <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="font-semibold">
                  {r.visits?.sites?.name} · {r.visits ? `${dateDe(r.visits.date)} ${r.visits.start_time.slice(0, 5)} Uhr` : ""}
                </div>
                <div className="text-muted">
                  {r.offered?.full_name} gibt ab{r.taken ? ` → ${r.taken.full_name} übernimmt` : ""}
                  {r.note ? ` · „${r.note}“` : ""}
                </div>
                <div className="mt-1">
                  <Pill tone={statusLabel[r.status].tone}>{statusLabel[r.status].label}</Pill>
                </div>
              </div>
              <div className="flex gap-1.5">
                {r.status === "angenommen" && (
                  <form action={decideSwap.bind(null, r.id, true)}>
                    <button className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-sm font-semibold">Bestätigen</button>
                  </form>
                )}
                <form action={decideSwap.bind(null, r.id, false)}>
                  <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bad hover:bg-soft">Ablehnen</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {past.length > 0 && (
        <Card title="Verlauf">
          <ul className="divide-y divide-line text-sm">
            {past.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {r.visits?.sites?.name} · {r.visits ? dateDe(r.visits.date) : ""} · {r.offered?.full_name}
                  {r.taken ? ` → ${r.taken.full_name}` : ""}
                </span>
                <Pill tone={statusLabel[r.status].tone}>{statusLabel[r.status].label}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Link href="/planung" className="text-sm font-semibold text-muted hover:underline">‹ Zur Planung</Link>
    </div>
  );
}
