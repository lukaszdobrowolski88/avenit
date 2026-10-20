#!/usr/bin/env bash
# Powiadomienie e-mail o kopiach zapasowych (Resend, ten sam klucz co API).
# Użycie: deploy/notify.sh "Temat" "Treść (zwykły tekst)"
# Odbiorca: BACKUP_ALERT_EMAIL z .env, domyślnie lukasz@avenit.pl. Bez RESEND_API_KEY — tylko log.
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

SUBJECT="${1:-Avenit — kopia zapasowa}"
BODY="${2:-}"
TO="${BACKUP_ALERT_EMAIL:-lukasz@avenit.pl}"
FROM="${RESEND_FROM_EMAIL:-${MAILING_FROM_EMAIL:-}}"

if [ -z "${RESEND_API_KEY:-}" ] || [ -z "$FROM" ]; then
  echo "notify: brak RESEND_API_KEY / RESEND_FROM_EMAIL — pomijam e-mail: $SUBJECT" >&2
  exit 0
fi

PAYLOAD=$(SUBJECT="$SUBJECT" BODY="$BODY" TO="$TO" FROM="$FROM" python3 -c '
import json, os
print(json.dumps({
  "from": "Avenit Serwer <%s>" % os.environ["FROM"],
  "to": [os.environ["TO"]],
  "subject": os.environ["SUBJECT"],
  "text": os.environ["BODY"],
}))')

curl -sS --max-time 20 -o /dev/null -w "notify: Resend HTTP %{http_code}\n" \
  -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" || echo "notify: wysyłka nieudana" >&2
