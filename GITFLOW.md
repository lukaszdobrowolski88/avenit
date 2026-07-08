# Avenit — flow pracy, gałęzi i deploymentu

Ten dokument opisuje jak wprowadzamy zmiany i wdrażamy je na produkcję. **Każda zmiana i każdy deploy idą tą ścieżką** — bez wyjątków (także zmiany robione przez Claude).

## Gałęzie

| Gałąź | Rola |
|-------|------|
| `main` | **Produkcja.** Zawsze wdrażalna. Wchodzi na nią tylko kod przez Pull Request. Nie pushujemy bezpośrednio. |
| `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` | Gałęzie robocze — jedna na zadanie. Odgałęziane od `main`, wracają PR-em. |

Nazewnictwo gałęzi: `<typ>/<krótki-opis-kebab>`, np. `feat/panel-eksport-backupu`, `fix/p24-webhook-checksum`.

## Konwencja commitów (Conventional Commits)

```
<typ>(<zakres opcjonalny>): <opis w trybie rozkazującym>

[opcjonalny body — co i dlaczego]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

Typy: `feat` (nowa funkcja), `fix` (błąd), `chore` (utrzymanie), `docs`, `refactor`, `test`, `perf`.
Zakres = obszar kodu, np. `api`, `admin`, `web`, `mobile`, `db`, `deploy`.

Przykłady:
- `feat(admin): eksport backupu bazy tenanta z panelu`
- `fix(api): poprawny nagłówek Basic auth w przelewy24-webhook`
- `chore(deploy): bump postgres do 16.4`

## Cykl zmiany (krok po kroku)

```bash
# 1. Świeży main
git checkout main && git pull origin main

# 2. Nowa gałąź robocza
git checkout -b feat/nazwa-zadania

# 3. Zmiany + weryfikacja LOKALNIE (patrz sekcja "Weryfikacja przed PR")
cd packages/api && npm test          # testy jednostkowe API
npm run build                        # build web (z roota)
cd packages/admin && npm run build   # build panelu

# 4. Commit (jeden logiczny commit na zmianę)
git add -A
git commit -m "feat(zakres): opis"

# 5. Push gałęzi
git push -u origin feat/nazwa-zadania

# 6. Pull Request → main (przez API/gh, opis + dowód testów)
#    Tytuł = temat commita; body = co zmienia, jak przetestowano, ryzyka.

# 7. Po przejściu CI i przeglądzie → merge (squash) do main
# 8. Usuń gałąź roboczą, wróć na main
```

## Weryfikacja przed PR (obowiązkowa)

Zanim otworzysz PR, lokalnie musi przejść:
- `cd packages/api && npm test` — testy jednostkowe (query builder, TOTP, autoryzacja).
- `npm run build` (web) i `cd packages/admin && npm run build` — buildy produkcyjne bez błędów.
- Przy zmianach schematu bazy: `node packages/api/db/build-tenant-schema.mjs` + załadowanie do lokalnego Postgresa bez błędów strukturalnych.
- Przy zmianach w Data API / auth: smoke test na lokalnym API (login → zapytanie → wynik).

CI (GitHub Actions, `.github/workflows/ci.yml`) uruchamia te same testy i buildy na każdym PR — PR nie mergujemy z czerwonym CI.

## Deployment na VPS

Produkcja aktualizuje się **wyłącznie z gałęzi `main`**.

```bash
# na VPS, w katalogu repozytorium avenit
git checkout main && git pull origin main
./deploy/deploy.sh
```

`deploy.sh`: build obrazów → build frontendów → migracja bazy platform → migracje tenantów → restart usług. Bezpieczny do wielokrotnego uruchamiania (idempotentny).

### Zasady deploymentu
1. **Backup przed każdym deployem** zmieniającym schemat: `./deploy/backup.sh` (albo automatyczny nocny musi być świeży).
2. **Tag wersji** po istotnym wdrożeniu: `git tag -a vX.Y.Z -m "opis" && git push origin vX.Y.Z`.
3. **Migracje bazy** dodajemy jako pliki w `packages/api/db/platform/migrations/` lub `packages/api/db/tenant-migrations/` — runner nakłada je raz (tabela `_migrations`). Nigdy nie edytujemy już wdrożonej migracji — dodajemy nową.
4. Po deployu: `docker compose ps` + smoke test kluczowej ścieżki (logowanie do panelu i do przykładowego tenanta).

## Rollback

```bash
# Kod: wróć do poprzedniego taga i przebuduj
git checkout vX.Y.(Z-1)
./deploy/deploy.sh

# Baza (jeśli migracja zepsuła dane): odtwórz z backupu
docker compose exec -T postgres pg_restore -U avenit -d <baza> --clean < backups/<stamp>/<baza>.dump
```

Migracje piszemy tak, by były **odwracalne lub addytywne** (dodawanie kolumn `IF NOT EXISTS`, nie destrukcyjne DROP-y bez backupu).

## Wersjonowanie

SemVer na tagach `main`:
- **MAJOR** — zmiana łamiąca (np. niekompatybilna zmiana API/schematu wymagająca migracji ręcznej).
- **MINOR** — nowa funkcja wstecznie zgodna.
- **PATCH** — poprawka błędu.

## Mapa środowisk

| Element | Gdzie |
|---------|-------|
| Kod | GitHub: `lukaszdobrowolski88/avenit` (prywatne) |
| Produkcja | VPS Hostinger (Docker Compose), `main` |
| Panel admina | `admin.<domena>` |
| Tenanci | `<slug>.<domena>` |
| API mobilne | `api.<domena>` |

## Sekrety — NIGDY do repo

`.env` (produkcyjny), tokeny, klucze API, backupy i zrzuty baz są w `.gitignore`. Do repo trafia tylko `deploy/.env.production.example` (szablon bez wartości).
