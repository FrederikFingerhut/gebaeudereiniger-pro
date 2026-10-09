import { Suspense } from "react";
import { addDays, berlinDate } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { OfferForm } from "./offer-form";

export default function NewOfferPage({ searchParams }: PageProps<"/angebote/neu">) {
  return (
    <>
      <PageTitle note="Positionen prüfen, Empfänger wählen, speichern. Danach kannst du das Angebot drucken oder als PDF speichern.">Neues Angebot</PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <NewOffer searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewOffer({ searchParams }: { searchParams: PageProps<"/angebote/neu">["searchParams"] }) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Angebote sehen nur Büro und Chef.</p></Card>;

  const params = await searchParams;
  const param = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const { data: customers } = await supabase.from("customers").select("id, name, address").order("name");
  const cents = Number(param("preis"));

  return (
    <OfferForm
      customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, address: c.address ?? "" }))}
      initial={{
        title: param("titel") || "Angebot Unterhaltsreinigung",
        line: {
          description: param("text"),
          quantity: param("menge") || "1",
          unit: param("einheit") || "Monat",
          price: Number.isFinite(cents) && cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "",
        },
        validUntil: addDays(berlinDate(), 30),
      }}
    />
  );
}
