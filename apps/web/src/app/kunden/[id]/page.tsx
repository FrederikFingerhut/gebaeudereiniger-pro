import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { berlinDate, contractDates, daysUntil } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { deleteContract, deleteCustomerFile, saveContract, saveCustomer, uploadCustomerFile } from "../actions";
import { FolderUpload } from "./folder-upload";
import { Skeleton } from "@/components/skeleton";

export default function CustomerPage({ params }: PageProps<"/kunden/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Customer params={params} />
    </Suspense>
  );
}

const dateDe = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "–");
const kindLabel: Record<string, string> = { vertrag: "Vertrag", foto: "Foto", sonstiges: "Sonstiges" };

type ContractRow = {
  id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  notice_months: number | null;
  auto_renew_months: number | null;
  remind_on: string | null;
  remind_note: string | null;
  file_id: string | null;
};

async function Customer({ params }: { params: PageProps<"/kunden/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Kunden-Ordner sehen nur Büro und Chef.</p></Card>;
  const [{ data: customer }, { data: sites }, { data: files }, { data: contracts }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("sites").select("id, name, address, active, site_keys(id, label, holder_name)").eq("customer_id", id).order("name"),
    supabase.from("customer_files").select("id, kind, title, path, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("contracts").select("*").eq("customer_id", id).order("created_at"),
  ]);
  if (!customer) notFound();
  const today = berlinDate();
  const photos = (files ?? []).filter((f) => f.kind === "foto");
  const docs = (files ?? []).filter((f) => f.kind !== "foto");
  const { data: thumbs } = photos.length ? await supabase.storage.from("dokumente").createSignedUrls(photos.map((p) => p.path), 3600) : { data: [] };
  const thumb = new Map((thumbs ?? []).map((t) => [t.path, t.signedUrl]));
  const fileTitle = new Map((files ?? []).map((f) => [f.id, f.title]));
  type SiteRow = { id: string; name: string; address: string; active: boolean; site_keys: { id: string; label: string; holder_name: string | null }[] };

  return (
    <div className="flex flex-col gap-4 max-w-[60rem]">
      <div>
        <Link href="/kunden" className="text-sm font-semibold text-muted hover:underline">‹ Alle Kunden</Link>
      </div>
      <PageTitle>{customer.name}</PageTitle>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Informationen">
          <ActionForm action={saveCustomer.bind(null, id)} submit="Speichern" className="grid gap-3">
            <Field label="Name">
              <input name="name" defaultValue={customer.name} required className={inputClass} />
            </Field>
            <Field label="Rechnungsadresse">
              <textarea name="address" defaultValue={customer.address ?? ""} rows={2} className={inputClass} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="E-Mail">
                <input name="email" type="email" defaultValue={customer.email ?? ""} className={inputClass} />
              </Field>
              <Field label="Telefon">
                <input name="phone" type="tel" defaultValue={customer.phone ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="Notizen (Absprachen, Wünsche, Ansprechpartner …)">
              <textarea name="notes" defaultValue={customer.notes ?? ""} rows={5} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Objekte und Schlüssel">
          {(sites ?? []).length === 0 && <p className="text-sm text-muted">Noch keine Objekte. Objekte legst du unter „Objekte“ an.</p>}
          <ul className="divide-y divide-line">
            {((sites ?? []) as unknown as SiteRow[]).map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <Link href={`/objekte/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                {!s.active && <span className="ml-2"><Pill tone="muted">inaktiv</Pill></span>}
                <div className="text-xs text-muted">{s.address}</div>
                {s.site_keys.length > 0 && (
                  <div className="text-xs mt-1">
                    🔑 {s.site_keys.map((k) => `${k.label}: ${k.holder_name ?? "im Büro"}`).join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Link href="/schluessel" className="inline-block mt-2 text-sm font-semibold text-muted hover:underline">Schlüssel und Übergaben ›</Link>
        </Card>
      </div>

      <Card title="Verträge und Fristen">
        {(contracts ?? []).length === 0 && <p className="text-sm text-muted mb-3">Noch keine Verträge eingetragen.</p>}
        <ul className="flex flex-col gap-3 mb-4">
          {((contracts ?? []) as ContractRow[]).map((c) => {
            const d = contractDates({ endsOn: c.ends_on, noticeMonths: c.notice_months, autoRenewMonths: c.auto_renew_months }, today);
            const soon = d.noticeBy && daysUntil(today, d.noticeBy) <= 60;
            return (
              <li key={c.id} className="border border-line rounded-xl p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{c.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.ended && <Pill tone="muted">abgelaufen</Pill>}
                    {d.noticeBy && <Pill tone={soon ? "warn" : "ok"}>kündbar bis {dateDe(d.noticeBy)}</Pill>}
                    {!c.ends_on && <Pill tone="muted">unbefristet</Pill>}
                  </div>
                </div>
                <div className="text-xs text-muted mt-1">
                  {c.starts_on && `Beginn ${dateDe(c.starts_on)} · `}
                  {d.end && `läuft bis ${dateDe(d.end)}`}
                  {c.notice_months !== null && ` · Kündigungsfrist ${c.notice_months} Monate`}
                  {c.auto_renew_months && ` · verlängert sich um ${c.auto_renew_months} Monate`}
                  {c.remind_on && ` · Erinnerung am ${dateDe(c.remind_on)}${c.remind_note ? `: ${c.remind_note}` : ""}`}
                  {c.file_id && (
                    <>
                      {" · "}
                      <a href={`/kunden/datei/${c.file_id}`} target="_blank" rel="noreferrer" className="underline">{fileTitle.get(c.file_id) ?? "Datei"}</a>
                    </>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-muted">Bearbeiten</summary>
                  <div className="mt-2">
                    <ContractForm customerId={id} contract={c} docs={docs} />
                    <form action={deleteContract.bind(null, c.id)} className="mt-2">
                      <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bad hover:bg-soft">Vertrag löschen</button>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">+ Vertrag eintragen</summary>
          <div className="mt-3">
            <ContractForm customerId={id} contract={null} docs={docs} />
          </div>
        </details>
        <p className="text-xs text-muted mt-3">30 Tage vor dem letzten Kündigungstag und am Tag einer Erinnerung bekommst du eine Nachricht.</p>
      </Card>

      <Card title="Ordner">
        <FolderUpload action={uploadCustomerFile.bind(null, id)} />
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4">
            {photos.map((p) => {
              const url = thumb.get(p.path);
              return (
                <figure key={p.id} className="relative group">
                  <a href={`/kunden/datei/${p.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- kurzlebige, signierte Links */}
                    {url && <img src={url} alt={p.title} className="aspect-square w-full rounded-lg object-cover border border-line" />}
                  </a>
                  <figcaption className="text-[11px] text-muted truncate">{p.title}</figcaption>
                  <form action={deleteCustomerFile.bind(null, p.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button className="rounded-md bg-surface/90 px-2 py-0.5 text-xs font-semibold text-bad" aria-label={`${p.title} löschen`}>✕</button>
                  </form>
                </figure>
              );
            })}
          </div>
        )}
        {docs.length > 0 && (
          <ul className="divide-y divide-line mt-4">
            {docs.map((f) => (
              <li key={f.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <a href={`/kunden/datei/${f.id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{f.title}</a>
                  <div className="text-xs text-muted">
                    {kindLabel[f.kind]} · {new Date(f.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                  </div>
                </div>
                <form action={deleteCustomerFile.bind(null, f.id)}>
                  <button className="rounded-lg px-3 py-1.5 font-semibold text-bad hover:bg-soft">Löschen</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {(files ?? []).length === 0 && <p className="text-sm text-muted mt-3">Der Ordner ist noch leer.</p>}
      </Card>
    </div>
  );
}

function ContractForm({ customerId, contract, docs }: { customerId: string; contract: ContractRow | null; docs: { id: string; title: string; kind: string }[] }) {
  return (
    <ActionForm action={saveContract.bind(null, customerId, contract?.id ?? null)} submit="Vertrag speichern" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Bezeichnung">
        <input name="title" defaultValue={contract?.title ?? ""} placeholder="z. B. Unterhaltsreinigung" required className={inputClass} />
      </Field>
      <Field label="Beginn">
        <input name="starts_on" type="date" defaultValue={contract?.starts_on ?? ""} className={inputClass} />
      </Field>
      <Field label="Läuft bis (leer = unbefristet)">
        <input name="ends_on" type="date" defaultValue={contract?.ends_on ?? ""} className={inputClass} />
      </Field>
      <Field label="Kündigungsfrist in Monaten">
        <input name="notice_months" type="number" min={0} max={36} defaultValue={contract?.notice_months ?? 3} className={inputClass} />
      </Field>
      <Field label="Verlängert sich um … Monate (leer = nein)">
        <input name="auto_renew_months" type="number" min={1} max={120} defaultValue={contract?.auto_renew_months ?? ""} className={inputClass} />
      </Field>
      <Field label="Vertragsdatei">
        <select name="file_id" defaultValue={contract?.file_id ?? ""} className={inputClass}>
          <option value="">keine</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Erinnerung am">
        <input name="remind_on" type="date" defaultValue={contract?.remind_on ?? ""} className={inputClass} />
      </Field>
      <Field label="Woran erinnern?">
        <input name="remind_note" defaultValue={contract?.remind_note ?? ""} placeholder="z. B. Preiserhöhung ankündigen" className={inputClass} />
      </Field>
    </ActionForm>
  );
}
