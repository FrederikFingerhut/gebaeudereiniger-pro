import { Suspense } from "react";
import { berlinDate, defaultInspectionAreas } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { requireMe } from "@/lib/supabase";
import { InspectionForm } from "./inspection-form";

export default function NewInspectionPage({ searchParams }: PageProps<"/qualitaet/neu">) {
  return (
    <>
      <PageTitle note="Für jeden Bereich eine Note: 1 sehr gut bis 5 mangelhaft. Fotos von Mängeln kommen in den Bericht.">Neue Prüfung</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <NewInspection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewInspection({ searchParams }: { searchParams: PageProps<"/qualitaet/neu">["searchParams"] }) {
  const { supabase, profile } = await requireMe();
  if (!["objektleiter", "buero", "chef"].includes(profile.role)) return <Card title="Keine Berechtigung"><p className="text-sm">Prüfungen machen Objektleiter, Büro und Chef.</p></Card>;

  const params = await searchParams;
  const { data: sites } = await supabase.from("sites").select("id, name").eq("active", true).order("name");
  const siteId = typeof params.objekt === "string" && sites?.some((s) => s.id === params.objekt) ? params.objekt : (sites?.[0]?.id ?? "");
  const { data: checklist } = siteId
    ? await supabase.from("checklist_items").select("title").eq("site_id", siteId).eq("active", true).order("position")
    : { data: [] };
  const areas = (checklist ?? []).map((c) => (c.title as { de?: string }).de ?? "").filter(Boolean);

  if (!sites?.length) return <Card title="Noch keine Objekte"><p className="text-sm">Lege zuerst unter „Objekte“ ein Objekt an.</p></Card>;
  return <InspectionForm key={siteId} sites={sites} siteId={siteId} areas={areas.length ? areas : defaultInspectionAreas} today={berlinDate()} />;
}
