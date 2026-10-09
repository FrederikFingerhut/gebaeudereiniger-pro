import Image from "next/image";
import { gradeLabels, inspectionScore, type InspectionItem } from "@gp/shared";

type Company = { name: string; address: string | null; phone: string | null; email: string | null } | null;
export type Inspection = { date: string; note: string | null; items: InspectionItem[]; site: string; address?: string | null; inspector?: string | null };

const gradeColor = (g: number) => (g <= 2 ? "text-ok" : g === 3 ? "text-warn" : "text-bad");

/** Prüfbericht als Blatt: auf dem Bildschirm mit Rahmen, beim Drucken als sauberes PDF. Auch im Kundenportal. */
export function InspectionReport({ inspection, company, photos }: { inspection: Inspection; company: Company; photos: string[] }) {
  const score = inspectionScore(inspection.items);
  return (
    <article className="bg-surface text-ink rounded-2xl border border-line p-8 sm:p-12 print:p-0 print:border-0 print:rounded-none text-sm leading-relaxed">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="font-display font-extrabold text-xl text-primary">{company?.name}</div>
          {company?.address && <div className="whitespace-pre-line text-xs text-muted mt-1">{company.address}</div>}
          <div className="text-xs text-muted">{[company?.phone, company?.email].filter(Boolean).join(" · ")}</div>
        </div>
        <Image src="/logo.png" alt="" width={64} height={64} className="rounded-xl shrink-0" />
      </header>

      <h1 className="font-display font-bold text-lg mt-10">Qualitätsbericht {inspection.site}</h1>
      <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-2">
        <dt className="text-muted">Datum</dt>
        <dd>{inspection.date.split("-").reverse().join(".")}</dd>
        {inspection.address && (<><dt className="text-muted">Objekt</dt><dd>{inspection.address}</dd></>)}
        {inspection.inspector && (<><dt className="text-muted">Geprüft von</dt><dd>{inspection.inspector}</dd></>)}
      </dl>

      <div className="mt-6 flex items-center gap-4 rounded-xl bg-soft p-4 print:border print:border-line">
        <div className={`font-display font-extrabold text-4xl tabular-nums ${score === null ? "" : gradeColor(Math.round(score))}`}>{score?.toLocaleString("de-DE") ?? "–"}</div>
        <div>
          <div className="font-semibold">Gesamtnote</div>
          <div className="text-xs text-muted">Schulnoten: 1 sehr gut bis 5 mangelhaft</div>
        </div>
      </div>

      <table className="w-full mt-6 text-sm">
        <thead>
          <tr className="border-b-2 border-primary text-left text-xs text-muted">
            <th className="py-2 pr-2 font-semibold">Bereich</th>
            <th className="py-2 pr-2 font-semibold">Note</th>
            <th className="py-2 font-semibold">Bemerkung</th>
          </tr>
        </thead>
        <tbody>
          {inspection.items.map((it, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-2 font-semibold">{it.title}</td>
              <td className={`py-2 pr-2 whitespace-nowrap font-semibold ${gradeColor(it.grade)}`}>
                {it.grade} <span className="font-normal text-muted">{gradeLabels[it.grade]}</span>
              </td>
              <td className="py-2">{it.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {inspection.note && <p className="mt-6 whitespace-pre-line">{inspection.note}</p>}

      {photos.length > 0 && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="font-semibold mb-2">Fotos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`Foto ${i + 1}`} className="w-full aspect-[4/3] object-cover rounded-lg" />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
