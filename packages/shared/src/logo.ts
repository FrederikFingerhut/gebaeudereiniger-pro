import { brand } from "./brand";

// Das Logo als SVG-Text, gezeichnet aus den Farben in brand.ts.
// Daraus entstehen App-Symbol, Browser-Symbol und das Bild in den Mails
// (scripts/logo.mjs). Motiv: runder Haken („erledigt“) mit gelbem Viertel,
// Glanz oben und ein Funkeln.

export type LogoVariant =
  /** Abgerundetes Quadrat, z. B. für Web und Mails */
  | "rounded"
  /** Volle Fläche ohne Rundung: iOS und Android runden selbst ab */
  | "square"
  /** Nur das Zeichen ohne Hintergrund, verkleinert für Androids Schutzzone */
  | "foreground"
  /** Nur der Hintergrund-Verlauf (Android) */
  | "background"
  /** Einfarbig, für Androids Themen-Symbole */
  | "monochrome";

const c = brand.colors;
const CHECK = "M58 82 L74 98 L104 66";
const QUARTER = "M80 32 A48 48 0 0 1 128 80 L80 80 Z";
const STAR = "M130 22 L133 32 L143 35 L133 38 L130 48 L127 38 L117 35 L127 32 Z";

function mark(): string {
  return [
    `<circle cx="80" cy="80" r="48" fill="${c.surface}"/>`,
    `<path d="${QUARTER}" fill="${c.signal}"/>`,
    `<path d="${CHECK}" stroke="${c.primary}" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${STAR}" fill="${c.signal}"/>`,
  ].join("");
}

export function logoSvg(variant: LogoVariant = "rounded", size = 160): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">`;
  const radius = variant === "rounded" ? 40 : 0;
  const defs =
    `<defs><linearGradient id="gp-bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c.primaryLight}"/><stop offset="1" stop-color="${c.primaryDeep}"/></linearGradient>` +
    `<linearGradient id="gp-gloss" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${c.onPrimary}" stop-opacity="0.35"/><stop offset="1" stop-color="${c.onPrimary}" stop-opacity="0"/></linearGradient></defs>`;
  const background = `<rect width="160" height="160" rx="${radius}" fill="url(#gp-bg)"/>`;
  const gloss =
    radius > 0
      ? `<path d="M0 40 Q0 0 40 0 H120 Q160 0 160 40 V62 Q80 86 0 62 Z" fill="url(#gp-gloss)"/>`
      : `<path d="M0 0 H160 V62 Q80 86 0 62 Z" fill="url(#gp-gloss)"/>`;

  switch (variant) {
    case "background":
      return `${open}${defs}${background}${gloss}</svg>`;
    case "foreground":
      // Android zeigt nur die inneren zwei Drittel sicher an.
      return `${open}<g transform="translate(80 80) scale(0.62) translate(-82 -80)">${mark()}</g></svg>`;
    case "monochrome":
      return (
        `${open}<defs><mask id="gp-m"><rect width="160" height="160" fill="#fff"/>` +
        `<path d="${CHECK}" stroke="#000" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>` +
        `<g transform="translate(80 80) scale(0.62) translate(-82 -80)">` +
        `<circle cx="80" cy="80" r="48" fill="#000" mask="url(#gp-m)"/><path d="${STAR}" fill="#000"/></g></svg>`
      );
    default:
      return `${open}${defs}${background}${gloss}${mark()}</svg>`;
  }
}
