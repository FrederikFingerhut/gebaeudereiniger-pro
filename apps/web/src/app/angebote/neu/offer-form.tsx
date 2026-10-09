"use client";

import { useActionState, useState } from "react";
import { formatEuro, offerTotals, offerUnits, parseEuro } from "@gp/shared";
import { Field, inputClass } from "@/components/action-form";
import { saveOffer } from "../actions";

type Line = { description: string; quantity: string; unit: string; price: string };
const empty: Line = { description: "", quantity: "1", unit: "pauschal", price: "" };

export function OfferForm({
  customers,
  initial,
}: {
  customers: { id: string; name: string; address: string }[];
  initial: { title: string; line: Line; validUntil: string };
}) {
  const [state, action, pending] = useActionState(saveOffer, null);
  const [customerId, setCustomerId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [lines, setLines] = useState<Line[]>([initial.line]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const totals = offerTotals(
    lines.map((l) => ({ description: l.description, quantity: Number(l.quantity.replace(",", ".")) || 0, unit: l.unit, unitPriceCents: parseEuro(l.price) ?? 0 })),
  );

  return (
    <form action={action} className="flex flex-col gap-4 max-w-4xl">
      <section className="bg-surface border border-line rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
        <Field label="Kunde (optional)">
          <select
            name="customer_id"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              const c = customers.find((c) => c.id === e.target.value);
              if (c) setRecipient([c.name, c.address].filter(Boolean).join("\n"));
            }}
            className={inputClass}
          >
            <option value="">Neuer Interessent</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Betreff">
          <input name="title" required defaultValue={initial.title} className={inputClass} />
        </Field>
        <Field label="Empfänger (wie auf dem Briefumschlag)">
          <textarea name="recipient" required rows={4} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={"Firma Muster GmbH\nFrau Muster\nHauptstraße 5\n30159 Hannover"} className={inputClass} />
        </Field>
        <div className="flex flex-col gap-3">
          <Field label="Gültig bis">
            <input name="valid_until" type="date" defaultValue={initial.validUntil} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <h2 className="font-display font-semibold text-lg mb-3">Positionen</h2>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_5rem_7rem_7rem_auto] gap-2 items-end border-b border-line pb-3 last:border-0">
              <div className="col-span-2 sm:col-span-1">
                <Field label="Leistung">
                  <input name="description" value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="z. B. Unterhaltsreinigung Büro, ca. 400 m², 5× pro Woche" className={inputClass} />
                </Field>
              </div>
              <Field label="Menge">
                <input name="quantity" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Einheit">
                <select name="unit" value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} className={inputClass}>
                  {offerUnits.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preis netto (€)">
                <input name="price" value={l.price} onChange={(e) => update(i, { price: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} />
              </Field>
              <button
                type="button"
                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [empty]))}
                className="rounded-lg px-3 py-2 text-muted hover:bg-soft"
                aria-label="Position entfernen"
                title="Entfernen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, empty])} className="mt-3 rounded-lg bg-soft hover:bg-line px-3 py-2 text-sm font-semibold">
          + Position
        </button>
        <dl className="mt-4 ml-auto max-w-xs text-sm flex flex-col gap-1">
          <div className="flex justify-between"><dt className="text-muted">Netto</dt><dd className="tabular-nums">{formatEuro(totals.netCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Umsatzsteuer 19 %</dt><dd className="tabular-nums">{formatEuro(totals.vatCents)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Gesamt</dt><dd className="tabular-nums">{formatEuro(totals.grossCents)}</dd></div>
        </dl>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <Field label="Hinweis unter dem Angebot (optional)">
          <textarea name="note" rows={2} placeholder="z. B. Reinigungsmittel und Anfahrt sind im Preis enthalten." className={inputClass} />
        </Field>
      </section>

      {state?.error && <p className="text-sm font-semibold text-bad">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary text-on-primary px-5 py-2.5 font-bold disabled:opacity-60">
          {pending ? "Bitte warten …" : "Angebot speichern"}
        </button>
      </div>
    </form>
  );
}
