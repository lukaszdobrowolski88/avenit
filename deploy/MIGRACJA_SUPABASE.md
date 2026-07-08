# Runbook: migracja kościoła „schwro" z Supabase na VPS

Przeniesienie działającej produkcji (z realnymi użytkownikami) jako pierwszego tenanta. Zakłada okno serwisowe (kilka godzin).

## Przygotowanie (bez przestoju)

1. **Dane dostępowe Supabase**:
   - `SUPABASE_DB_URL` — z Dashboard → Settings → Database → Connection string.
   - `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` — Settings → API.

2. **Utwórz tenanta na VPS** w panelu admina (Tenanci → + Nowy tenant), slug `schwro`. Powstanie pusta baza `avenit_tenant_schwro` ze schematem szablonu.

3. **Uzgodnij schemat z produkcją** (KLUCZOWE — katalogi migracji są rozbieżne z produkcją):
   ```bash
   SUPABASE_DB_URL='...' TENANT_DB='avenit_tenant_schwro' DRY_RUN=1 ./deploy/migrate-from-supabase.sh
   # obejrzyj migration_*/live_schema.sql — jeśli produkcja ma tabele/kolumny,
   # których nie ma szablon, dodaj je do avenit_tenant_schwro ręcznie (ALTER/CREATE)
   # albo odtwórz bazę tenanta wprost z live_schema.sql zamiast z szablonu.
   ```

4. **Dry-run pełny** na kopii: porównaj liczności wierszy źródła i celu.

## Cutover (okno serwisowe)

1. Ogłoś przerwę techniczną użytkownikom.
2. **Zamroź zapisy** w starej aplikacji (opcjonalnie: tryb read-only / komunikat).
3. **Świeży import danych + haseł**:
   ```bash
   SUPABASE_DB_URL='...' TENANT_DB='avenit_tenant_schwro' ./deploy/migrate-from-supabase.sh
   ```
   Skrypt przenosi dane `public`, mapuje hasła `auth.users.encrypted_password` (bcrypt) → `app_users.password_hash` po e-mailu — **użytkownicy logują się dotychczasowym hasłem**.
4. **Pliki Storage**:
   ```bash
   SUPABASE_URL='https://<ref>.supabase.co' SUPABASE_SERVICE_ROLE_KEY='...' \
   TENANT_SLUG=schwro STORAGE_DIR=/srv/storage \
   docker compose exec -T api node /app/deploy/migrate-storage.mjs
   # (lub uruchom lokalnie z zamontowanym wolumenem storage)
   ```
5. **Weryfikacja liczności**:
   ```bash
   # źródło
   psql "$SUPABASE_DB_URL" -c "SELECT 'members', count(*) FROM members UNION ALL SELECT 'programs', count(*) FROM programs UNION ALL SELECT 'app_users', count(*) FROM app_users"
   # cel
   docker compose exec postgres psql -U avenit -d avenit_tenant_schwro -c "SELECT 'members', count(*) FROM members UNION ALL SELECT 'programs', count(*) FROM programs UNION ALL SELECT 'app_users', count(*) FROM app_users"
   ```
6. **Przełącz DNS**: subdomena `schwro.avenit.pl` → VPS (jeśli nie działa już przez wildcard).
7. **Smoke test** (patrz sekcja Weryfikacja w planie): logowanie zmigrowanym kontem, programy, pieśni, formularze, Komunikator, kampanie.
8. **Mobile**: `eas update` z `EXPO_PUBLIC_API_URL=https://api.avenit.pl`, `EXPO_PUBLIC_TENANT=schwro`.
9. **WordPress**: zmień URL aplikacji w pluginie Avenit Forms na `https://schwro.avenit.pl`.

## Po cutoverze

- Zostaw projekt Supabase **tydzień jako fallback** (tylko do odczytu). Po potwierdzeniu stabilności — usuń.
- Włącz backup (`deploy/backup.sh` w cronie).

## Uwaga o tożsamości użytkowników

W nowym API kluczem tożsamości jest `app_users.id`, ale dane produkcyjne (konwersacje, obecność, `created_by`) bywają kluczowane starym `auth_user_id` z GoTrue. JWT niesie oba (`sub` = app_users.id, `auid` = auth_user_id) i warstwa presence używa `auid`, dzięki czemu zmigrowane rekordy pozostają spójne. Jeśli po migracji jakiś moduł pokazuje puste dane „per user", sprawdź, czy filtruje po `auth_user_id` czy `email`.
