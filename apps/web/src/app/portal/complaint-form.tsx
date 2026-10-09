"use client";

import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/action-form";
import { shrinkPhoto } from "@/lib/photo";
import { sendComplaint } from "./actions";

export function ComplaintForm({ sites }: { sites: { id: string; name: string }[] }) {
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [state, action, pending] = useActionState(sendComplaint, null);

  const submit = async (data: FormData) => {
    photos.forEach((p, i) => data.append("photo", p.blob, `foto-${i + 1}.jpg`));
    await action(data);
  };
  // Nach erfolgreichem Senden die Fotos leeren (Textfelder leert React selbst).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setPhotos([]);
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <Field label="Objekt">
        <select name="site_id" className={inputClass}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Was hat nicht gepasst?">
        <textarea name="text" rows={3} required placeholder="z. B. Mülleimer in der Küche wurde am Dienstag nicht geleert." className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.url} src={p.url} alt={`Foto ${i + 1}`} className="size-20 rounded-lg object-cover" />
        ))}
        {photos.length < 4 && (
          <label className="size-20 rounded-lg border-2 border-dashed border-line grid place-items-center text-xs text-muted cursor-pointer hover:bg-soft text-center">
            + Foto
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])].slice(0, 4 - photos.length);
                const shrunk = await Promise.all(files.map(async (f) => {
                  const blob = await shrinkPhoto(f);
                  return { blob, url: URL.createObjectURL(blob) };
                }));
                setPhotos((list) => [...list, ...shrunk]);
              }}
            />
          </label>
        )}
      </div>
      {state?.error && <p className="text-sm font-semibold text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-ok">{state.ok}</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-60">
          {pending ? "Wird gesendet …" : "Reklamation senden"}
        </button>
      </div>
    </form>
  );
}
