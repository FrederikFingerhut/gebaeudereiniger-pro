// Name, Farben und Schrift an einer einzigen Stelle.
// Ändert man hier etwas, ändern sich Handy-App und Büro-Web zusammen.
export const brand = {
  name: "Gebäudereiniger Pro",
  shortName: "GR Pro",
  colors: {
    primary: "#0f4c5c",
    // Verlauf im Logo (hell oben links, dunkel unten rechts)
    primaryLight: "#1a7a8f",
    primaryDeep: "#0b3440",
    onPrimary: "#ffffff",
    signal: "#f2b632",
    onSignal: "#1d1600",
    background: "#eef1f4",
    surface: "#ffffff",
    text: "#14212b",
    muted: "#5b6b78",
    line: "#d6dde3",
    soft: "#e3ecef",
    ok: "#2f8f5b",
    warn: "#c77a12",
    bad: "#c2413b",
  },
  // Dunkler Modus im Büro-Web: gleiche Schlüssel, dunkle Flächen, hellere Signalfarben.
  darkColors: {
    primary: "#1f7f93",
    primaryLight: "#2a9ab0",
    primaryDeep: "#0f4c5c",
    onPrimary: "#ffffff",
    signal: "#f2b632",
    onSignal: "#1d1600",
    background: "#0e171d",
    surface: "#16222a",
    text: "#e6edf1",
    muted: "#9aabb7",
    line: "#2a3a45",
    soft: "#1f2e37",
    ok: "#4cc282",
    warn: "#e8a23a",
    bad: "#ef6b64",
  },
} as const;
