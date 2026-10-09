#!/usr/bin/env bash
# Lädt die Push-Funktion zu Supabase hoch. Die Texte kommen aus packages/shared,
# dafür werden die Dateien kopiert und die Importe auf ".ts" umgestellt (Deno).
# Aufruf: SUPABASE_ACCESS_TOKEN=... scripts/deploy-push.sh
set -euo pipefail
REF="yvwykodhkkyyizajauln"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/shared"
cp "$ROOT/supabase/functions/push/index.ts" "$TMP/index.ts"
for f in notifications i18n types; do
  sed -E 's#from "\./([a-z0-9]+)";#from "./\1.ts";#' "$ROOT/packages/shared/src/$f.ts" > "$TMP/shared/$f.ts"
done
cd "$TMP"
curl -sS -f -X POST "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=push" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"push","verify_jwt":false};type=application/json' \
  -F "file=@index.ts;filename=index.ts" \
  -F "file=@shared/notifications.ts;filename=shared/notifications.ts" \
  -F "file=@shared/i18n.ts;filename=shared/i18n.ts" \
  -F "file=@shared/types.ts;filename=shared/types.ts"
echo
rm -rf "$TMP"
