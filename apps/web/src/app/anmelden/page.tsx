import Image from "next/image";
import Link from "next/link";
import { brand } from "@gp/shared";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { signIn } from "../auth-actions";

export default function SignInPage() {
  return (
    <div className="max-w-sm mx-auto mt-12 bg-surface border border-line rounded-2xl p-6">
      <Image src="/logo.png" alt="" width={56} height={56} className="rounded-2xl mb-4" priority />
      <h1 className="font-display font-extrabold text-2xl mb-1">{brand.name}</h1>
      <p className="text-sm text-muted mb-6">Anmeldung für Büro und Chef</p>
      <ActionForm action={signIn} submit="Anmelden">
        <Field label="E-Mail">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Passwort">
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </Field>
      </ActionForm>
      <p className="text-sm text-muted mt-4">
        <Link href="/passwort-vergessen" className="font-semibold text-primary">Passwort vergessen?</Link>
      </p>
      <p className="text-sm text-muted mt-4">
        Neue Firma? <Link href="/registrieren" className="font-semibold text-primary">Jetzt registrieren</Link>
      </p>
    </div>
  );
}
