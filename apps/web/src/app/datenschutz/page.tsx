import type { Metadata } from "next";
import { brand } from "@gp/shared";

export const metadata: Metadata = { title: `Datenschutz · ${brand.name}` };

const { provider } = brand;

/** Datenschutzerklärung für Büro-Web und Mitarbeiter-App (auch für die Store-Einträge). Öffentlich erreichbar. */
export default function PrivacyPage() {
  return (
    <article className="max-w-2xl mx-auto my-10 bg-surface border border-line rounded-2xl p-6 sm:p-8 text-sm leading-relaxed flex flex-col gap-4">
      <h1 className="font-display font-extrabold text-2xl">Datenschutzerklärung</h1>
      <p>
        Diese Erklärung gilt für die Mitarbeiter-App „{brand.name}“ (iPhone, Android und Web) und das Büro-Web. Die App wird von Reinigungsfirmen genutzt, um Einsätze zu planen, Arbeitszeiten zu erfassen und mit ihren Mitarbeitern zu kommunizieren.
      </p>

      <Section title="Verantwortlich">
        <p>
          {provider.name}
          <br />
          {provider.street}
          <br />
          {provider.city}
          <br />
          E-Mail: <a className="underline" href={`mailto:${provider.email}`}>{provider.email}</a>
        </p>
        <p>Nutzt eine andere Reinigungsfirma die App, ist diese Firma für die Daten ihrer Mitarbeiter verantwortlich; wir verarbeiten sie dann in ihrem Auftrag.</p>
      </Section>

      <Section title="Welche Daten wir verarbeiten">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Konto:</b> Name, E-Mail-Adresse, Rolle, Sprache. Das Konto legt der Arbeitgeber an.</li>
          <li><b>Arbeitszeit:</b> Beginn und Ende jedes Einsatzes, Abwesenheiten (Urlaub, Krankheit), Stundenkonto und Lohnabrechnungen, die das Büro hochlädt.</li>
          <li><b>Standort:</b> nur im Moment des Ein- und Ausstempelns, um zu prüfen, ob du am Objekt bist. Die App verfolgt deinen Standort nicht im Hintergrund.</li>
          <li><b>Kamera und Fotos:</b> nur wenn du einen QR-Code scannst oder selbst ein Foto an eine Meldung hängst.</li>
          <li><b>Nachrichten:</b> Chat mit der Firmenleitung, Meldungen, Material-Rückmeldungen, Schichttausch und Schlüsselübergaben (inklusive Unterschrift).</li>
          <li><b>Benachrichtigungen:</b> eine technische Kennung deines Geräts, wenn du Benachrichtigungen einschaltest.</li>
        </ul>
      </Section>

      <Section title="Wofür und auf welcher Grundlage">
        <p>
          Die Daten dienen der Durchführung des Arbeitsverhältnisses (Einsatzplanung, Zeiterfassung, Lohnabrechnung, Kommunikation) nach Art. 6 Abs. 1 lit. b DSGVO und § 26 BDSG sowie der gesetzlichen Pflicht zur Arbeitszeiterfassung (Art. 6 Abs. 1 lit. c DSGVO). Es gibt keine Werbung, kein Tracking und keinen Verkauf von Daten.
        </p>
      </Section>

      <Section title="Dienstleister">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Supabase</b> (Datenbank, Anmeldung, Dateispeicher), Rechenzentrum in Frankfurt am Main.</li>
          <li><b>Vercel</b> (Auslieferung der Web-Oberfläche).</li>
          <li><b>Google</b> (Versand von E-Mails über Gmail).</li>
          <li><b>DeepL</b> (Übersetzung von Chat-Nachrichten, nur wenn die Firma das einschaltet).</li>
          <li><b>Apple und Google</b> (Zustellung von Benachrichtigungen und Bereitstellung der App).</li>
        </ul>
        <p>Die Dienstleister verarbeiten die Daten nur in unserem Auftrag und nach unseren Weisungen. Wo Daten außerhalb der EU verarbeitet werden, geschieht das auf Grundlage der EU-Standardvertragsklauseln bzw. des EU-US Data Privacy Framework.</p>
      </Section>

      <Section title="Wie lange wir Daten speichern">
        <p>
          Solange das Arbeitsverhältnis besteht. Danach werden die Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten gelten (z. B. Arbeitszeitnachweise und Lohnunterlagen bis zu 6 bzw. 10 Jahre).
        </p>
      </Section>

      <Section title="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreib dafür an <a className="underline" href={`mailto:${provider.email}`}>{provider.email}</a>. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, in Niedersachsen bei der Landesbeauftragten für den Datenschutz Niedersachsen.
        </p>
        <p>
          <b>Konto löschen:</b> Schreib eine kurze E-Mail an die obige Adresse oder an dein Büro. Wir löschen dein Konto und alle Daten, die nicht aufbewahrt werden müssen.
        </p>
      </Section>

      <p className="text-xs text-muted">Stand: Oktober 2026</p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display font-bold text-lg">{title}</h2>
      {children}
    </section>
  );
}
