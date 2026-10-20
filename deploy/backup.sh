#!/usr/bin/env bash
# Nocny backup: pg_dump każdej bazy (platform + tenanci) + tar storage + zaszyfrowana
# konfiguracja (.env + secrets/). Retencja lokalna 14 dni; opcjonalny offsite przez rclone.
# Uruchamiaj z crona hosta: 0 3 * * * cd /opt/avenit && bash deploy/backup.sh >> backups/backup.log 2>&1
# Każdy błąd (także pusty / nieczytelny zrzut) → e-mail (deploy/notify.sh).
#
# Konfiguracja szyfrowana KLUCZEM PUBLICZNYM (certyfikat X.509 w secrets/backup-cert.pem,
# openssl cms, AES-256). Klucz prywatny NIE leży na serwerze — trzyma go właściciel; bez niego
# archiwum config.tar.gz.cms jest nieczytelne (także dla kogoś, kto przejmie serwer).
# Odszyfrowanie (na komputerze z kluczem):
#   openssl cms -decrypt -binary -inform DER -inkey avenit-backup-key.pem \
#     -in config.tar.gz.cms -out config.tar.gz && tar xzf config.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

STAMP=$(date +%Y%m%d_%H%M%S)
DEST="./backups/$STAMP"
mkdir -p "$DEST"
STEP="start"
WARNINGS=()

fail() {
  local code=$?
  echo "!! Backup NIEUDANY (krok: $STEP, kod: $code)"
  bash deploy/notify.sh "Avenit: kopia zapasowa NIEUDANA ($STAMP)" \
    "Nocna kopia zapasowa nie powiodła się.

Krok: $STEP
Kod wyjścia: $code
Serwer: $(hostname)
Katalog: $DEST

Szczegóły: /opt/avenit/backups/backup.log" || true
  exit "$code"
}
trap fail ERR

PGUSER="${POSTGRES_USER:-avenit}"

STEP="lista baz"
echo "==> Backup baz danych..."
# Lista wszystkich baz avenit_* (platform + tenanci).
# -d postgres: bez tego psql łączy się z bazą o nazwie usera (która nie istnieje).
DBS=$(docker compose exec -T postgres psql -U "$PGUSER" -d postgres -tAc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'avenit_%'")
[ -n "$DBS" ] || { echo "brak baz avenit_*"; false; }

for db in $DBS; do
  STEP="pg_dump $db"
  echo "   pg_dump $db"
  docker compose exec -T postgres pg_dump -U "$PGUSER" -Fc "$db" > "$DEST/$db.dump"
  # Zrzut musi być niepusty i czytelny (spis obiektów), inaczej kopia jest bezwartościowa.
  STEP="weryfikacja $db"
  [ -s "$DEST/$db.dump" ]
  docker compose exec -T postgres pg_restore --list < "$DEST/$db.dump" > /dev/null
done

STEP="storage"
echo "==> Backup plików storage..."
docker run --rm -v avenit_storage:/srv/storage -v "$(pwd)/$DEST":/backup alpine \
  tar czf /backup/storage.tar.gz -C /srv/storage . 2>/dev/null || \
  docker compose exec -T api tar czf - -C /srv/storage . > "$DEST/storage.tar.gz"
STEP="weryfikacja storage"
[ -s "$DEST/storage.tar.gz" ]
gzip -t "$DEST/storage.tar.gz"

STEP="konfiguracja"
echo "==> Konfiguracja (.env + secrets/, zaszyfrowana)..."
if [ -s secrets/backup-cert.pem ]; then
  tar czf - .env secrets 2>/dev/null \
    | openssl cms -encrypt -binary -aes256 -outform DER -out "$DEST/config.tar.gz.cms" secrets/backup-cert.pem
  [ -s "$DEST/config.tar.gz.cms" ]
else
  WARNINGS+=("Brak secrets/backup-cert.pem — konfiguracja (.env, secrets/) NIE została skopiowana.")
  echo "   UWAGA: brak certyfikatu — pomijam konfigurację"
fi

STEP="retencja"
echo "==> Retencja lokalna (14 dni)..."
# Tylko katalogi kopii (20YYMMDD_…) — nigdy sam ./backups.
find ./backups -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf {} + 2>/dev/null || true

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  STEP="offsite rclone"
  echo "==> Wysyłka offsite przez rclone → $BACKUP_RCLONE_REMOTE"
  rclone copy "$DEST" "$BACKUP_RCLONE_REMOTE/$STAMP"
fi

trap - ERR
if [ ${#WARNINGS[@]} -gt 0 ]; then
  bash deploy/notify.sh "Avenit: kopia zapasowa z ostrzeżeniem ($STAMP)" \
    "Kopia baz i plików wykonana, ale:
$(printf -- '- %s\n' "${WARNINGS[@]}")" || true
fi
echo "==> Backup zakończony: $DEST ($(du -sh "$DEST" | cut -f1))"
