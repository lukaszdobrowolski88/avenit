# Konfiguracja Supabase Storage dla programów

## Utworzenie bucketa 'programs'

1. Przejdź do Supabase Dashboard: https://app.supabase.com
2. Wybierz swój projekt
3. W menu bocznym wybierz **Storage**
4. Kliknij **New bucket**
5. Skonfiguruj bucket:
   - **Name**: `programs`
   - **Public bucket**: ✅ **Zaznacz** (aby pliki były dostępne publicznie)
   - **Allowed MIME types**: `application/pdf`
   - **File size limit**: `10MB` (lub więcej jeśli potrzebujesz)

6. Kliknij **Create bucket**

## Polityki dostępu (RLS Policies)

Jeśli bucket jest publiczny, pliki są dostępne do odczytu bez autoryzacji. Jeśli chcesz dodatkową kontrolę, możesz ustawić następujące polityki:

### Polityka upload (zapis)
```sql
-- Pozwól authenticated users na upload plików
CREATE POLICY "Authenticated users can upload programs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'programs');
```

### Polityka update (aktualizacja)
```sql
-- Pozwól authenticated users na update plików
CREATE POLICY "Authenticated users can update programs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'programs');
```

### Polityka read (odczyt) - PUBLICZNY
```sql
-- Pozwól wszystkim na odczyt plików (jeśli bucket nie jest publiczny)
CREATE POLICY "Public read access for programs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'programs');
```

### Polityka delete (usuwanie)
```sql
-- Pozwól authenticated users na usuwanie plików
CREATE POLICY "Authenticated users can delete programs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'programs');
```

## Struktura folderów

Aplikacja organizuje pliki w następujący sposób:
```
programs/
├── {program_id}/
│   └── Program-{YYYY-MM-DD}.pdf
```

Przykład:
```
programs/
├── 123/
│   └── Program-2024-12-07.pdf
├── 124/
│   └── Program-2024-12-14.pdf
```

## Testowanie

Aby przetestować czy bucket działa poprawnie:

1. Wygeneruj program w aplikacji
2. Kliknij przycisk **PDF** - plik powinien zostać zapisany lokalnie i w Supabase Storage
3. Sprawdź w Supabase Dashboard → Storage → programs czy plik się pojawił
4. Kliknij **Mail** - email powinien zawierać załącznik PDF pobrany z Storage
