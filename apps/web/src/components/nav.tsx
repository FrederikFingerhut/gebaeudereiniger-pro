"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@gp/shared";
import { signOut } from "@/app/auth-actions";
import { Bell } from "./bell";

const items = [
  { href: "/", label: "Übersicht" },
  { href: "/planung", label: "Einsatzplan" },
  { href: "/objekte", label: "Objekte" },
  { href: "/qualitaet", label: "Qualität" },
  { href: "/mitarbeiter", label: "Mitarbeiter" },
  { href: "/stunden", label: "Stunden" },
  { href: "/rechnungen", label: "Rechnungen" },
  { href: "/auswertung", label: "Gewinn" },
  { href: "/kalkulation", label: "Kalkulation" },
  { href: "/angebote", label: "Angebote" },
];

const withoutNav = ["/anmelden", "/registrieren", "/firma-anlegen", "/passwort-vergessen", "/passwort-neu", "/portal"];

export function Nav() {
  const path = usePathname();
  if (withoutNav.some((p) => path.startsWith(p)) || path.endsWith("/qr")) return null;
  return (
    // Handy: oben Name und Abmelden, darunter die Menüpunkte zum Wischen.
    // Bildschirm: Leiste links; der Name darf dort umbrechen statt abgeschnitten zu werden.
    <nav className="bg-primary text-on-primary md:w-64 md:shrink-0 md:min-h-screen px-4 pt-4 pb-2 md:pb-4 flex flex-col gap-3 md:gap-6 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 font-display font-extrabold text-lg md:text-base leading-tight">
          <Image src="/logo.png" alt="" width={36} height={36} className="rounded-lg shrink-0" priority />
          <span>{brand.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Bell />
          <form action={signOut} className="md:hidden">
            <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
              Abmelden
            </button>
          </form>
        </div>
      </div>
      <ul className="flex md:flex-col gap-1 md:flex-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1">
        {items.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${active ? "bg-on-primary text-primary" : "hover:bg-white/10"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <form action={signOut} className="hidden md:block">
        <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
          Abmelden
        </button>
      </form>
    </nav>
  );
}
