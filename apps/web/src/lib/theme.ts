import { brand } from "@gp/shared";

const vars = (colors: Record<string, string>) =>
  Object.entries(colors)
    .map(([key, value]) => `--gp-${key}:${value}`)
    .join(";");

/**
 * Farben als CSS-Variablen: hell als Standard, dunkel nach Geräte-Einstellung
 * oder Schalter (data-theme). Gedruckt wird immer hell.
 */
export const themeCss = [
  `:root{${vars(brand.colors)};color-scheme:light}`,
  `@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${vars(brand.darkColors)};color-scheme:dark}}`,
  `:root[data-theme=dark]{${vars(brand.darkColors)};color-scheme:dark}`,
  `@media print{:root,:root[data-theme]{${vars(brand.colors)};color-scheme:light}}`,
].join("\n");

/** Läuft vor dem ersten Zeichnen, damit die Seite nicht kurz hell aufblitzt. */
export const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;
