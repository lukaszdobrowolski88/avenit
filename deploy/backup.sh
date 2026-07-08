#!/usr/bin/env bash
# Nocny backup: pg_dump każdej bazy (platform + tenanci) + tar storage.
# Retencja lokalna 14 dni; opcjonalny offsite przez rclone.
# Uruchamiaj z crona hosta: 0 3 * * * /path/deploy/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

STAMP=$(date +%Y%m%d_%H%M%S)
DEST="./backups/$STAMP"
mkdir -p "$DEST"

PGUSER="${POSTGRES_USER:-avenit}"

echo "==> Backup baz danych..."
# Lista wszystkich baz avenit_* (platform + tenanci)
DBS=$(docker compose exec -T postgres psql -U "$PGUSER" -tAc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'avenit_%'")

for db in $DBS; do
  echo "   pg_dump $db"
  docker compose exec -T postgres pg_dump -U "$PGUSER" -Fc "$db" > "$DEST/$db.dump"
done

echo "==> Backup plików storage..."
docker run --rm -v avenit_storage:/srv/storage -v "$(pwd)/$DEST":/backup alpine \
  tar czf /backup/storage.tar.gz -C /srv/storage . 2>/dev/null || \
  docker compose exec -T api tar czf - -C /srv/storage . > "$DEST/storage.tar.gz"

echo "==> Retencja lokalna (14 dni)..."
find ./backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  echo "==> Wysyłka offsite przez rclone → $BACKUP_RCLONE_REMOTE"
  rclone copy "$DEST" "$BACKUP_RCLONE_REMOTE/$STAMP"
fi

echo "==> Backup zakończony: $DEST"
