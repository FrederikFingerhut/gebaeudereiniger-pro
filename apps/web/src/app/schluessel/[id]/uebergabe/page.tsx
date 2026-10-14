import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { one } from "@/lib/format";
import { saveHandover } from "../../actions";
import { SignaturePad } from "./signature-pad";
import { Skeleton } from "@/components/skeleton";

// Schlüsselübergabe direkt am Handy oder Tablet ausfüllen und unterschreiben lassen.
export default function HandoverPage({ params }: PageProps<"/schluessel/[id]/uebergabe">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Handover params={params} />
    </Suspense>
  );
}

async function Handover({ params }: { params: PageProps<"/schluessel/[id]/uebergabe">["params"] }) {
  const { id } = await params;
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return <Card title="Keine Berechtigung"><p className="text-sm">Übergaben protokollieren Objektleiter, Büro und Chef.</p></Card>;
  const [{ data: key }, { data: people }, { data: company }] = await Promise.all([
    supabase.from("site_keys").select("id, label, count, holder_id, holder_name, sites(name)").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").neq("role", "kunde").eq("active", true).order("full_name"),
    supabase.from("companies").select("name").eq("id", profile.company_id).single(),
  ]);
  if (!key) notFound();
  const site = one(key.sites as { name: string } | { name: string }[] | null)?.name;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div>
        <Link href="/schluessel" className="text-sm font-semibold text-muted hover:underline">‹ Alle Schlüssel</Link>
      </div>
      <PageTitle note={`${site} · zurzeit bei ${key.holder_name ?? `${company?.name ?? "Büro"} (Büro)`}`}>Übergabe: {key.label}</PageTitle>
      <Card title="Protokoll">
        <ActionForm action={saveHandover.bind(null, id)} submit="Übergabe speichern und Protokoll öffnen" className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Übergibt">
              <input name="from_name" defaultValue={key.holder_name ?? profile.full_name} required className={inputClass} />
            </Field>
            <Field label="Anzahl Schlüssel">
              <input name="count" type="number" min={1} max={99} defaultValue={key.count} className={inputClass} />
            </Field>
            <Field label="Bekommt (Mitarbeiter)">
              <select name="to_profile" defaultValue="" className={inputClass}>
                <option value="">– anderer Empfänger, Name rechts –</option>
                {(people ?? [])
                  .filter((p) => p.id !== key.holder_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
              </select>
            </Field>
            <Field label="oder Name (z. B. Hausmeister, Kunde, Büro)">
              <input name="to_name" placeholder="Vor- und Nachname" className={inputClass} />
            </Field>
          </div>
          <Field label="Bemerkung (optional)">
            <input name="note" placeholder="z. B. inkl. Transponder Nr. 12" className={inputClass} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <SignaturePad name="signature_from" label="Unterschrift Übergebende(r)" />
            <SignaturePad name="signature_to" label="Unterschrift Empfänger(in)" />
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
