"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@gp/shared";

const items = [
  { href: "/", label: "Übersicht" },
  { href: "/planung", label: "Einsatzplan" },
  { href: "/objekte", label: "Objekte" },
  { href: "/rechnungen", label: "Rechnungen" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="bg-primary text-on-primary md:w-56 md:min-h-screen px-4 py-4 flex md:flex-col gap-4 md:gap-6 overflow-x-auto">
      <div className="font-display font-extrabold text-lg whitespace-nowrap">{brand.name}</div>
      <ul className="flex md:flex-col gap-1">
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
    </nav>
  );
}
