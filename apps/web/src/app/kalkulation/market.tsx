import { formatEuro, marketRates, minimumRates } from "@gp/shared";
import { Card } from "@/components/ui";
import { addMarketGuides } from "./actions";

// Ungefähre Marktwerte zum Vergleichen, mit Knopf zum Übernehmen als eigene Richtpreise.
export function MarketCard() {
  return (
    <Card title="Marktwerte zur Orientierung">
      <p className="text-sm text-muted mb-3">Ungefähre Werte netto, Anfahrt und Reinigungsmittel eingerechnet. Prüf sie gegen deine eigenen Zahlen.</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl bg-soft p-3">
          <div className="text-xs text-muted font-semibold">Unterhalt ab</div>
          <div className="font-display font-bold text-xl tabular-nums">{formatEuro(minimumRates.unterhalt)}</div>
          <div className="text-xs text-muted">pro Stunde</div>
        </div>
        <div className="rounded-xl bg-soft p-3">
          <div className="text-xs text-muted font-semibold">Grund und Projekt ab</div>
          <div className="font-display font-bold text-xl tabular-nums">{formatEuro(minimumRates.grund)}</div>
          <div className="text-xs text-muted">pro Stunde</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted text-left">
            <th className="font-semibold py-1">Objektart</th>
            <th className="font-semibold py-1 text-right">m²/Std.</th>
            <th className="font-semibold py-1 text-right">€/Std.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {marketRates.map((m) => (
            <tr key={m.title}>
              <td className="py-2 pr-2">
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-muted">{m.hint}</div>
              </td>
              <td className="py-2 text-right tabular-nums">{m.m2PerHour ?? "–"}</td>
              <td className="py-2 text-right tabular-nums whitespace-nowrap">
                {(m.fromCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })}–{formatEuro(m.toCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={addMarketGuides} className="mt-3">
        <button className="w-full rounded-lg bg-soft hover:bg-line px-4 py-2 text-sm font-bold">Als meine Richtpreise übernehmen</button>
      </form>
      <p className="text-xs text-muted mt-2">Übernimmt den unteren Wert je Objektart; danach kannst du ihn ändern oder löschen.</p>
    </Card>
  );
}
