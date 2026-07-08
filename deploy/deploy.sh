#!/usr/bin/env bash
# Deploy/aktualizacja Avenit na VPS. Uruchamiaj w katalogu repozytorium na serwerze.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Brak pliku .env — skopiuj deploy/.env.production.example do .env i uzupełnij." >&2
  exit 1
fi

echo "==> Budowanie obrazów..."
docker compose build

echo "==> Budowanie i kopiowanie frontendów do wolumenów..."
docker compose run --rm frontend-build

echo "==> Start bazy..."
docker compose up -d postgres
# Poczekaj aż baza gotowa
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-avenit}" >/dev/null 2>&1; do
  echo "   czekam na Postgres..."; sleep 2
done

echo "==> Migracja schematu platform..."
docker compose run --rm \
  -e DATABASE_URL="postgres://${POSTGRES_USER:-avenit}:${POSTGRES_PASSWORD}@postgres:5432/avenit_platform" \
  api node db/migrate.mjs platform

echo "==> Migracje przyrostowe wszystkich tenantów..."
docker compose run --rm \
  -e DATABASE_URL="postgres://${POSTGRES_USER:-avenit}:${POSTGRES_PASSWORD}@postgres:5432/avenit_platform" \
  api node db/migrate.mjs tenants || echo "   (brak tenantów lub migracji — pomijam)"

echo "==> Start wszystkich usług..."
docker compose up -d

echo "==> Gotowe. Status:"
docker compose ps
