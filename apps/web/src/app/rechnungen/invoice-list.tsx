"use client";

import { useState } from "react";
import { formatEuro, type InvoiceDraft } from "@gp/shared";
import { Card, Pill } from "@/components/ui";

type Draft = InvoiceDraft & { customerName: string };

export function InvoiceList({ drafts }: { drafts: Draft[] }) {
  // Vorerst nur angezeigt. Die echte Übergabe läuft später über die Lexoffice-Schnittstelle auf dem Server.
  const [handedOver, setHandedOver] = useState<Set<string>>(new Set());
  const total = drafts.reduce((sum, d) => sum + d.totalNetCents, 0);
  const handOver = (ids: string[]) => setHandedOver((prev) => new Set([...prev, ...ids]));

  return (
    <Card
      title={`${drafts.length} Entwürfe · ${formatEuro(total)} netto`}
      action={
        <button className="rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-bold" onClick={() => handOver(drafts.map((d) => d.customerId))}>
          Alle an Lexoffice übergeben
        </button>
      }
    >
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
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatEuro(d.totalNetCents)}</span>
              {handedOver.has(d.customerId) ? (
                <Pill tone="ok">In Lexoffice</Pill>
              ) : (
                <button className="rounded-lg bg-soft px-3 py-1.5 text-sm font-semibold" onClick={() => handOver([d.customerId])}>
                  Übergeben
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
