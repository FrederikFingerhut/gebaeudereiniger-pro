# Hinweise für die Arbeit im Repository

- Sprache der Oberfläche, Kommentare und Commit-Nachrichten: Deutsch.
- Monorepo mit npm workspaces: `apps/mobile` (Expo), `apps/web` (Next.js), `packages/shared`.
- Logik, die beide Apps brauchen, gehört nach `packages/shared` und bekommt Tests (`npm test`).
- Jede Tabelle hat `company_id` und Row Level Security. Neue Tabellen brauchen Regeln und einen Test in `supabase/tests/rls_test.sql`.
- Preise und Rechnungen sehen nur `buero` und `chef`; Mitarbeiter nie.
- Texte der Mitarbeiter-App immer in allen Sprachen in `packages/shared/src/i18n.ts` (de, en, ru, uk).
- Farben und Name nur über `packages/shared/src/brand.ts`, nie fest im Code.
- Vor dem Abschluss: `npm test`, `npm run typecheck`, `npm run build -w web`.
- `apps/web/AGENTS.md` und `apps/mobile/AGENTS.md` beachten: Next.js und Expo sind neuer als das Trainingswissen; Doku lesen.
