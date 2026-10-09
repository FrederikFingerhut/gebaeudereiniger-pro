import { Suspense } from "react";
import { defaultCalcSettings, formatEuro, priceGuideUnits, type CalcSettings, type PriceGuideUnit } from "@gp/shared";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { requireMe } from "@/lib/supabase";
import { addPriceGuide, deletePriceGuide } from "./actions";
import { Calculator } from "./calculator";

export default function CalculationPage() {
  return (
    <>
      <PageTitle note="Für Angebote: Zeit und Preis aus Fläche und Leistungswert berechnen. Daneben deine Richtpreise zum Vergleichen.">Kalkulation</PageTitle>
      <Suspense fallback={<p className="text-muted">Lädt …</p>}>
        <Calculation />
      </Suspense>
    </>
  );
}

type GuideRow = { id: string; title: string; unit: PriceGuideUnit; price_cents: number; note: string | null };

async function Calculation() {
  const { supabase, isOffice } = await requireMe();
  if (!isOffice) return <Card title="Keine Berechtigung"><p className="text-sm">Kalkulation und Richtpreise sehen nur Büro und Chef.</p></Card>;

  const [{ data: row }, { data: guideRows }] = await Promise.all([
    supabase.from("calc_settings").select("*").maybeSingle(),
    supabase.from("price_guides").select("id, title, unit, price_cents, note").order("title"),
  ]);
  const settings: CalcSettings = row
    ? {
        wageCents: row.wage_cents,
        ancillaryPercent: Number(row.ancillary_percent),
        materialPercent: Number(row.material_percent),
        overheadPercent: Number(row.overhead_percent),
        profitPercent: Number(row.profit_percent),
      }
    : defaultCalcSettings;
  const guides = (guideRows ?? []) as GuideRow[];

  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
      <Calculator settings={settings} saved={!!row} guides={guides.map((g) => ({ title: g.title, unit: g.unit, priceCents: g.price_cents }))} />

      <Card title="Richtpreise">
        {guides.length === 0 && <p className="text-sm text-muted mb-3">Noch keine Richtpreise. Trag hier deine üblichen Preise ein, z. B. Glasreinigung pro m² oder Grundreinigung pro Stunde.</p>}
        <ul className="divide-y divide-line mb-4">
          {guides.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{g.title}</div>
                {g.note && <div className="text-xs text-muted">{g.note}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold tabular-nums">{formatEuro(g.price_cents)}</span>
                <span className="text-xs text-muted">{priceGuideUnits[g.unit]}</span>
                <form action={deletePriceGuide.bind(null, g.id)}>
                  <button className="rounded-lg px-2 py-1 text-muted hover:bg-soft" aria-label={`${g.title} löschen`} title="Löschen">
                    ✕
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <ActionForm action={addPriceGuide} submit="Richtpreis hinzufügen" className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Leistung">
              <input name="title" required placeholder="z. B. Glasreinigung beidseitig" className={inputClass} />
            </Field>
          </div>
          <Field label="Preis netto (€)">
            <input name="price" required inputMode="decimal" placeholder="1,50" className={inputClass} />
          </Field>
          <Field label="Einheit">
            <select name="unit" defaultValue="m2" className={inputClass}>
              {Object.entries(priceGuideUnits).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Hinweis (optional)">
              <input name="note" placeholder="z. B. ab 100 m², Rahmen extra" className={inputClass} />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
