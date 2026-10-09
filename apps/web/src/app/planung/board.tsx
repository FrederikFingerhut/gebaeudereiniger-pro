"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { VisitStatus } from "@gp/shared";
import { dayLabel } from "@/lib/format";
import { moveVisit } from "./actions";

export type BoardVisit = { id: string; siteName: string; employeeId: string | null; date: string; startTime: string; status: VisitStatus };

const NOBODY = "";

/**
 * Wochenplan zum Ziehen: Zeilen sind Mitarbeiter, Spalten Tage.
 * Am Bildschirm per Ziehen und Ablegen, am Handy: Einsatz antippen, dann Ziel-Feld antippen.
 */
export function WeekBoard({ days, staff, visits }: { days: string[]; staff: { id: string; name: string }[]; visits: BoardVisit[] }) {
  const [optimistic, applyMove] = useOptimistic(visits, (list, m: { id: string; employeeId: string | null; date: string }) =>
    list.map((v) => (v.id === m.id ? { ...v, employeeId: m.employeeId, date: m.date } : v)),
  );
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rows = [...staff.map((s) => ({ id: s.id, name: s.name })), { id: NOBODY, name: "Nicht besetzt" }];

  const move = (id: string, employeeId: string, date: string) => {
    const v = optimistic.find((x) => x.id === id);
    setSelected(null);
    if (!v || (v.date === date && (v.employeeId ?? NOBODY) === employeeId)) return;
    if (v.status !== "geplant") {
      setMessage("Nur geplante Einsätze lassen sich verschieben.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      applyMove({ id, employeeId: employeeId || null, date });
      const result = await moveVisit(id, employeeId || null, date);
      if (result?.error) setMessage(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Einsatz auf einen anderen Tag oder zu einem anderen Mitarbeiter ziehen. Am Handy: Einsatz antippen, dann das Ziel antippen.
      </p>
      {message && <p className="text-sm font-semibold text-bad">{message}</p>}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="grid gap-1 min-w-[44rem]" style={{ gridTemplateColumns: `9rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d} className="text-[11px] uppercase tracking-wider font-semibold text-muted px-1 py-1">{dayLabel(d)}</div>
          ))}
          {rows.map((row) => (
            <Row key={row.id} name={row.name}>
              {days.map((date) => {
                const cell = `${row.id}|${date}`;
                const items = optimistic.filter((v) => (v.employeeId ?? NOBODY) === row.id && v.date === date);
                return (
                  <div
                    key={date}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(cell);
                    }}
                    onDragLeave={() => setOver((o) => (o === cell ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) move(id, row.id, date);
                    }}
                    onClick={() => selected && move(selected, row.id, date)}
                    className={`min-h-14 rounded-lg p-1 flex flex-col gap-1 transition-colors ${
                      over === cell ? "bg-signal/30 ring-2 ring-signal" : selected ? "bg-soft/60 hover:bg-signal/20 cursor-pointer" : row.id === NOBODY ? "bg-soft/40" : "bg-soft"
                    }`}
                  >
                    {items.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        draggable={v.status === "geplant"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", v.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(v.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (v.status === "geplant") setSelected((s) => (s === v.id ? null : v.id));
                        }}
                        title={`${v.startTime.slice(0, 5)} Uhr · ${v.siteName}`}
                        className={`text-left rounded-md px-1.5 py-1 text-xs leading-tight shadow-sm border ${
                          v.status === "erledigt"
                            ? "bg-ok text-on-primary border-transparent cursor-default"
                            : v.status === "ausgefallen"
                              ? "bg-surface text-bad line-through border-line cursor-default"
                              : v.status === "laeuft"
                                ? "bg-surface border-warn cursor-default"
                                : `bg-surface border-line cursor-grab active:cursor-grabbing ${selected === v.id ? "ring-2 ring-primary" : ""} ${dragging === v.id ? "opacity-40" : ""}`
                        }`}
                      >
                        <span className="font-bold tabular-nums">{v.startTime.slice(0, 5)}</span> <span className="break-words">{v.siteName}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-sm font-semibold py-2 pr-2 truncate" title={name}>{name}</div>
      {children}
    </>
  );
}
