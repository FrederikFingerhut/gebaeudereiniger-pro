import { buildInvoiceDrafts, demoCustomers, demoExtras, demoSites, demoTreppenhausVisits } from "@gp/shared";
import { PageTitle } from "@/components/ui";
import { InvoiceList } from "./invoice-list";

export default function Invoices() {
  const drafts = buildInvoiceDrafts("2026-10", demoSites, demoTreppenhausVisits, demoExtras).map((d) => ({
    ...d,
    customerName: demoCustomers.find((c) => c.id === d.customerId)?.name ?? d.customerId,
  }));
  return (
    <>
      <PageTitle note="Die App berechnet die Entwürfe aus Pauschalen, erledigten Einsätzen und Sonderleistungen. Schreiben, versenden und mahnen macht weiter Lexoffice.">
        Rechnungen Oktober 2026
      </PageTitle>
      <InvoiceList drafts={drafts} />
    </>
  );
}
