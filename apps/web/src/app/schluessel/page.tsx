import { Suspense } from "react";
import Link from "next/link";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { createKey, deleteKey } from "./actions";
import { Skeleton } from "@/components/skeleton";

export default function KeysPage() {
  return (
    <>
      <PageTitle note="Wer hat welchen Schlüssel? Jede Übergabe wird mit Unterschriften protokolliert und lässt sich als PDF drucken.">Schlüssel</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Keys />
      </Suspense>
    </>
  );
}

type KeyRow = {
  id: string;
  label: string;
  count: number;
  holder_name: string | null;
  site_id: string;
  key_handovers: { id: string; handed_at: string; from_name: string; to_name: string }[];
};

async function Keys() {
  const { supabase, profile } = await requireMe();
  if (profile.role === "mitarbeiter") return <Card title="Keine Berechtigung"><p className="text-sm">Schlüssel verwalten Objektleiter, Büro und Chef.</p></Card>;
  const [{ data: sites }, { data: keys }] = await Promise.all([
    supabase.from("sites").select("id, name").eq("active", true).order("name"),
    supabase.from("site_keys").select("id, label, count, holder_name, site_id, key_handovers(id, handed_at, from_name, to_name)").order("label"),
  ]);
  const list = (keys ?? []) as KeyRow[];
  const bySite = (sites ?? []).map((s) => ({ ...s, keys: list.filter((k) => k.site_id === s.id) })).filter((s) => s.keys.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {bySite.length === 0 && <Card title="Noch keine Schlüssel"><p className="text-sm text-muted">Leg unten den ersten Schlüssel an.</p></Card>}
      {bySite.map((s) => (
        <Card key={s.id} title={s.name}>
          <ul className="divide-y divide-line">
            {s.keys.map((k) => {
              const history = [...k.key_handovers].sort((a, b) => b.handed_at.localeCompare(a.handed_at));
              return (
                <li key={k.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {k.label} {k.count > 1 && <span className="text-muted font-normal">× {k.count}</span>}
                      </div>
                      <div className="text-xs text-muted">zurzeit bei {k.holder_name ?? "im Büro"}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Link href={`/schluessel/${k.id}/uebergabe`} className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-sm font-semibold">Übergeben</Link>
                      {history.length === 0 && (
                        <form action={deleteKey.bind(null, k.id)}>
                          <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bad hover:bg-soft">Löschen</button>
                        </form>
                      )}
                    </div>
                  </div>
                  {history.length > 0 && (
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-xs font-semibold text-muted">{history.length} Übergaben</summary>
                      <ul className="mt-1 flex flex-col gap-1">
                        {history.map((h) => (
                          <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Pill tone="muted">{new Date(h.handed_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</Pill>
                            {h.from_name} → {h.to_name}
                            <Link href={`/schluessel/protokoll/${h.id}`} className="font-semibold underline">Protokoll</Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <Card title="Neuer Schlüssel">
        <ActionForm action={createKey} submit="Anlegen" className="flex flex-wrap items-end gap-3">
          <Field label="Objekt">
            <select name="site_id" required className={inputClass}>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Bezeichnung">
            <input name="label" placeholder="z. B. Haupteingang, Nr. 3" required className={inputClass} />
          </Field>
          <Field label="Anzahl">
            <input name="count" type="number" min={1} max={99} defaultValue={1} className={`${inputClass} w-24`} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
