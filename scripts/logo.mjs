// Erzeugt alle Logo-Dateien aus packages/shared/src/logo.ts (Farben aus brand.ts).
// Aufruf nach einer Änderung an Logo oder Farben:  node scripts/logo.mjs
// Die erzeugten Bilder werden eingecheckt. PNGs rendert sharp (kommt mit Next.js).
import { register } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// packages/shared importiert ohne Dateiendung ("./brand"); Node braucht hier Hilfe.
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
      try { return await next(s, c); }
      catch (e) { if (s.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s + ".ts", c); throw e; }
    }`),
);
const { logoSvg } = await import("../packages/shared/src/logo.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function png(file, variant, size) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  await sharp(Buffer.from(logoSvg(variant, size))).png().toFile(path);
  console.log("PNG", file);
}
function svg(file, variant) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), logoSvg(variant, 160));
  console.log("SVG", file);
}

// Handy-App (Expo)
await png("apps/mobile/assets/icon.png", "square", 1024);
await png("apps/mobile/assets/splash-icon.png", "rounded", 1024);
await png("apps/mobile/assets/favicon.png", "rounded", 48);
await png("apps/mobile/assets/android-icon-foreground.png", "foreground", 512);
await png("apps/mobile/assets/android-icon-background.png", "background", 512);
await png("apps/mobile/assets/android-icon-monochrome.png", "monochrome", 432);

// Büro-Web (Next.js nimmt icon.* und apple-icon.* im app-Ordner automatisch)
svg("apps/web/src/app/icon.svg", "rounded");
await png("apps/web/src/app/apple-icon.png", "square", 180);
svg("apps/web/public/logo.svg", "rounded");
await png("apps/web/public/logo.png", "rounded", 256);
rmSync(join(root, "apps/web/src/app/favicon.ico"), { force: true });
