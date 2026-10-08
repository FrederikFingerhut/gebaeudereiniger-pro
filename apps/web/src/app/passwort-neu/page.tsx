import { ActionForm, Field, inputClass } from "@/components/action-form";
import { setNewPassword } from "../auth-actions";

// Nach dem Link aus der Passwort-Mail ist man angemeldet und setzt hier sein Passwort.
export default function NewPasswordPage() {
  return (
    <div className="max-w-sm mx-auto mt-12 bg-surface border border-line rounded-2xl p-6">
      <h1 className="font-display font-extrabold text-2xl mb-6">Neues Passwort</h1>
      <ActionForm action={setNewPassword} submit="Passwort speichern">
        <Field label="Neues Passwort (mindestens 8 Zeichen)">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
      </ActionForm>
    </div>
  );
}
