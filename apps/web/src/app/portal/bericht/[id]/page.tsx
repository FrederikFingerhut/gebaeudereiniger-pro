import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseInspectionItems } from "@gp/shared";
import { Skeleton } from "@/components/skeleton";
import { InspectionReport } from "@/components/inspection-report";
import { PrintButton } from "@/app/angebote/[id]/print-button";
import { requireCustomer } from "@/lib/supabase";
import { one } from "@/lib/format";
import { PortalHeader } from "../../header";

export default function PortalReportPage({ params }: PageProps<"/portal/bericht/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <PortalReport params={params} />
    </Suspense>
  );
}

async function PortalReport({ params }: { params: PageProps<"/portal/bericht/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, profile } = await requireCustomer();
  const [{ data: row }, { data: company }] = await Promise.all([
    supabase.from("inspections").select("id, date, note, items, photo_paths, sites(name, address)").eq("id", id).maybeSingle(),
    supabase.from("companies").select("name, address, phone, email").eq("id", profile.company_id).single(),
  ]);
  if (!row) notFound();
  const site = one(row.sites as { name: string; address: string | null } | { name: string; address: string | null }[] | null);
  const { data: signed } = row.photo_paths.length ? await supabase.storage.from("fotos").createSignedUrls(row.photo_paths, 3600) : { data: [] };

  return (
    <div className="max-w-[52rem]">
      <PortalHeader company={company?.name ?? ""} />
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <Link href="/portal" className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">‹ Zurück</Link>
        <PrintButton />
      </div>
      <InspectionReport
        inspection={{ date: row.date, note: row.note, items: parseInspectionItems(row.items), site: site?.name ?? "", address: site?.address }}
        company={company}
        photos={(signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u)}
      />
    </div>
  );
}
