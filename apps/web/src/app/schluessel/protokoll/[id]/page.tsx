import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { one } from "@/lib/format";
import { PrintButton } from "../../../angebote/[id]/print-button";
import { Skeleton } from "@/components/skeleton";

// Druckbares Schlüsselübergabe-Protokoll (Drucken oder als PDF speichern).
export default function ProtocolPage({ params }: PageProps<"/schluessel/protokoll/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Protocol params={params} />
    </Suspense>
  );
}

async function Protocol({ params }: { params: PageProps<"/schluessel/protokoll/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return <Card title="Keine Berechtigung"><p className="text-sm">Protokolle sehen Objektleiter, Büro und Chef.</p></Card>;
  const [{ data: h }, { data: company }] = await Promise.all([
    supabase.from("key_handovers").select("*, site_keys(label, sites(name, address))").eq("id", id).maybeSingle(),
    supabase.from("companies").select("name, address, phone, email").eq("id", profile.company_id).single(),
  ]);
  if (!h) notFound();
  const key = one(h.site_keys as { label: string; sites: { name: string; address: string } | null } | null);
  const site = one(key?.sites);
  const when = new Date(h.handed_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "long", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-4 max-w-[52rem]">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/schluessel" className="rounded-lg bg-soft px-3 py-2 text-sm font-semibold">‹ Alle Schlüssel</Link>
        <PrintButton />
      </div>
      <article className="bg-white text-black rounded-2xl border border-line p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Schlüsselübergabe-Protokoll</h1>
            <p className="text-sm">{when} Uhr</p>
          </div>
          <div className="text-sm text-right">
            <b>{company?.name}</b>
            {company?.address && <div className="whitespace-pre-line">{company.address}</div>}
            {company?.phone && <div>{company.phone}</div>}
          </div>
        </header>
        <table className="w-full text-sm mb-8">
          <tbody className="[&_th]:text-left [&_th]:py-1.5 [&_th]:pr-4 [&_th]:w-48 [&_th]:align-top [&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-gray-300">
            <tr><th>Objekt</th><td>{site?.name}<div className="text-gray-600">{site?.address}</div></td></tr>
            <tr><th>Schlüssel</th><td>{key?.label}</td></tr>
            <tr><th>Anzahl</th><td>{h.count}</td></tr>
            <tr><th>Übergeben von</th><td>{h.from_name}</td></tr>
            <tr><th>Übergeben an</th><td>{h.to_name}</td></tr>
            {h.note && <tr><th>Bemerkung</th><td>{h.note}</td></tr>}
          </tbody>
        </table>
        <p className="text-sm mb-10">
          Der Empfänger bestätigt mit seiner Unterschrift den Erhalt der oben genannten Schlüssel. Er verwahrt sie sorgfältig, gibt sie nicht an Dritte weiter und meldet einen Verlust sofort.
        </p>
        <div className="grid grid-cols-2 gap-10">
          {[
            ["Übergebende(r)", h.from_name, h.signature_from],
            ["Empfänger(in)", h.to_name, h.signature_to],
          ].map(([role, name, sig]) => (
            <div key={role}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Unterschrift als data-URL */}
              {sig ? <img src={sig} alt={`Unterschrift ${name}`} className="h-24 object-contain" /> : <div className="h-24" />}
              <div className="border-t border-black pt-1 text-sm">
                {name} <span className="text-gray-600">({role})</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
