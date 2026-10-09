"use client";

import { useSyncExternalStore } from "react";

type Theme = "auto" | "light" | "dark";
const next: Record<Theme, Theme> = { auto: "dark", dark: "light", light: "auto" };
const label: Record<Theme, string> = { auto: "Farben wie am Gerät", dark: "Dunkel", light: "Hell" };

function stored(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "dark" || t === "light" ? t : "auto";
  } catch {
    return "auto";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("themechange", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("themechange", callback);
    window.removeEventListener("storage", callback);
  };
}

/** Schalter hell / dunkel / wie am Gerät. Die Wahl bleibt in diesem Browser gespeichert. */
export function ThemeToggle() {
  // Auf dem Server immer "auto"; im Browser gilt danach die gespeicherte Wahl.
  const theme = useSyncExternalStore(subscribe, stored, () => "auto" as Theme);

  const change = () => {
    const t = next[theme];
    try {
      if (t === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    window.dispatchEvent(new Event("themechange"));
  };

  return (
    <button type="button" onClick={change} className="rounded-lg p-2 hover:bg-white/10" aria-label={`Farbmodus: ${label[theme]}`} title={`Farbmodus: ${label[theme]}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {theme === "dark" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : theme === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  );
}
