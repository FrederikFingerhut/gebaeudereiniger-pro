import { demoSites, formatEuro } from "@gp/shared";
import { Card, PageTitle } from "@/components/ui";

export default function Sites() {
  return (
    <>
      <PageTitle note="Beispieldaten">Objekte</PageTitle>
      <div className="grid md:grid-cols-2 gap-4">
        {demoSites.map((s) => (
          <Card key={s.id} title={s.name}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Adresse</dt>
              <dd>{s.address}</dd>
              <dt className="text-muted">Abrechnung</dt>
              <dd>{s.billingMode === "pauschale" ? `${formatEuro(s.priceCents)} im Monat` : `${formatEuro(s.priceCents)} pro Einsatz`}</dd>
              <dt className="text-muted">Kalkuliert</dt>
              <dd>{s.plannedMinutes} Minuten pro Einsatz</dd>
              {s.accessNotes && (<><dt className="text-muted">Zugang</dt><dd>{s.accessNotes}</dd></>)}
              {s.specialNotes && (<><dt className="text-muted">Besonderheit</dt><dd>{s.specialNotes}</dd></>)}
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
