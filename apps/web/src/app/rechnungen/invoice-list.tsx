"use client";

import { useState, useTransition } from "react";
import { formatEuro } from "@gp/shared";
import { Card, Pill } from "@/components/ui";
import type { Draft } from "@/lib/invoices";
import { handOverInvoice } from "./actions";

export function InvoiceList({ drafts, period, connected, handedOver }: { drafts: Draft[]; period: string; connected: boolean; handedOver: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set(handedOver));
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const total = drafts.reduce((sum, d) => sum + d.totalNetCents, 0);
  const open = drafts.filter((d) => !done.has(d.customerId));

  // Nacheinander übergeben: Lexoffice erlaubt nur wenige Anfragen pro Sekunde.
  const handOver = (ids: string[]) =>
    startTransition(async () => {
      for (const id of ids) {
        setBusy(id);
        const result = await handOverInvoice(id, period);
        if (result?.error) setErrors((e) => ({ ...e, [id]: result.error! }));
        else {
          setErrors(({ [id]: _, ...rest }) => rest);
          setDone((prev) => new Set([...prev, id]));
        }
      }
      setBusy(null);
    });

  return (
    <Card
      title={`${drafts.length} Entwürfe · ${formatEuro(total)} netto`}
      action={
        open.length > 0 && (
          <button
            disabled={!connected || pending}
            title={connected ? undefined : "Erst unten Lexoffice verbinden"}
            className="rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-bold disabled:opacity-50"
            onClick={() => handOver(open.map((d) => d.customerId))}
          >
            {pending ? "Übergebe …" : `Alle ${open.length} an Lexoffice übergeben`}
          </button>
        )
      }
    >
      {!connected && <p className="text-sm text-muted mb-2">Zum Übergeben zuerst unten Lexoffice verbinden.</p>}
      <ul className="divide-y divide-line">
        {drafts.map((d) => (
          <li key={d.customerId} className="py-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{d.customerName}</div>
              <ul className="text-xs text-muted mt-1">
                {d.lines.map((l) => (
                  <li key={l.description}>
                    {l.quantity > 1 ? `${l.quantity} × ` : ""}
                    {l.description}: {formatEuro(l.quantity * l.unitPriceCents)}
                  </li>
                ))}
              </ul>
              {errors[d.customerId] && <p className="text-sm font-semibold text-bad mt-1">{errors[d.customerId]}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatEuro(d.totalNetCents)}</span>
              {done.has(d.customerId) ? (
                <Pill tone="ok">In Lexoffice</Pill>
              ) : (
                <button
                  disabled={!connected || pending}
                  className="rounded-lg bg-soft px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                  onClick={() => handOver([d.customerId])}
                >
                  {busy === d.customerId ? "Übergebe …" : "Übergeben"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
