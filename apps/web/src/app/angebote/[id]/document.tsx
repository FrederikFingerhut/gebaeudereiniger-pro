import Image from "next/image";
import { formatEuro, lineTotalCents, offerTotals, VAT_PERCENT, type OfferLine } from "@gp/shared";

const date = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
const qty = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

type Company = { name: string; address: string | null; phone: string | null; email: string | null } | null;
type Offer = { number: string; recipient: string; title: string; lines: OfferLine[]; note: string | null; valid_until: string | null; created_at: string };

export function OfferDocument({ offer, company }: { offer: Offer; company: Company }) {
  const { lines } = offer;
  const totals = offerTotals(lines);
  const sender = [company?.name, company?.address?.replace(/\n/g, ", ")].filter(Boolean).join(" · ");
  // Auf dem Bildschirm als Blatt, beim Drucken ohne Rahmen.
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

      <div className="mt-10 grid grid-cols-[1fr_auto] gap-6">
        <div>
          {sender && <div className="text-[10px] text-muted underline mb-1">{sender}</div>}
          <div className="whitespace-pre-line">{offer.recipient}</div>
        </div>
        <dl className="text-xs grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 self-end">
          <dt className="text-muted">Angebot Nr.</dt><dd className="font-semibold">{offer.number}</dd>
          <dt className="text-muted">Datum</dt><dd>{date(offer.created_at)}</dd>
          {offer.valid_until && (<><dt className="text-muted">Gültig bis</dt><dd>{date(offer.valid_until)}</dd></>)}
        </dl>
      </div>

      <h1 className="font-display font-bold text-lg mt-10">{offer.title}</h1>
      <p className="mt-2">Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen folgende Leistungen an:</p>

      <table className="w-full mt-5 text-sm">
        <thead>
          <tr className="border-b-2 border-primary text-left text-xs text-muted">
            <th className="py-2 pr-2 font-semibold w-8">Pos.</th>
            <th className="py-2 pr-2 font-semibold">Leistung</th>
            <th className="py-2 pr-2 font-semibold text-right">Menge</th>
            <th className="py-2 pr-2 font-semibold text-right">Einzelpreis</th>
            <th className="py-2 font-semibold text-right">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-2 text-muted">{i + 1}</td>
              <td className="py-2 pr-2">{l.description}</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">{qty(l.quantity)} {l.unit}</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">{formatEuro(l.unitPriceCents)}</td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatEuro(lineTotalCents(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto w-64 flex flex-col gap-1 tabular-nums">
        <div className="flex justify-between"><dt className="text-muted">Summe netto</dt><dd>{formatEuro(totals.netCents)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Umsatzsteuer {VAT_PERCENT} %</dt><dd>{formatEuro(totals.vatCents)}</dd></div>
        <div className="flex justify-between font-bold border-t-2 border-primary pt-1 mt-1"><dt>Gesamtbetrag</dt><dd>{formatEuro(totals.grossCents)}</dd></div>
      </dl>

      {offer.note && <p className="mt-8 whitespace-pre-line">{offer.note}</p>}
      <p className="mt-8">Wir freuen uns auf Ihre Rückmeldung.</p>
      <p className="mt-4">Mit freundlichen Grüßen<br />{company?.name}</p>
    </article>
  );
}
