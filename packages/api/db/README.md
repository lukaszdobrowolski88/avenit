# Baza danych Avenit

Architektura: **baza per tenant**. Dwa rodzaje baz:

| Baza | Zawartość | Schemat |
|------|-----------|---------|
| `avenit_platform` | control plane: tenanci, plany, subskrypcje, faktury, płatności, kupony, windykacja, administratorzy platformy, `tenant_modules`, `audit_log` | `platform/schema.sql` |
| `avenit_tenant_<slug>` | dane pojedynczego kościoła (~127 tabel: użytkownicy, programy, pieśni, członkowie, kampanie, mail, itd.) | `template/tenant_schema.sql` |

## Pliki

- **`platform/schema.sql`** — pełny, idempotentny schemat bazy platform. Utrzymywany ręcznie.
- **`template/tenant_schema.sql`** — szablon bazy nowego tenanta. **GENEROWANY** przez `build-tenant-schema.mjs` — nie edytuj ręcznie.
- **`build-tenant-schema.mjs`** — składa szablon z rzeczywistych migracji (`supabase/migrations` + `migrations`), usuwając konstrukcje Supabase (RLS, `auth.*`, `storage.*`, realtime, pg_cron/pg_net) i dodając warstwę auth (hasła, refresh tokeny). Uruchom po zmianie migracji: `node packages/api/db/build-tenant-schema.mjs`.
- **`migrate.mjs`** — runner migracji (tabela `_migrations` per baza).
- **`platform/migrations/`**, **`tenant-migrations/`** — przyrostowe migracje nakładane runnerem po wygenerowaniu schematu bazowego.

## Użycie

```bash
# Migracja bazy platform (pełny schemat + przyrostowe)
DATABASE_URL=postgres://avenit:pass@host:5432/avenit_platform node packages/api/db/migrate.mjs platform

# Migracje przyrostowe dla wszystkich tenantów
node packages/api/db/migrate.mjs tenants

# Migracje przyrostowe jednej bazy tenanta
node packages/api/db/migrate.mjs tenant avenit_tenant_schwro
```

Prowizjonowanie nowego tenanta (`CREATE DATABASE` + `template/tenant_schema.sql` + seed konta admina) wykonuje `src/admin/provisioning.js` — wywoływane z panelu administracyjnego.

## ⚠️ WYMAGANE uzgodnienie z produkcją przed migracją realnych danych

Katalogi migracji (`migrations/` i `supabase/migrations/`) są **rozbieżne** i nie odtwarzają produkcji 1:1 (część zmian robiono ręcznie w SQL Editorze Supabase). `template/tenant_schema.sql` to punkt wyjścia dla **nowych** tenantów, nie kopia produkcji.

Przed migracją bazy „schwro" (Faza 6) wykonaj:

```bash
# 1. Zrzut schematu produkcji z Supabase
pg_dump --schema-only --schema=public "$SUPABASE_DB_URL" > live_schema.sql

# 2. Porównaj z szablonem i uzupełnij różnice
diff <(grep -oE 'CREATE TABLE[^(]*' live_schema.sql | sort) \
     <(grep -oE 'CREATE TABLE[^(]*' template/tenant_schema.sql | sort)
```

Migracja realnych danych (`pg_dump --data-only`) idzie do bazy tenanta odtworzonej z **produkcyjnego schematu**, nie z szablonu — szablon służy nowym kościołom.

## Znane ograniczenia szablonu

Builder zgłasza ~66 nieblokujących ostrzeżeń przy pierwszym ładowaniu (duplikaty seedów `ON CONFLICT` oraz kilka seedów/indeksów zależnych od kolumn dodawanych przez późniejsze migracje). Struktura wszystkich 127 tabel powstaje poprawnie — ostrzeżenia dotyczą wyłącznie danych startowych i zostaną wyeliminowane po uzgodnieniu z `pg_dump` produkcji.
