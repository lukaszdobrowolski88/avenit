# Instrukcja uruchomienia Storage dla Finansów

## Uruchomienie migracji SQL

Aby włączyć przesyłanie plików w module Finanse, musisz uruchomić migrację SQL, która tworzy bucket storage.

### Opcja 1: Supabase Dashboard (zalecane)

1. Zaloguj się do [Supabase Dashboard](https://app.supabase.com)
2. Wybierz swój projekt
3. Przejdź do **SQL Editor** w lewym menu
4. Skopiuj zawartość pliku `supabase/migrations/create_finance_storage_bucket.sql`
5. Wklej do SQL Editor i kliknij **Run**

### Opcja 2: Supabase CLI

Jeśli masz zainstalowane Supabase CLI:

```bash
supabase db push
```

lub dla pojedynczej migracji:

```bash
supabase migration up --file supabase/migrations/create_finance_storage_bucket.sql
```

### Opcja 3: Ręczne utworzenie bucketu

Jeśli wolisz stworzyć bucket ręcznie w Dashboard:

1. Przejdź do **Storage** w Supabase Dashboard
2. Kliknij **New bucket**
3. Nazwa bucketu: `finance`
4. Zaznacz **Public bucket** (aby dokumenty były publicznie dostępne)
5. Kliknij **Create bucket**
6. Przejdź do **Policies** i dodaj następujące polityki dla bucketu `finance`:
   - **INSERT**: `Allow authenticated users to upload`
   - **SELECT**: `Allow authenticated users to view` oraz `Allow public access`
   - **DELETE**: `Allow authenticated users to delete`

## Weryfikacja

Po uruchomieniu migracji lub ręcznym utworzeniu bucketu, przetestuj:

1. Przejdź do modułu **Finanse** w aplikacji
2. Kliknij **Dodaj wydatek**
3. Spróbuj przesłać plik jako załącznik
4. Jeśli wszystko działa poprawnie, plik powinien się przesłać bez błędów

## Struktura przesyłanych plików

Pliki są przesyłane do folderu `expense_documents/` w buckecie `finance` z automatycznie wygenerowanymi nazwami w formacie:
```
{timestamp}_{random_string}.{extension}
```

Przykład: `1701234567890_a1b2c3d.pdf`
