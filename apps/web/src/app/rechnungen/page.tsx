import { Suspense } from "react";
import { berlinDate, monthLabel } from "@gp/shared";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { loadDrafts } from "@/lib/invoices";
import { saveLexofficeKey } from "./actions";
import { InvoiceList } from "./invoice-list";

export default function InvoicesPage({ searchParams }: PageProps<"/rechnungen">) {
  return (
    <>
      <PageTitle note="Die App berechnet die Entwürfe aus Pauschalen, erledigten Einsätzen und Sonderleistungen. Schreiben, versenden und mahnen macht weiter Lexoffice.">
        Rechnungen
      </PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <Invoices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Invoices({ searchParams }: { searchParams: PageProps<"/rechnungen">["searchParams"] }) {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Rechnungen sehen nur Büro und Chef.</p></Card>;

  const params = await searchParams;
  const period = typeof params.monat === "string" && /^\d{4}-\d{2}$/.test(params.monat) ? params.monat : berlinDate().slice(0, 7);
  const [y, m] = period.split("-").map(Number);

  const [drafts, { data: done }, { data: integration }] = await Promise.all([
    loadDrafts(supabase, period),
    supabase.from("invoices").select("customer_id, handed_over_at").eq("period", `${period}-01`).not("lexoffice_invoice_id", "is", null),
    supabase.from("company_integrations").select("lexoffice_api_key, updated_at").maybeSingle(),
  ]);
  const connected = !!integration?.lexoffice_api_key;

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/rechnungen?monat=${prev}`}>‹</a>
        <span className="font-display text-lg">{monthLabel(period)}</span>
        <a className="rounded-lg bg-soft px-3 py-1.5" href={`/rechnungen?monat=${next}`}>›</a>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted">Keine Entwürfe: Hinterlege bei den Objekten einen Preis.</p>
      ) : (
        <InvoiceList drafts={drafts} period={period} connected={connected} handedOver={(done ?? []).map((d) => d.customer_id)} />
      )}

      <Card title={connected ? "Lexoffice ist verbunden ✓" : "Lexoffice verbinden"}>
        {connected ? (
          <p className="text-sm text-muted mb-3">
            Übergebene Rechnungen findest du in Lexoffice unter Rechnungen als Entwurf. Dort prüfen, fertigstellen und versenden. Schlüssel ändern oder leer speichern zum Trennen:
          </p>
        ) : (
          <ol className="text-sm text-muted mb-3 list-decimal pl-5 flex flex-col gap-0.5">
            <li>In Lexoffice anmelden.</li>
            <li>Oben rechts auf dein Profil, dann „Erweiterungen“ und „Public API“ öffnen.</li>
            <li>„Neuen API-Schlüssel erstellen“, den Schlüssel kopieren und hier einfügen.</li>
          </ol>
        )}
        <ActionForm action={saveLexofficeKey} submit={connected ? "Speichern" : "Verbinden"} className="flex flex-col gap-3 max-w-lg">
          <Field label="API-Schlüssel">
            <input name="key" type="password" autoComplete="off" placeholder={connected ? "••••••••  (gespeichert)" : "Schlüssel aus Lexoffice einfügen"} className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
