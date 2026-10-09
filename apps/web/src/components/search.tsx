"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { search, type Hit } from "@/app/search-actions";

/** Suche über alles: Strg+K (Mac: ⌘K) oder Klick auf die Lupe. */
export function Search({ pages }: { pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => start(async () => setHits(await search(query))), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const q = query.trim().toLowerCase();
  const pageHits: Hit[] = q ? pages.filter((p) => p.label.toLowerCase().includes(q)).map((p) => ({ kind: "Seite", label: p.label, href: p.href })) : [];
  const results = q.length < 2 ? pageHits : [...pageHits, ...hits];

  const close = () => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  };
  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.href);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Suchen (Strg+K)" title="Suchen (Strg+K)">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[12vh]" onMouseDown={close}>
          <div role="dialog" aria-label="Suche" className="w-full max-w-lg bg-surface text-ink rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                }
                if (e.key === "Enter") go(results[active]);
              }}
              placeholder="Objekt, Kunde, Mitarbeiter, Angebot …"
              className="w-full px-4 py-3.5 text-base bg-transparent border-b border-line outline-none"
            />
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {results.map((hit, i) => (
                <li key={`${hit.kind}-${hit.href}-${hit.label}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`w-full text-left rounded-lg px-3 py-2 flex items-center gap-3 ${i === active ? "bg-soft" : ""}`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted w-24 shrink-0">{hit.kind}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{hit.label}</span>
                      {hit.sub && <span className="block text-xs text-muted truncate">{hit.sub}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {q.length >= 2 && !pending && results.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nichts gefunden.</li>}
              {q.length < 2 && <li className="px-3 py-3 text-sm text-muted">Mindestens zwei Buchstaben eingeben. Mit ↑ ↓ wählen, Enter öffnet.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
