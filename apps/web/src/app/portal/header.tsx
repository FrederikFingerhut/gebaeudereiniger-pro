import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/app/auth-actions";

/** Eigene Kopfzeile fürs Kundenportal (ohne Büro-Menü). */
export function PortalHeader({ company }: { company: string }) {
  return (
    <header className="bg-primary text-on-primary -mx-4 -mt-6 md:-mx-8 mb-6 px-4 md:px-8 py-3 flex items-center justify-between gap-3 print:hidden">
      <Link href="/portal" className="flex items-center gap-2.5 min-w-0 font-display font-extrabold leading-tight">
        <Image src="/logo.png" alt="" width={36} height={36} className="rounded-lg shrink-0" priority />
        <span className="truncate">{company}</span>
        <span className="hidden sm:inline font-body font-semibold text-sm opacity-80">Kundenportal</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10">
          Abmelden
        </button>
      </form>
    </header>
  );
}
