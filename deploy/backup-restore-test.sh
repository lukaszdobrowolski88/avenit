#!/usr/bin/env bash
# Comiesięczny test odtwarzania: najnowsza kopia → tymczasowy Postgres 16 (bez sieci) →
# pg_restore każdej bazy + liczba wierszy w kluczowych tabelach porównana z produkcją,
# test archiwum plików i obecność zaszyfrowanej konfiguracji. Raport e-mailem (sukces i błąd).
# Cron hosta: 0 5 1 * * cd /opt/avenit && bash deploy/backup-restore-test.sh >> backups/restore-test.log 2>&1
set -uo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

PGUSER="${POSTGRES_USER:-avenit}"
NAME="avenit-restore-test"
REPORT=()
PROBLEMS=()
ok() { REPORT+=("OK   $*"); echo "OK   $*"; }
bad() { PROBLEMS+=("$*"); REPORT+=("BŁĄD $*"); echo "BŁĄD $*"; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

LATEST=$(ls -d backups/20* 2>/dev/null | sort | tail -1)
if [ -z "$LATEST" ]; then
  bad "Brak jakiejkolwiek kopii w backups/"
else
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
  if [ "$AGE_H" -gt 36 ]; then bad "Najnowsza kopia ma ${AGE_H} h ($LATEST) — nocny backup nie działa?"; else ok "Najnowsza kopia: $LATEST (${AGE_H} h temu)"; fi

  cleanup
  docker run -d --rm --name "$NAME" --network none -e POSTGRES_PASSWORD=restore-test postgres:16 >/dev/null
  for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  sleep 2

  # Kluczowe tabele do porównania (te, które istnieją w danej bazie).
  TABLES="app_users members events messages conversations notifications tenants subscription_plans"
  for dump in "$LATEST"/*.dump; do
    db=$(basename "$dump" .dump)
    docker exec "$NAME" createdb -U postgres "$db"
    if docker exec -i "$NAME" pg_restore -U postgres -d "$db" --no-owner --no-privileges < "$dump" 2> /tmp/restore-$db.err; then
      ok "$db: odtworzona bez błędów"
    else
      errs=$(grep -c "error:" /tmp/restore-$db.err || true)
      bad "$db: pg_restore zgłosił błędy ($errs) — $(grep -m1 'error:' /tmp/restore-$db.err | cut -c1-160)"
    fi
    for t in $TABLES; do
      restored=$(docker exec "$NAME" psql -U postgres -d "$db" -tAc "SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN NULL ELSE (SELECT count(*) FROM public.$t) END" 2>/dev/null | tr -d '[:space:]')
      [ -z "$restored" ] && continue
      prod=$(docker compose exec -T postgres psql -U "$PGUSER" -d "$db" -tAc "SELECT count(*) FROM public.$t" 2>/dev/null | tr -d '[:space:]')
      # Kopia jest z nocy — produkcja może mieć więcej wierszy; mniej niż połowa = coś nie tak.
      if [ -n "$prod" ] && [ "$prod" -gt 0 ] && [ $(( restored * 2 )) -lt "$prod" ]; then
        bad "$db.$t: w kopii $restored, na produkcji $prod"
      else
        ok "$db.$t: $restored wierszy (produkcja: ${prod:-?})"
      fi
    done
  done

  if [ -s "$LATEST/storage.tar.gz" ] && files=$(tar tzf "$LATEST/storage.tar.gz" 2>/dev/null | wc -l); then
    ok "Pliki (storage.tar.gz): $files pozycji, $(du -h "$LATEST/storage.tar.gz" | cut -f1)"
  else
    bad "Archiwum plików storage.tar.gz uszkodzone albo puste"
  fi

  if [ -s "$LATEST/config.tar.gz.cms" ]; then
    ok "Konfiguracja zaszyfrowana (config.tar.gz.cms): $(du -h "$LATEST/config.tar.gz.cms" | cut -f1) — odszyfrować można tylko kluczem właściciela"
  else
    bad "Brak zaszyfrowanej kopii konfiguracji (.env, secrets/)"
  fi
fi

STATUS=$([ ${#PROBLEMS[@]} -eq 0 ] && echo "OK" || echo "PROBLEMY: ${#PROBLEMS[@]}")
echo "==> Test odtwarzania: $STATUS"
bash deploy/notify.sh "Avenit: test odtwarzania kopii — $STATUS" \
  "Comiesięczny test odtwarzania kopii zapasowej ($(date '+%Y-%m-%d %H:%M')).

$(printf '%s\n' "${REPORT[@]}")

Kopia była odtwarzana w tymczasowej bazie bez dostępu do sieci; produkcja nie była zmieniana." || true

[ ${#PROBLEMS[@]} -eq 0 ]
