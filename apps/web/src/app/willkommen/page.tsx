import { Suspense } from "react";
import Link from "next/link";
import { appUrls } from "@gp/shared";
import { requireMe } from "@/lib/supabase";
import { Skeleton } from "@/components/skeleton";

// Ziel nach dem Passwort-Festlegen aus der Willkommens-Mail.
export default function WelcomePage() {
  return (
    <div className="max-w-md mx-auto mt-12 bg-surface border border-line rounded-2xl p-6 flex flex-col gap-4">
      <h1 className="font-display font-extrabold text-2xl">Willkommen im Team!</h1>
      <Suspense fallback={<Skeleton />}>
        <Welcome />
      </Suspense>
    </div>
  );
}

async function Welcome() {
  const { profile } = await requireMe();
  const employee = profile.role === "mitarbeiter";
  return (
    <>
      <p className="text-sm">
        Dein Passwort ist gespeichert, {profile.full_name.split(" ")[0]}. Deine Einsätze, das Stempeln und den Chat findest du in der Mitarbeiter-App.
      </p>
      <a href={appUrls.mobile} className="rounded-lg bg-signal text-on-signal px-4 py-3 text-center font-bold">
        Mitarbeiter-App öffnen
      </a>
      <p className="text-xs text-muted">
        Tipp fürs Handy: Öffne die App im Browser und tippe auf „Teilen“ bzw. das Menü und dann auf „Zum Home-Bildschirm“. Dann hast du sie wie eine normale App. Melde dich dort mit deiner E-Mail-Adresse und dem neuen Passwort an.
      </p>
      {!employee && (
        <Link href="/" className="rounded-lg bg-soft px-4 py-2 text-center text-sm font-semibold">
          Zum Büro-Web
        </Link>
      )}
    </>
  );
}
