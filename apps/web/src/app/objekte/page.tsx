import { Suspense } from "react";
import Link from "next/link";
import { formatEuro, siteFromRow, type SiteRow } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { one } from "@/lib/format";
import { setActive } from "../mitarbeiter/actions";
import { createCustomerLogin } from "./actions";
import { emptySite, SiteForm } from "./site-form";
import { Skeleton } from "@/components/skeleton";

export default function SitesPage() {
  return (
    <>
      <PageTitle>Objekte</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Sites />
      </Suspense>
    </>
  );
}

async function Sites() {
  const { supabase, isOffice } = await requireMe();
  const [{ data: rows }, { data: customers }, { data: logins }] = await Promise.all([
    supabase.from("sites").select(isOffice ? "*, site_billing(billing_mode, price_cents)" : "*").eq("active", true).order("name"),
    supabase.from("customers").select("id, name").order("name"),
    isOffice ? supabase.from("profiles").select("id, full_name, active, customers(name)").eq("role", "kunde").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const sites = ((rows ?? []) as unknown as SiteRow[]).map((r) => ({ ...siteFromRow(r), hasLocation: r.latitude !== null }));

  return (
    <div className="flex flex-col gap-4">
      {sites.length === 0 && <p className="text-sm text-muted">Noch keine Objekte. Lege unten das erste an.</p>}
      <div className="grid md:grid-cols-2 gap-4">
        {sites.map((s) => (
          <Card key={s.id} title={s.name} action={<Link href={`/objekte/${s.id}`} className="text-sm font-semibold text-primary">Bearbeiten</Link>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Adresse</dt>
              <dd>{s.address}</dd>
              {isOffice && (
                <>
                  <dt className="text-muted">Abrechnung</dt>
                  <dd>{s.billingMode === "pauschale" ? `${formatEuro(s.priceCents)} im Monat` : `${formatEuro(s.priceCents)} pro Einsatz`}</dd>
                </>
              )}
              <dt className="text-muted">Kalkuliert</dt>
              <dd>{s.plannedMinutes} Minuten pro Einsatz</dd>
              <dt className="text-muted">Stempeln</dt>
              <dd>{s.hasLocation ? <Pill tone="ok">GPS und QR-Code</Pill> : <Pill tone="warn">nur QR-Code</Pill>}</dd>
            </dl>
          </Card>
        ))}
      </div>
      <Card title="Neues Objekt">
        <SiteForm site={emptySite} customers={customers ?? []} showPrices={isOffice} />
      </Card>
      {isOffice && (customers ?? []).length > 0 && (
        <Card title="Kundenportal">
          <p className="text-sm text-muted mb-3">
            Mit einem eigenen Zugang sieht dein Kunde seine Objekte, erledigte und geplante Reinigungen und eure Prüfberichte. Reklamationen meldet er dort mit Foto. Preise sieht er nicht.
          </p>
          {(logins ?? []).length > 0 && (
            <ul className="divide-y divide-line mb-4">
              {(logins ?? []).map((l) => (
                <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold">{l.full_name}</span>
                    <span className="text-muted"> · {one(l.customers as { name: string } | { name: string }[] | null)?.name}</span>
                  </span>
                  <form action={setActive.bind(null, l.id, !l.active)}>
                    <button className={`rounded-lg px-3 py-1.5 font-semibold hover:bg-soft ${l.active ? "text-bad" : "text-primary"}`}>{l.active ? "Sperren" : "Wieder freischalten"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createCustomerLogin} submit="Kundenzugang anlegen" className="grid sm:grid-cols-2 gap-3">
            <Field label="Kunde">
              <select name="customer_id" className={inputClass}>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Name der Ansprechperson">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="E-Mail">
              <input name="email" type="email" required className={inputClass} />
            </Field>
            <Field label="Start-Passwort (mind. 8 Zeichen)">
              <input name="password" type="text" minLength={8} required autoComplete="off" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
