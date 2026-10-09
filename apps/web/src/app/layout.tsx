import { Suspense } from "react";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { brand } from "@gp/shared";
import { Nav } from "@/components/nav";
import { themeCss, themeScript } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = Figtree({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: brand.name,
  description: "Planung, Zeiterfassung und Abrechnung für Gebäudereinigungen",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme setzt das Skript vor React; daher die Warnung beim Abgleich unterdrücken.
    <html lang="de" className={`${display.variable} ${body.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col md:flex-row font-sans">
        {/* Die Navigation hängt von der Adresse ab (dynamische Seiten wie /objekte/123). */}
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        <main className="flex-1 min-w-0 px-4 py-6 md:px-8">{children}</main>
      </body>
    </html>
  );
}
