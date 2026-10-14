import { Suspense } from "react";
import Link from "next/link";
import { berlinDate, contractDates, daysUntil } from "@gp/shared";
import { Card, PageTitle, Pill } from "@/components/ui";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requireMe } from "@/lib/supabase";
import { createCustomer } from "./actions";
import { Skeleton } from "@/components/skeleton";

export default function CustomersPage() {
  return (
    <>
      <PageTitle note="Ein Ordner je Kunde: Verträge mit Fristen, Fotos, Dokumente und Notizen.">Kunden</PageTitle>
      <Suspense fallback={<Skeleton />}>
        <Customers />
      </Suspense>
    </>
  );
}

const dateDe = (iso: string) => iso.split("-").reverse().join(".");

async function Customers() {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Kunden-Ordner sehen nur Büro und Chef.</p></Card>;
  const [{ data: customers }, { data: sites }, { data: files }, { data: contracts }] = await Promise.all([
    supabase.from("customers").select("id, name, address").order("name"),
    supabase.from("sites").select("customer_id").eq("active", true),
    supabase.from("customer_files").select("customer_id"),
    supabase.from("contracts").select("customer_id, ends_on, notice_months, auto_renew_months"),
  ]);
  const today = berlinDate();
  const count = (rows: { customer_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.customer_id === id).length;
  const nextNotice = (id: string) =>
    (contracts ?? [])
      .filter((c) => c.customer_id === id)
      .map((c) => contractDates({ endsOn: c.ends_on, noticeMonths: c.notice_months, autoRenewMonths: c.auto_renew_months }, today).noticeBy)
      .filter((d): d is string => !!d)
      .sort()[0];

  return (
    <div className="flex flex-col gap-4">
      <Card title={`${(customers ?? []).length} Kunden`}>
        <ul className="divide-y divide-line">
          {(customers ?? []).map((c) => {
            const notice = nextNotice(c.id);
            return (
              <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/kunden/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                  <div className="text-xs text-muted">
                    {count(sites, c.id)} Objekte · {count(files, c.id)} Dateien · {count(contracts, c.id)} Verträge
                  </div>
                </div>
                {notice && (
                  <Pill tone={daysUntil(today, notice) <= 60 ? "warn" : "muted"}>kündbar bis {dateDe(notice)}</Pill>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Neuer Kunde">
        <ActionForm action={createCustomer} submit="Anlegen" className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
