import Link from "next/link";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { signUp } from "../auth-actions";

export default function SignUpPage() {
  return (
    <div className="max-w-sm mx-auto mt-12 bg-surface border border-line rounded-2xl p-6">
      <h1 className="font-display font-extrabold text-2xl mb-1">Firma registrieren</h1>
      <p className="text-sm text-muted mb-6">Du wirst Chef deiner Firma und legst danach Objekte und Mitarbeiter an.</p>
      <ActionForm action={signUp} submit="Registrieren">
        <Field label="Name der Firma">
          <input name="company" required className={inputClass} />
        </Field>
        <Field label="Dein Name">
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label="E-Mail">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Passwort (mindestens 8 Zeichen)">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
      </ActionForm>
      <p className="text-sm text-muted mt-6">
        Schon registriert? <Link href="/anmelden" className="font-semibold text-primary">Anmelden</Link>
      </p>
    </div>
  );
}
