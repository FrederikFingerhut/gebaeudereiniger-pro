import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseInspectionItems } from "@gp/shared";
import { Card } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { InspectionReport } from "@/components/inspection-report";
import { PrintButton } from "@/app/angebote/[id]/print-button";
import { requireMe } from "@/lib/supabase";
import { one } from "@/lib/format";
import { deleteInspection } from "../actions";

export default function InspectionPage({ params }: PageProps<"/qualitaet/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <InspectionView params={params} />
    </Suspense>
  );
}

async function InspectionView({ params }: { params: PageProps<"/qualitaet/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, profile } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) return <Card title="Keine Berechtigung"><p className="text-sm">Prüfberichte sehen Objektleiter, Büro und Chef.</p></Card>;

  const [{ data: row }, { data: company }] = await Promise.all([
    supabase.from("inspections").select("id, date, note, items, photo_paths, sites(name, address), profiles(full_name)").eq("id", id).maybeSingle(),
    supabase.from("companies").select("name, address, phone, email").eq("id", profile.company_id).single(),
  ]);
  if (!row) notFound();
  const site = one(row.sites as { name: string; address: string | null } | { name: string; address: string | null }[] | null);
  const { data: signed } = row.photo_paths.length ? await supabase.storage.from("fotos").createSignedUrls(row.photo_paths, 3600) : { data: [] };

  return (
    <div className="flex flex-col gap-4 max-w-[52rem]">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/qualitaet" className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">‹ Alle Prüfungen</Link>
        <PrintButton />
        <form action={deleteInspection.bind(null, row.id)} className="ml-auto">
          <button className="rounded-lg px-3 py-2 text-sm font-semibold text-bad hover:bg-soft">Löschen</button>
        </form>
      </div>
      <p className="text-xs text-muted print:hidden">
        Kunden mit eigenem Zugang sehen diesen Bericht auch im Kundenportal. Sonst im Druckfenster „Als PDF speichern“ wählen und per Mail schicken.
      </p>
      <InspectionReport
        inspection={{
          date: row.date,
          note: row.note,
          items: parseInspectionItems(row.items),
          site: site?.name ?? "",
          address: site?.address,
          inspector: one(row.profiles as { full_name: string } | { full_name: string }[] | null)?.full_name,
        }}
        company={company}
        photos={(signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u)}
      />
    </div>
  );
}
