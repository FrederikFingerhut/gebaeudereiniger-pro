"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@gp/shared";
import { signOut } from "@/app/auth-actions";

const items = [
  { href: "/", label: "Übersicht" },
  { href: "/planung", label: "Einsatzplan" },
  { href: "/objekte", label: "Objekte" },
  { href: "/mitarbeiter", label: "Mitarbeiter" },
  { href: "/stunden", label: "Stunden" },
  { href: "/rechnungen", label: "Rechnungen" },
];

const withoutNav = ["/anmelden", "/registrieren", "/firma-anlegen", "/passwort-vergessen", "/passwort-neu"];

export function Nav() {
  const path = usePathname();
  if (withoutNav.some((p) => path.startsWith(p)) || path.endsWith("/qr")) return null;
  return (
    <nav className="bg-primary text-on-primary md:w-56 md:min-h-screen px-4 py-4 flex md:flex-col gap-4 md:gap-6 overflow-x-auto print:hidden">
      <div className="flex items-center gap-2 font-display font-extrabold text-lg whitespace-nowrap">
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-lg" priority />
        {brand.name}
      </div>
      <ul className="flex md:flex-col gap-1 md:flex-1">
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
      <form action={signOut}>
        <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
          Abmelden
        </button>
      </form>
    </nav>
  );
}
