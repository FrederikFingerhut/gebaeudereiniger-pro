"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Field, inputClass, type FormState } from "@/components/action-form";
import { shrinkPhoto } from "@/lib/photo";

/** Hochladen in den Kunden-Ordner. Fotos werden vorher im Browser verkleinert. */
export function FolderUpload({ action }: { action: (state: FormState, data: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [preparing, setPreparing] = useState(false);
  const files = useRef<HTMLInputElement>(null);

  const submit = async (form: FormData) => {
    setPreparing(true);
    form.delete("file");
    for (const f of [...(files.current?.files ?? [])]) {
      if (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp") {
        form.append("file", new File([await shrinkPhoto(f)], f.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      } else form.append("file", f);
    }
    setPreparing(false);
    startTransition(() => formAction(form));
  };

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <Field label="Art">
        <select name="kind" defaultValue="vertrag" className={inputClass}>
          <option value="vertrag">Vertrag</option>
          <option value="foto">Foto</option>
          <option value="sonstiges">Sonstiges</option>
        </select>
      </Field>
      <Field label="Bezeichnung (bei einer Datei)">
        <input name="title" placeholder="z. B. Reinigungsvertrag 2026" className={inputClass} />
      </Field>
      <Field label="Dateien (PDF oder Fotos)">
        <input ref={files} name="file" type="file" multiple accept="application/pdf,image/*" required className="text-sm" />
      </Field>
      <button type="submit" disabled={pending || preparing} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-60">
        {pending || preparing ? "Bitte warten …" : "Hochladen"}
      </button>
      {state?.error && <p className="w-full text-sm font-semibold text-bad">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm font-semibold text-ok">{state.ok}</p>}
    </form>
  );
}
