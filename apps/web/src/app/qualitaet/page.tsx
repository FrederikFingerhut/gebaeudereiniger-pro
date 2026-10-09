import { Suspense } from "react";
import Link from "next/link";
import { inspectionScore, parseInspectionItems, scoreTone } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { one } from "@/lib/format";

export default function QualityPage() {
  return (
    <>
      <PageTitle note="Objektbegehung mit Noten und Fotos. Der Bericht geht als PDF an den Kunden oder steht in seinem Kundenportal.">Qualitätskontrolle</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Quality />
      </Suspense>
    </>
  );
}

async function Quality() {
  const { supabase, profile } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) return <Card title="Keine Berechtigung"><p className="text-sm">Prüfberichte sehen Objektleiter, Büro und Chef.</p></Card>;

  const { data: rows } = await supabase
    .from("inspections")
    .select("id, date, items, sites(name), profiles(full_name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Card
      title="Prüfberichte"
      action={
        <Link href="/qualitaet/neu" className="rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-bold">
          Neue Prüfung
        </Link>
      }
    >
      {(rows ?? []).length === 0 && <p className="text-sm text-muted">Noch keine Prüfungen. Geh mit dem Handy durchs Objekt, vergib Noten und mach Fotos von Mängeln.</p>}
      <ul className="divide-y divide-line">
        {(rows ?? []).map((r) => {
          const score = inspectionScore(parseInspectionItems(r.items));
          return (
            <li key={r.id}>
              <Link href={`/qualitaet/${r.id}`} className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-soft -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <div className="font-semibold">{one(r.sites as { name: string } | { name: string }[] | null)?.name}</div>
                  <div className="text-xs text-muted">
                    {r.date.split("-").reverse().join(".")} · {one(r.profiles as { full_name: string } | { full_name: string }[] | null)?.full_name ?? "unbekannt"}
                  </div>
                </div>
                <Pill tone={scoreTone(score)}>Note {score?.toLocaleString("de-DE") ?? "–"}</Pill>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
