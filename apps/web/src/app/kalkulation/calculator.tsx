"use client";

import { useActionState, useState } from "react";
import { calculateOffer, formatEuro, parseEuro, type CalcSettings, type PriceGuideUnit } from "@gp/shared";
import { saveCalcSettings } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums";

// Übliche Leistungswerte (m² pro Stunde) als Startpunkt; jedes Objekt ist anders.
const presets = [
  { label: "Büro", value: 200 },
  { label: "Praxis", value: 150 },
  { label: "Treppenhaus", value: 120 },
  { label: "Sanitär", value: 60 },
];

const num = (value: string) => {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const euroInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const hoursText = (h: number) => `${h.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;

export function Calculator({
  settings,
  saved,
  guides,
}: {
  settings: CalcSettings;
  saved: boolean;
  guides: { title: string; unit: PriceGuideUnit; priceCents: number }[];
}) {
  const [area, setArea] = useState("400");
  const [perf, setPerf] = useState("200");
  const [extra, setExtra] = useState("10");
  const [perWeek, setPerWeek] = useState(5);
  const [wage, setWage] = useState(euroInput(settings.wageCents));
  const [ancillary, setAncillary] = useState(String(settings.ancillaryPercent));
  const [material, setMaterial] = useState(String(settings.materialPercent));
  const [overhead, setOverhead] = useState(String(settings.overheadPercent));
  const [profit, setProfit] = useState(String(settings.profitPercent));
  const [state, save, saving] = useActionState(saveCalcSettings, null);

  const r = calculateOffer(
    { areaM2: num(area), m2PerHour: num(perf), extraMinutes: num(extra), visitsPerWeek: perWeek },
    {
      wageCents: parseEuro(wage) ?? 0,
      ancillaryPercent: num(ancillary),
      materialPercent: num(material),
      overheadPercent: num(overhead),
      profitPercent: num(profit),
    },
  );
  const hourly = guides.filter((g) => g.unit === "stunde");

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section className="bg-surface border border-line rounded-2xl p-4">
        <h2 className="font-display font-semibold text-lg mb-3">Objekt</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Labeled label="Fläche (m²)">
            <input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Leistung (m² pro Stunde)">
            <input value={perf} onChange={(e) => setPerf(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Zusatzzeit je Einsatz (Min.)">
            <input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="numeric" className={input} />
          </Labeled>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
          <span className="text-muted">Typische Leistung:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPerf(String(p.value))}
              className={`rounded-full px-2.5 py-1 font-semibold ${num(perf) === p.value ? "bg-primary text-on-primary" : "bg-soft hover:bg-line"}`}
            >
              {p.label} {p.value}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <span className="text-sm font-semibold text-muted">Einsätze pro Woche</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPerWeek(n)}
                className={`size-10 rounded-lg text-sm font-bold ${perWeek === n ? "bg-primary text-on-primary" : "bg-soft hover:bg-line"}`}
                aria-pressed={perWeek === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary text-on-primary rounded-2xl p-5" aria-live="polite">
        <div className="text-xs uppercase tracking-wider font-semibold opacity-80">Angebotspreis netto</div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mt-1">
          <div>
            <div className="font-display font-extrabold text-4xl tabular-nums">{formatEuro(r.priceCentsPerMonth)}</div>
            <div className="text-sm opacity-80">pro Monat</div>
          </div>
          <div>
            <div className="font-display font-bold text-2xl tabular-nums text-signal">{formatEuro(r.priceCentsPerVisit)}</div>
            <div className="text-sm opacity-80">pro Einsatz</div>
          </div>
          <div>
            <div className="font-display font-bold text-2xl tabular-nums">{(r.priceCentsPerM2 / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
            <div className="text-sm opacity-80">pro m² und Monat</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 text-sm">
          <Stat label="Zeit je Einsatz" value={`${Math.floor(r.minutesPerVisit / 60)}:${String(r.minutesPerVisit % 60).padStart(2, "0")} Std.`} />
          <Stat label="Stunden im Monat" value={hoursText(r.hoursPerMonth)} />
          <Stat label="Stundensatz" value={formatEuro(r.rateCentsPerHour)} />
          <Stat label="Gewinn im Monat" value={formatEuro(r.profitCentsPerMonth)} />
        </dl>
        {hourly.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/20 text-sm flex flex-col gap-1">
            {hourly.map((g) => {
              const diff = r.rateCentsPerHour - g.priceCents;
              return (
                <div key={g.title} className="flex justify-between gap-3">
                  <span className="opacity-80">Richtpreis {g.title}</span>
                  <span className="tabular-nums">
                    {formatEuro(g.priceCents)} / Std. · dein Satz {formatEuro(Math.abs(diff))} {diff >= 0 ? "drüber" : "drunter"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <form action={save} className="bg-surface border border-line rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-semibold text-lg">Lohn und Zuschläge</h2>
          {!saved && <span className="text-xs text-muted">Startwerte, bitte an deine Zahlen anpassen</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Labeled label="Stundenlohn (€)">
            <input name="wage" value={wage} onChange={(e) => setWage(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Lohnnebenkosten %">
            <input name="ancillary" value={ancillary} onChange={(e) => setAncillary(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Material %">
            <input name="material" value={material} onChange={(e) => setMaterial(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Gemeinkosten %">
            <input name="overhead" value={overhead} onChange={(e) => setOverhead(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
          <Labeled label="Gewinn %">
            <input name="profit" value={profit} onChange={(e) => setProfit(e.target.value)} inputMode="decimal" className={input} />
          </Labeled>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <span className="text-muted">
            Lohnkosten {formatEuro(r.laborCentsPerHour)} · Selbstkosten {formatEuro(r.costCentsPerHour)} pro Stunde
          </span>
          <button type="submit" disabled={saving} className="ml-auto rounded-lg bg-primary text-on-primary px-4 py-2 font-bold disabled:opacity-60">
            {saving ? "Bitte warten …" : "Als Standard speichern"}
          </button>
        </div>
        {state?.error && <p className="text-sm font-semibold text-bad mt-2">{state.error}</p>}
        {state?.ok && <p className="text-sm font-semibold text-ok mt-2">{state.ok}</p>}
      </form>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm min-w-0">
      <span className="font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="opacity-75 text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
