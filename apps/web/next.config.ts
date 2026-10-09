import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Gemeinsamer Code (Typen, Rechnungslogik, Texte) liegt als TypeScript im Monorepo.
  transpilePackages: ["@gp/shared"],
  // Prüfberichte schicken verkleinerte Fotos mit (mehrere je Bericht).
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
