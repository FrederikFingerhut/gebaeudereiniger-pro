#!/usr/bin/env bash
# Lädt die Übersetzungs-Funktion für den Chat zu Supabase hoch.
# Aufruf: SUPABASE_ACCESS_TOKEN=... scripts/deploy-translate.sh
set -euo pipefail
REF="yvwykodhkkyyizajauln"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/supabase/functions/translate"
curl -sS -f -X POST "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=translate" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"translate","verify_jwt":false};type=application/json' \
  -F "file=@index.ts;filename=index.ts"
echo
