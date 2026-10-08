import { Suspense } from "react";
import { berlinDate, compareSiteHours, workedMinutes, type VisitStatus } from "@gp/shared";
import { Card, PageTitle, Pill, StatusPill } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { clockTime, hours, one } from "@/lib/format";
import { markReportDone } from "./actions";

export default function OverviewPage() {
  return (
    <>
      <PageTitle>Übersicht</PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

type VisitToday = {
  id: string;
  start_time: string;
  status: VisitStatus;
  sites: { name: string } | null;
  profiles: { full_name: string } | null;
};

async function Overview() {
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return <EmployeeHint />;

  const today = berlinDate();
  const monthStart = today.slice(0, 8) + "01";
  await supabase.rpc("ensure_visits", { p_from: today, p_to: today });

  const [visitsRes, reportsRes, absencesRes, monthRes] = await Promise.all([
    supabase.from("visits").select("id, start_time, status, sites(name), profiles(full_name)").eq("date", today).order("start_time"),
    supabase.from("reports").select("id, kind, text, created_at, sites(name), profiles(full_name)").eq("status", "offen").order("created_at", { ascending: false }),
    supabase.from("absences").select("id, kind, date_to, profiles(full_name)").lte("date_from", today).gte("date_to", today),
    supabase.from("time_entries").select("clock_in_at, clock_out_at, visits(site_id, planned_minutes, sites(name))").gte("clock_in_at", monthStart),
  ]);
  const visits = (visitsRes.data ?? []) as unknown as VisitToday[];
  const { data: entries } = await supabase
    .from("time_entries")
    .select("visit_id, clock_in_at, clock_out_at")
    .in("visit_id", visits.map((v) => v.id));
  const entryByVisit = new Map((entries ?? []).map((e) => [e.visit_id, e]));

  type MonthRow = { clock_in_at: string; clock_out_at: string | null; visits: { site_id: string; planned_minutes: number; sites: { name: string } | null } | null };
  const month = ((monthRes.data ?? []) as unknown as MonthRow[]).filter((e) => e.visits);
  const siteNames = new Map(month.map((e) => [e.visits!.site_id, one(e.visits!.sites)?.name ?? ""]));
  const siteHours = compareSiteHours(
    month.map((e) => ({ siteId: e.visits!.site_id, plannedMinutes: e.visits!.planned_minutes })),
    month.map((e) => ({ siteId: e.visits!.site_id, minutes: workedMinutes({ visitId: "", employeeId: "", clockInAt: e.clock_in_at, clockOutAt: e.clock_out_at ?? undefined }) })),
  );
  const max = Math.max(1, ...siteHours.map((h) => Math.max(h.plannedMinutes, h.actualMinutes)));
  const done = visits.filter((v) => v.status === "erledigt").length;
  const running = visits.filter((v) => v.status === "laeuft").length;
  const reports = (reportsRes.data ?? []) as unknown as { id: string; kind: string; text: string; created_at: string; sites: { name: string } | null; profiles: { full_name: string } | null }[];
  const absences = (absencesRes.data ?? []) as unknown as { id: string; kind: string; date_to: string; profiles: { full_name: string } | null }[];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          ["Einsätze heute", String(visits.length), `${done} erledigt, ${running} laufen`],
          ["Stunden diesen Monat", hours(siteHours.reduce((s, h) => s + h.actualMinutes, 0)), `kalkuliert ${hours(siteHours.reduce((s, h) => s + h.plannedMinutes, 0))}`],
          ["Offene Meldungen", String(reports.length), "von Mitarbeitern"],
          ["Abwesend heute", String(absences.length), absences.map((a) => one(a.profiles)?.full_name).join(", ") || "niemand"],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-surface border border-line rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted">{label}</div>
            <div className="font-display font-extrabold text-2xl mt-1">{value}</div>
            <div className="text-xs text-muted truncate">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <Card title="Lohnt sich das Objekt?" action={<span className="text-xs text-muted">Balken = echte Stunden, Strich = kalkuliert</span>}>
            {siteHours.length === 0 && <p className="text-sm text-muted">Noch keine gestempelten Zeiten in diesem Monat.</p>}
            <ul className="flex flex-col gap-3">
              {siteHours.map((h) => (
                <li key={h.siteId} className="grid grid-cols-[minmax(0,1fr)_64px] sm:grid-cols-[180px_minmax(0,1fr)_64px] gap-x-3 gap-y-1 items-center text-sm">
                  <span className="truncate">{siteNames.get(h.siteId)}</span>
                  <div className="relative h-4 rounded bg-soft col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto">
                    <div className={`h-full rounded ${h.deviationPercent > 10 ? "bg-warn" : "bg-primary"}`} style={{ width: `${(h.actualMinutes / max) * 100}%` }} />
                    <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${(h.plannedMinutes / max) * 100}%` }} />
                  </div>
                  <span className="justify-self-end">
                    <Pill tone={h.deviationPercent > 10 ? "warn" : "ok"}>
                      {h.deviationPercent > 0 ? "+" : ""}
                      {h.deviationPercent} %
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Meldungen">
            {reports.length === 0 && <p className="text-sm text-muted">Keine offenen Meldungen.</p>}
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">{one(r.sites)?.name ?? "Allgemein"}</div>
                    <div>{r.text}</div>
                    <div className="text-xs text-muted">
                      {one(r.profiles)?.full_name} · {new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                  <form action={markReportDone.bind(null, r.id)}>
                    <button className="rounded-lg bg-soft px-3 py-1.5 text-sm font-semibold whitespace-nowrap">Erledigt</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Heute live" action={<Pill tone="ok">{done} von {visits.length} erledigt</Pill>}>
          {visits.length === 0 && <p className="text-sm text-muted">Heute sind keine Einsätze geplant.</p>}
          <ul className="divide-y divide-line">
            {visits.map((v) => {
              const e = entryByVisit.get(v.id);
              const label = e ? (e.clock_out_at ? `${clockTime(e.clock_in_at)} bis ${clockTime(e.clock_out_at)}` : `seit ${clockTime(e.clock_in_at)}`) : `ab ${v.start_time.slice(0, 5)}`;
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{one(v.sites)?.name}</div>
                    <div className="text-xs text-muted">
                      {one(v.profiles)?.full_name ?? "nicht besetzt"} · {label}
                    </div>
                  </div>
                  <StatusPill status={v.status} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function EmployeeHint() {
  return (
    <Card title="Bitte die Handy-App benutzen">
      <p className="text-sm">Mitarbeiter sehen ihre Einsätze und stempeln in der App auf dem Handy.</p>
    </Card>
  );
}
