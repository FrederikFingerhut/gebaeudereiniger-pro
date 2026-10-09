import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseOfferLines } from "@gp/shared";
import { Card } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { deleteOffer } from "../actions";
import { OfferDocument } from "./document";
import { PrintButton } from "./print-button";

export default function OfferPage({ params }: PageProps<"/angebote/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Lädt …</p>}>
      <Offer params={params} />
    </Suspense>
  );
}

async function Offer({ params }: { params: PageProps<"/angebote/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, isOffice, profile } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Angebote sehen nur Büro und Chef.</p></Card>;

  const [{ data: offer }, { data: company }] = await Promise.all([
    supabase.from("offers").select("*").eq("id", id).maybeSingle(),
    supabase.from("companies").select("name, address, phone, email").eq("id", profile.company_id).single(),
  ]);
  if (!offer) notFound();
  const lines = parseOfferLines(offer.lines);

  return (
    <div className="flex flex-col gap-4 max-w-[52rem]">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/angebote" className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">‹ Alle Angebote</Link>
        <PrintButton />
        <form action={deleteOffer.bind(null, offer.id)} className="ml-auto">
          <button className="rounded-lg px-3 py-2 text-sm font-semibold text-bad hover:bg-soft">Löschen</button>
        </form>
      </div>
      <p className="text-xs text-muted print:hidden">
        Tipp: Im Druckfenster „Als PDF speichern“ wählen. Das PDF kannst du dann per Mail an den Kunden schicken.
      </p>

      <OfferDocument offer={{ ...offer, lines }} company={company} />
    </div>
  );
}
