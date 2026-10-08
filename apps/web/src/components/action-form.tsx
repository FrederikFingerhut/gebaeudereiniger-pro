"use client";

import { useActionState } from "react";

export type FormState = { error?: string; ok?: string } | null;

/** Formular, das eine Server-Aktion aufruft und Fehler/Erfolg anzeigt. */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-3",
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  submit: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="text-sm font-semibold text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-ok">{state.ok}</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-60">
          {pending ? "Bitte warten …" : submit}
        </button>
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "rounded-lg border border-line bg-surface px-3 py-2 text-sm";
