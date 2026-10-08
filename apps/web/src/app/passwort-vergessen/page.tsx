import Link from "next/link";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { requestPasswordReset } from "../auth-actions";

export default function ForgotPasswordPage() {
  return (
    <div className="max-w-sm mx-auto mt-12 bg-surface border border-line rounded-2xl p-6">
      <h1 className="font-display font-extrabold text-2xl mb-1">Passwort vergessen</h1>
      <p className="text-sm text-muted mb-6">Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.</p>
      <ActionForm action={requestPasswordReset} submit="Link schicken">
        <Field label="E-Mail">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
      </ActionForm>
      <p className="text-sm text-muted mt-6">
        <Link href="/anmelden" className="font-semibold text-primary">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}
