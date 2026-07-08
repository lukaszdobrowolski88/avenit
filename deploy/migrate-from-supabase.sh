#!/usr/bin/env bash
# Migracja jednego kościoła z Supabase do bazy tenanta na VPS.
#
# Przenosi: schemat + dane public (pg_dump), hasła użytkowników (bcrypt z
# auth.users → app_users.password_hash), pliki Storage.
#
# Użycie:
#   SUPABASE_DB_URL='postgres://postgres:HASLO@db.<ref>.supabase.co:5432/postgres' \
#   TENANT_DB='avenit_tenant_schwro' \
#   ./deploy/migrate-from-supabase.sh
#
# WAŻNE: uruchom najpierw z DRY_RUN=1, sprawdź liczności, potem właściwie.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

: "${SUPABASE_DB_URL:?Ustaw SUPABASE_DB_URL}"
: "${TENANT_DB:?Ustaw TENANT_DB (np. avenit_tenant_schwro)}"
PGUSER="${POSTGRES_USER:-avenit}"
WORK="./migration_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$WORK"

echo "==> 1/5 Zrzut schematu public z Supabase (do wglądu / uzgodnienia szablonu)"
pg_dump --schema-only --schema=public "$SUPABASE_DB_URL" > "$WORK/live_schema.sql"
echo "    Zapisano $WORK/live_schema.sql — porównaj z packages/api/db/template/tenant_schema.sql"

echo "==> 2/5 Zrzut DANYCH public z Supabase"
# --data-only, bez właściciela; wykluczamy tabele SaaS (są w bazie platform)
# oraz pozostałości Supabase.
pg_dump --data-only --schema=public --no-owner --no-privileges \
  --exclude-table='public.tenants' \
  --exclude-table='public.subscription_plans' \
  --exclude-table='public.tenant_subscriptions' \
  --exclude-table='public.invoices' \
  --exclude-table='public.payment_transactions' \
  --exclude-table='public.coupons' \
  --exclude-table='public.coupon_redemptions' \
  --exclude-table='public.dunning_config' \
  --exclude-table='public.dunning_log' \
  "$SUPABASE_DB_URL" > "$WORK/data.sql"
echo "    Zapisano $WORK/data.sql ($(wc -l < "$WORK/data.sql") linii)"

echo "==> 3/5 Eksport haseł użytkowników (auth.users → mapa email→hash)"
# encrypted_password w GoTrue to bcrypt ($2a$...), zgodny z naszym bcryptjs.
psql "$SUPABASE_DB_URL" -tAc \
  "SELECT email || E'\t' || COALESCE(encrypted_password,'') FROM auth.users WHERE email IS NOT NULL" \
  > "$WORK/passwords.tsv"
echo "    $(wc -l < "$WORK/passwords.tsv") kont z hasłami"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> DRY_RUN — pomijam import. Sprawdź pliki w $WORK/."
  echo "    Liczności źródła:"
  psql "$SUPABASE_DB_URL" -tAc \
    "SELECT 'app_users', count(*) FROM public.app_users UNION ALL SELECT 'members', count(*) FROM public.members UNION ALL SELECT 'programs', count(*) FROM public.programs" 2>/dev/null || true
  exit 0
fi

echo "==> 4/5 Import danych do $TENANT_DB"
# Baza tenanta musi już istnieć (utworzona przez panel: prowizjonowanie).
# Wyłącz triggery na czas importu, żeby nie odpalać hooków.
docker compose exec -T postgres psql -U "$PGUSER" -d "$TENANT_DB" -c "SET session_replication_role = replica;" -f - < "$WORK/data.sql" \
  || docker compose exec -T postgres psql -U "$PGUSER" -d "$TENANT_DB" < "$WORK/data.sql"

echo "==> 5/5 Wgranie haseł (email → password_hash)"
# Załaduj mapę do tabeli tymczasowej i zaktualizuj app_users.
docker compose exec -T postgres psql -U "$PGUSER" -d "$TENANT_DB" <<'SQL'
CREATE TEMP TABLE _pw (email text, hash text);
SQL
docker compose exec -T postgres psql -U "$PGUSER" -d "$TENANT_DB" -c "\copy _pw FROM STDIN WITH (FORMAT text)" < "$WORK/passwords.tsv"
docker compose exec -T postgres psql -U "$PGUSER" -d "$TENANT_DB" <<'SQL'
UPDATE app_users u SET password_hash = p.hash
  FROM _pw p WHERE lower(u.email) = lower(p.email) AND p.hash <> '';
SELECT count(*) AS uzytkownicy_z_haslem FROM app_users WHERE password_hash IS NOT NULL;
SQL

echo ""
echo "==> Migracja danych zakończona. Pliki Storage:"
echo "    Uruchom osobno: node deploy/migrate-storage.mjs (patrz MIGRACJA_SUPABASE.md)"
echo "==> Porównaj liczności wierszy między Supabase a $TENANT_DB przed cutoverem."
