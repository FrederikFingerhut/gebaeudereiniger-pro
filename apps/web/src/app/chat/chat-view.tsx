"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@gp/shared";
import { loadConversation, loadThreads, sendMessage, type ChatLine, type ThreadItem } from "./actions";

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
const berlinDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(iso));
/** Heute nur die Uhrzeit, sonst das Datum. */
const when = (iso: string, today: string) =>
  berlinDay(iso) === today ? time(iso) : new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", timeZone: "Europe/Berlin" });

export function ChatView({
  threads: initialThreads,
  selected: initialSelected,
  conversation: initialConversation,
  today,
}: {
  threads: ThreadItem[];
  selected: string | null;
  conversation: ChatLine[];
  /** Heutiges Datum in Berlin (JJJJ-MM-TT), vom Server */
  today: string;
}) {
  const [threads, setThreads] = useState(() => initialThreads.map((t) => (t.id === initialSelected ? { ...t, unread: 0 } : t)));
  const [selected, setSelected] = useState(initialSelected);
  const [lines, setLines] = useState(initialConversation);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | undefined>(initialConversation.at(-1)?.id);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const [list, convo] = await Promise.all([loadThreads(), selected ? loadConversation(selected) : Promise.resolve(null)]);
      setThreads(list);
      if (convo) setLines(convo);
    } catch {
      // Beim nächsten Durchlauf erneut versuchen.
    }
  }, [selected]);

  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);

  // Bei neuen Nachrichten nach unten scrollen.
  useEffect(() => {
    const newest = lines.at(-1)?.id;
    if (newest !== lastId.current || newest === undefined) bottom.current?.scrollIntoView({ block: "end" });
    lastId.current = newest;
  }, [lines]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [selected]);

  const open = async (id: string | null) => {
    setSelected(id);
    setError(null);
    setLines([]);
    window.history.replaceState(null, "", id ? `/chat?mit=${id}` : "/chat");
    if (id) {
      setThreads((list) => list.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
      try {
        setLines(await loadConversation(id));
      } catch {
        setError("Gespräch konnte nicht geladen werden.");
      }
    }
  };

  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    setSending(true);
    const result = await sendMessage(selected, text);
    setSending(false);
    if (result.error) return setError(result.error);
    setText("");
    setError(null);
    await refresh();
  };

  const person = threads.find((t) => t.id === selected);
  let lastDay = "";

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden grid md:grid-cols-[18rem_1fr] h-[calc(100dvh-13rem)] min-h-[28rem]">
      <ul className={`border-r border-line overflow-y-auto ${selected ? "hidden md:block" : ""}`}>
        {threads.length === 0 && <li className="p-4 text-sm text-muted">Noch keine Mitarbeiter angelegt.</li>}
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => open(t.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-line hover:bg-soft ${t.id === selected ? "bg-soft" : ""}`}
            >
              <span className="size-10 shrink-0 rounded-full bg-primary text-on-primary grid place-items-center font-bold">{t.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate ${t.unread ? "font-extrabold" : "font-semibold"}`}>{t.name}</span>
                  {t.lastAt && <span className="text-xs text-muted shrink-0">{when(t.lastAt, today)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`block truncate text-sm ${t.unread ? "text-ink" : "text-muted"}`}>{t.lastText ? `${t.lastMine ? "Du: " : ""}${t.lastText}` : "Noch keine Nachrichten"}</span>
                  {t.unread > 0 && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-signal text-on-signal text-[11px] font-bold grid place-items-center">{t.unread}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className={`flex flex-col min-h-0 ${selected ? "" : "hidden md:flex"}`}>
        {!person ? (
          <p className="m-auto text-sm text-muted p-6 text-center">Wähle links einen Mitarbeiter, um das Gespräch zu öffnen.</p>
        ) : (
          <>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-line">
              <button type="button" onClick={() => open(null)} className="md:hidden rounded-lg px-2 py-1 text-sm font-semibold hover:bg-soft" aria-label="Zurück zur Liste">
                ‹
              </button>
              <span className="font-display font-semibold text-lg">{person.name}</span>
            </header>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 bg-background">
              {lines.length === 0 && <p className="m-auto text-sm text-muted">Noch keine Nachrichten. Schreib die erste.</p>}
              {lines.map((l) => {
                const d = day(l.createdAt);
                const showDay = d !== lastDay;
                lastDay = d;
                return (
                  <div key={l.id} className="flex flex-col gap-1.5">
                    {showDay && <div className="text-center text-xs text-muted my-2">{d}</div>}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                        l.fromEmployee ? "self-start bg-surface border border-line rounded-bl-sm" : `self-end rounded-br-sm ${l.mine ? "bg-primary text-on-primary" : "bg-soft"}`
                      }`}
                    >
                      {!l.mine && <div className={`text-xs font-bold ${l.fromEmployee ? "text-primary" : "text-muted"}`}>{l.authorName ?? "Unbekannt"}</div>}
                      <div className="whitespace-pre-wrap break-words">{l.body}</div>
                      <div className="text-[11px] opacity-70 text-right">{time(l.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>
            <form
              className="flex items-end gap-2 p-3 border-t border-line"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={CHAT_MAX_LENGTH}
                placeholder={`Nachricht an ${person.name} …`}
                aria-label="Nachricht"
                className="flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm max-h-32"
              />
              <button type="submit" disabled={!text.trim() || sending} className="rounded-full bg-primary text-on-primary px-4 py-2.5 text-sm font-bold disabled:opacity-50">
                {sending ? "…" : "Senden"}
              </button>
            </form>
            {error && <p className="px-4 pb-3 text-sm font-semibold text-bad">{error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
