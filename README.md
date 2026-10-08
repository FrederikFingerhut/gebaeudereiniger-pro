# Gebäudereiniger Pro

All-in-One-App für Gebäudereinigungsfirmen: Einsatzplanung, Zeiterfassung am Objekt, Checklisten,
Meldungen mit Fotos und Rechnungsvorbereitung mit Übergabe an Lexoffice.

Zuerst im Einsatz in der eigenen Firma (Pilot), später als Monatsabo für andere Reinigungsfirmen.
Deshalb ist die Datenbank von Anfang an mandantenfähig: Jede Firma sieht nur ihre eigenen Daten.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `apps/mobile` | Handy-App für Mitarbeiter (Expo / React Native, iPhone und Android) |
| `apps/web` | Büro- und Chef-Oberfläche im Browser (Next.js) |
| `packages/shared` | Gemeinsamer Code: Datentypen, Einsatzplanung, Zeiten, Rechnungslogik, Übersetzungen, Farben |
| `supabase/migrations` | Datenbank (Supabase / PostgreSQL) mit Zugriffsregeln |
| `supabase/tests` | Tests der Zugriffsregeln |

Name, Farben und Logo-Farben stehen an einer Stelle: `packages/shared/src/brand.ts`.

## Loslegen

Voraussetzung: Node.js 22.

```bash
npm install
npm test            # Tests der gemeinsamen Logik
npm run typecheck   # Typprüfung aller Teile
npm run web         # Büro-Oberfläche auf http://localhost:3000
npm run mobile      # Handy-App mit Expo starten (QR-Code mit Expo Go scannen)
```

## Stand

- Büro-Web und Handy-App zeigen vorerst **Beispieldaten** (`packages/shared/src/demo.ts`).
- Die Datenbankstruktur mit Zugriffsregeln ist fertig und getestet, aber noch nicht an die Apps angebunden.

## Nächste Schritte

1. Supabase-Projekt anlegen (Region Frankfurt) und Migration einspielen
2. Anmeldung für Mitarbeiter, Büro und Chef
3. Apps an die Datenbank anbinden (Einsätze, Stempeln, Checklisten, Meldungen)
4. Stempeln mit Standortprüfung bzw. QR-Code im Objekt, Fotos bei Meldungen
5. Lexoffice-Schnittstelle: Kunden abgleichen und Rechnungsentwürfe übergeben
