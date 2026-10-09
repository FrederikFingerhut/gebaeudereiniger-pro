"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pushConfig, vapidKeyBytes } from "@gp/shared";
import { loadBell, markBellRead, savePushSubscription, type BellItem } from "@/app/notification-actions";

type PushState = "on" | "off" | "denied" | "unsupported";

async function currentPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Glocke mit ungelesenen Nachrichten (Meldungen, Krankmeldungen, Reklamationen). */
export function Bell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<BellItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>("unsupported");
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await loadBell();
      setUnread(r.unread);
      setItems(r.items);
    } catch {
      // Ohne Netz bleibt die alte Anzeige.
    }
  }, []);

  useEffect(() => {
    refresh();
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    currentPushState().then(setPush).catch(() => {});
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await markBellRead();
    }
  };

  const enablePush = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setPush(permission === "denied" ? "denied" : "off");
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(pushConfig.publicKey) }));
    const keys = sub.toJSON().keys ?? {};
    if (await savePushSubscription(sub.endpoint, keys.p256dh ?? "", keys.auth ?? "")) setPush("on");
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={toggle} className="relative rounded-lg p-2 hover:bg-white/10" aria-label={`Nachrichten${unread ? `, ${unread} neu` : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-signal text-on-signal text-[11px] font-bold grid place-items-center">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] right-0 md:right-auto md:left-0 rounded-2xl border border-line bg-surface text-ink shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line font-display font-semibold">Nachrichten</div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-line">
            {items?.length === 0 && <li className="px-4 py-6 text-sm text-muted">Keine Nachrichten.</li>}
            {items?.map((n) => {
              const body = (
                <>
                  <div className={`text-sm ${n.read ? "font-semibold" : "font-bold"}`}>{n.title}</div>
                  <div className="text-sm text-muted">{n.body}</div>
                  <div className="text-[11px] text-muted mt-0.5">{new Date(n.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</div>
                </>
              );
              return (
                <li key={n.id} className={n.read ? "" : "bg-soft/60"}>
                  {n.url ? (
                    <Link href={n.url} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-soft">{body}</Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3 border-t border-line text-xs">
            {push === "on" && <span className="text-ok font-semibold">Benachrichtigungen auf diesem Gerät sind an.</span>}
            {push === "off" && (
              <button type="button" onClick={enablePush} className="w-full rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-bold">
                Benachrichtigungen auf diesem Gerät einschalten
              </button>
            )}
            {push === "denied" && <span className="text-muted">Benachrichtigungen sind im Browser blockiert.</span>}
            {push === "unsupported" && <span className="text-muted">Dieser Browser kann keine Benachrichtigungen.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
