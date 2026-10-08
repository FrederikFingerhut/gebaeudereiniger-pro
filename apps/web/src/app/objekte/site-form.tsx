import { formatEuro } from "@gp/shared";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { saveSite } from "./actions";

export interface SiteFormData {
  id: string | null;
  customerId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
  plannedMinutes: number;
  accessNotes: string;
  contact: string;
  specialNotes: string;
  billingMode: "pauschale" | "pro_einsatz";
  priceCents: number;
  checklist: string[];
}

export const emptySite: SiteFormData = {
  id: null, customerId: "neu", name: "", address: "", latitude: null, longitude: null, geofenceRadius: 150, plannedMinutes: 60,
  accessNotes: "", contact: "", specialNotes: "", billingMode: "pauschale", priceCents: 0, checklist: [],
};

export function SiteForm({ site, customers, showPrices }: { site: SiteFormData; customers: { id: string; name: string }[]; showPrices: boolean }) {
  return (
    <ActionForm action={saveSite.bind(null, site.id)} submit={site.id ? "Speichern" : "Objekt anlegen"} className="grid sm:grid-cols-2 gap-3">
      <Field label="Name des Objekts">
        <input name="name" required defaultValue={site.name} className={inputClass} />
      </Field>
      <Field label="Adresse (Straße, PLZ Ort)">
        <input name="address" required defaultValue={site.address} className={inputClass} />
      </Field>
      <Field label="Kunde">
        <select name="customer_id" defaultValue={site.customerId} className={inputClass}>
          <option value="neu">Neuer Kunde …</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Name des neuen Kunden (leer = wie Objekt)">
        <input name="customer_name" className={inputClass} />
      </Field>
      <Field label="Kalkulierte Minuten pro Einsatz">
        <input name="planned_minutes" type="number" min={5} defaultValue={site.plannedMinutes} className={inputClass} />
      </Field>
      <Field label="Stempel-Umkreis in Metern">
        <input name="geofence_radius_m" type="number" min={30} defaultValue={site.geofenceRadius} className={inputClass} />
      </Field>
      {showPrices && (
        <>
          <Field label="Abrechnung">
            <select name="billing_mode" defaultValue={site.billingMode} className={inputClass}>
              <option value="pauschale">Monatspauschale</option>
              <option value="pro_einsatz">Preis pro Einsatz</option>
            </select>
          </Field>
          <Field label="Preis netto in Euro">
            <input name="price" inputMode="decimal" defaultValue={site.priceCents ? formatEuro(site.priceCents).replace(/[^\d,.]/g, "") : ""} className={inputClass} />
          </Field>
        </>
      )}
      <Field label="Zugang (z. B. Schlüsselsafe)">
        <input name="access_notes" defaultValue={site.accessNotes} className={inputClass} />
      </Field>
      <Field label="Ansprechpartner">
        <input name="contact" defaultValue={site.contact} className={inputClass} />
      </Field>
      <Field label="Besonderheit">
        <input name="special_notes" defaultValue={site.specialNotes} className={inputClass} />
      </Field>
      <Field label="Koordinaten (leer = aus Adresse)">
        <input name="coordinates" placeholder="52.3759, 9.7320" defaultValue={site.latitude !== null ? `${site.latitude}, ${site.longitude}` : ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Checkliste: ein Punkt pro Zeile">
          <textarea name="checklist" rows={6} defaultValue={site.checklist.join("\n")} className={inputClass} />
        </Field>
      </div>
    </ActionForm>
  );
}
