import type { VisitStatus } from "@gp/shared";

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-display font-semibold text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const statusStyle: Record<VisitStatus, { label: string; className: string }> = {
  geplant: { label: "Geplant", className: "text-muted" },
  laeuft: { label: "Läuft", className: "text-warn" },
  erledigt: { label: "Erledigt", className: "text-ok" },
  ausgefallen: { label: "Ausgefallen", className: "text-bad" },
};

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const color = { ok: "text-ok", warn: "text-warn", bad: "text-bad", muted: "text-muted" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${color}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: VisitStatus }) {
  const s = statusStyle[status];
  return <Pill tone={status === "erledigt" ? "ok" : status === "laeuft" ? "warn" : status === "ausgefallen" ? "bad" : "muted"}>{s.label}</Pill>;
}

export function PageTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display font-extrabold text-2xl">{children}</h1>
      {note && <p className="text-sm text-muted mt-1">{note}</p>}
    </header>
  );
}
