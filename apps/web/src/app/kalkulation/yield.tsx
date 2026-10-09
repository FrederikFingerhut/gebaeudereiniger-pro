"use client";

import { useState } from "react";
import { calculateYield, formatEuro, parseEuro } from "@gp/shared";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums";

const num = (value: string) => {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const euroInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

// Rechnet nach, was von einem Richtpreis nach Lohn und Sachkosten übrig bleibt.
export function YieldCalculator({ wageCents }: { wageCents: number }) {
  const [price, setPrice] = useState("35,00");
  const [wage, setWage] = useState(euroInput(wageCents));
  const [material, setMaterial] = useState("1,00");
  const [wear, setWear] = useState("1,00");
  const [travel, setTravel] = useState("0");
  const [hours, setHours] = useState("1");
  const [visits, setVisits] = useState("1");

  const r = calculateYield({
    priceCentsPerHour: parseEuro(price) ?? 0,
    wageCentsPerHour: parseEuro(wage) ?? 0,
    materialCentsPerHour: parseEuro(material) ?? 0,
    wearCentsPerHour: parseEuro(wear) ?? 0,
    travelCentsPerVisit: parseEuro(travel) ?? 0,
    hoursPerVisit: num(hours),
    visits: num(visits),
  });
  const loss = r.profitCents < 0;

  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h2 className="font-display font-semibold text-lg">Was bleibt übrig?</h2>
      <p className="text-sm text-muted mb-3">Richtpreis rein, Kosten raus: Ertrag pro Stunde, pro Reinigung und insgesamt.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Labeled label="Richtpreis netto (€/Std.)">
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Bruttolohn (€/Std.)">
          <input value={wage} onChange={(e) => setWage(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Material (€/Std.)">
          <input value={material} onChange={(e) => setMaterial(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Verschleiß Maschinen (€/Std.)">
          <input value={wear} onChange={(e) => setWear(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Anfahrt je Reinigung (€)">
          <input value={travel} onChange={(e) => setTravel(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Mannstunden je Reinigung">
          <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" className={input} />
        </Labeled>
        <Labeled label="Anzahl Reinigungen">
          <input value={visits} onChange={(e) => setVisits(e.target.value)} inputMode="numeric" className={input} />
        </Labeled>
        <p className="text-xs text-muted self-end pb-1">1 = einmalig, sonst z. B. Reinigungen im Monat. Mannstunden: alle Kräfte zusammen.</p>
      </div>

      <div className="grid sm:grid-cols-[1fr_1fr] gap-4 mt-4" aria-live="polite">
        <dl className="text-sm divide-y divide-line">
          <Row label="Umsatz" value={formatEuro(r.revenueCents)} />
          <Row label="Lohn" value={`− ${formatEuro(r.wageCents)}`} />
          <Row label="Material und Verschleiß" value={`− ${formatEuro(r.materialCents)}`} />
          <Row label="Anfahrt" value={`− ${formatEuro(r.travelCents)}`} />
          <Row label="Kosten zusammen" value={formatEuro(r.costCents)} strong />
        </dl>
        <div className={`rounded-xl p-4 ${loss ? "bg-bad text-on-primary" : "bg-primary text-on-primary"}`}>
          <div className="text-xs uppercase tracking-wider font-semibold opacity-80">{loss ? "Verlust" : "Ertrag"} insgesamt</div>
          <div className="font-display font-extrabold text-3xl tabular-nums">{formatEuro(r.profitCents)}</div>
          <div className="text-sm opacity-80">{r.marginPercent.toLocaleString("de-DE")} % vom Umsatz</div>
          <dl className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <dt className="opacity-75 text-xs">pro Stunde</dt>
              <dd className={`font-semibold tabular-nums ${loss ? "" : "text-signal"}`}>{formatEuro(r.profitCentsPerHour)}</dd>
            </div>
            <div>
              <dt className="opacity-75 text-xs">pro Reinigung</dt>
              <dd className="font-semibold tabular-nums">{formatEuro(r.profitCentsPerVisit)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="text-xs text-muted mt-3">Lohnnebenkosten, Verwaltung und Versicherung sind hier nicht abgezogen. Die stecken oben in „Lohn und Zuschläge“.</p>
    </section>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
