"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { gradeLabels, inspectionScore } from "@gp/shared";
import { Field, inputClass } from "@/components/action-form";
import { saveInspection } from "../actions";

type Item = { title: string; grade: number; note: string };

/** Verkleinert ein Foto im Browser auf höchstens 1600 Pixel (JPEG), damit das Hochladen schnell geht. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Foto"))), "image/jpeg", 0.8));
}

export function InspectionForm({ sites, siteId, areas, today }: { sites: { id: string; name: string }[]; siteId: string; areas: string[]; today: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(areas.map((title) => ({ title, grade: 1, note: "" })));
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [extra, setExtra] = useState("");
  const [state, action, pending] = useActionState(saveInspection, null);
  const score = inspectionScore(items);

  const update = (i: number, patch: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const shrunk = await Promise.all([...files].slice(0, 8 - photos.length).map(async (f) => {
      const blob = await shrink(f);
      return { blob, url: URL.createObjectURL(blob) };
    }));
    setPhotos((p) => [...p, ...shrunk]);
  };

  const submit = (form: FormData) => {
    form.set("items", JSON.stringify(items));
    photos.forEach((p, i) => form.append("photo", p.blob, `foto-${i + 1}.jpg`));
    return action(form);
  };

  return (
    <form action={submit} className="flex flex-col gap-4 max-w-3xl">
      <section className="bg-surface border border-line rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
        <Field label="Objekt">
          <select name="site_id" value={siteId} onChange={(e) => router.push(`/qualitaet/neu?objekt=${e.target.value}`)} className={inputClass}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Datum">
          <input name="date" type="date" defaultValue={today} className={inputClass} />
        </Field>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display font-semibold text-lg">Bereiche</h2>
          <span className="text-sm font-semibold">Gesamtnote {score?.toLocaleString("de-DE") ?? "–"}</span>
        </div>
        <ul className="flex flex-col gap-4">
          {items.map((it, i) => (
            <li key={i} className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{it.title}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={`Note für ${it.title}`}>
                  {[1, 2, 3, 4, 5].map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={it.grade === g}
                      title={gradeLabels[g]}
                      onClick={() => update(i, { grade: g })}
                      className={`size-10 rounded-lg text-sm font-bold ${
                        it.grade === g ? (g <= 2 ? "bg-ok text-on-primary" : g === 3 ? "bg-warn text-on-primary" : "bg-bad text-on-primary") : "bg-soft hover:bg-line"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              {it.grade >= 3 && (
                <input value={it.note} onChange={(e) => update(i, { note: e.target.value })} placeholder="Was fehlt? z. B. Kalk an den Armaturen" className={inputClass} />
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-4">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Weiterer Bereich" className={`${inputClass} flex-1`} />
          <button
            type="button"
            onClick={() => {
              if (!extra.trim()) return;
              setItems((l) => [...l, { title: extra.trim(), grade: 1, note: "" }]);
              setExtra("");
            }}
            className="rounded-lg bg-soft hover:bg-line px-3 py-2 text-sm font-semibold"
          >
            + Bereich
          </button>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-display font-semibold text-lg">Fotos</h2>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Foto ${i + 1}`} className="size-24 rounded-lg object-cover" />
              <button type="button" onClick={() => setPhotos((l) => l.filter((x) => x !== p))} className="absolute -top-2 -right-2 size-6 rounded-full bg-ink text-surface text-xs" aria-label="Foto entfernen">
                ✕
              </button>
            </div>
          ))}
          {photos.length < 8 && (
            <label className="size-24 rounded-lg border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer hover:bg-soft text-center">
              + Foto
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
            </label>
          )}
        </div>
        <Field label="Bemerkung für den Bericht (optional)">
          <textarea name="note" rows={3} placeholder="z. B. Insgesamt sehr ordentlich, Sanitär wird ab nächster Woche intensiver gereinigt." className={inputClass} />
        </Field>
      </section>

      {state?.error && <p className="text-sm font-semibold text-bad">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary text-on-primary px-5 py-2.5 font-bold disabled:opacity-60">
          {pending ? "Wird gespeichert …" : "Prüfung speichern"}
        </button>
      </div>
    </form>
  );
}
