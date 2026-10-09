import { Suspense } from "react";
import Link from "next/link";
import { formatEuro, offerTotals, parseOfferLines } from "@gp/shared";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { saveLetterhead } from "./actions";
import { Skeleton } from "@/components/skeleton";

export default function OffersPage() {
  return (
    <>
      <PageTitle note="Angebote mit deinem Logo und Briefkopf, zum Drucken oder als PDF zum Verschicken.">Angebote</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Offers />
      </Suspense>
    </>
  );
}

async function Offers() {
  const { supabase, isOffice, profile } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Angebote sehen nur Büro und Chef.</p></Card>;

  const [{ data: offers }, { data: company }] = await Promise.all([
    supabase.from("offers").select("id, number, title, recipient, lines, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("companies").select("name, address, phone, email").eq("id", profile.company_id).single(),
  ]);

  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
      <Card
        title="Deine Angebote"
        action={
          <Link href="/angebote/neu" className="rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-bold">
            Neues Angebot
          </Link>
        }
      >
        {(offers ?? []).length === 0 && (
          <p className="text-sm text-muted">
            Noch keine Angebote. Am schnellsten geht es aus der <Link href="/kalkulation" className="underline">Kalkulation</Link>: Preis ausrechnen, dann „Angebot erstellen“.
          </p>
        )}
        <ul className="divide-y divide-line">
          {(offers ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/angebote/${o.id}`} className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-soft -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <div className="font-semibold">{o.title}</div>
                  <div className="text-xs text-muted">
                    {o.number} · {o.recipient.split("\n")[0]} · {o.created_at.slice(0, 10).split("-").reverse().join(".")}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">{formatEuro(offerTotals(parseOfferLines(o.lines)).netCents)} netto</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Briefkopf">
        <p className="text-sm text-muted mb-3">Steht oben auf jedem Angebot. Ändern kann ihn nur der Chef.</p>
        <ActionForm action={saveLetterhead} submit="Speichern">
          <Field label="Firmenname">
            <input name="name" required defaultValue={company?.name ?? ""} className={inputClass} />
          </Field>
          <Field label="Anschrift">
            <textarea name="address" rows={2} defaultValue={company?.address ?? ""} placeholder={"Musterstraße 1\n30159 Hannover"} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <input name="phone" defaultValue={company?.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="E-Mail">
              <input name="email" type="email" defaultValue={company?.email ?? ""} className={inputClass} />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
