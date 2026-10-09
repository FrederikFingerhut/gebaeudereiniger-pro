// Erzeugt vor dem Web-Build die Dateien, mit denen sich die App auf dem Handy
// „zum Startbildschirm hinzufügen“ lässt (Web-App-Manifest, Startseite, Symbol).
// Name und Farben kommen aus packages/shared/src/brand.ts.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brand } from "../../../packages/shared/src/brand.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

copyFileSync(join(root, "assets", "icon.png"), join(pub, "icon.png"));

writeFileSync(
  join(pub, "manifest.json"),
  JSON.stringify(
    {
      name: brand.name,
      short_name: brand.shortName,
      lang: "de",
      start_url: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: brand.colors.background,
      theme_color: brand.colors.primary,
      icons: [{ src: "/icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" }],
    },
    null,
    2,
  ),
);

writeFileSync(
  join(pub, "index.html"),
  `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <title>%WEB_TITLE%</title>
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${brand.shortName}" />
    <meta name="theme-color" content="${brand.colors.primary}" />
    <style id="expo-reset">
      html, body { height: 100%; }
      body { overflow: hidden; background: ${brand.colors.background}; }
      #root { display: flex; height: 100%; flex: 1; }
    </style>
  </head>
  <body>
    <noscript>Bitte JavaScript einschalten, um die App zu nutzen.</noscript>
    <div id="root"></div>
  </body>
</html>
`,
);
// Service Worker: zeigt Push-Nachrichten an, auch wenn die App geschlossen ist.
writeFileSync(
  join(pub, "sw.js"),
  `self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "${brand.shortName}", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "${brand.shortName}", {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag,
    }),
  );
});

// Antippen öffnet die App (oder holt sie nach vorn).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) if ("focus" in client) return client.focus();
      return self.clients.openWindow("/");
    }),
  );
});
`,
);

console.log("Web-App-Dateien erzeugt in", pub);
