# Supabase Edge Functions

## Dostępne funkcje

1. **send-program-email** - Wysyłanie programów nabożeństwa przez email

---

## Wysyłanie programów przez email

### Konfiguracja

1. Zainstaluj Supabase CLI:
```bash
npm install -g supabase
```

2. Zaloguj się do Supabase:
```bash
supabase login
```

3. Połącz projekt z lokalnym katalogiem:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

4. Ustaw zmienne środowiskowe:
```bash
# Resend API Key
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase URL i Service Role Key (automatycznie dostępne w Edge Functions)
# SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są automatycznie dodawane
```

### Deployment

Deploy funkcji `send-program-email`:
```bash
supabase functions deploy send-program-email
```

### Testowanie lokalnie

1. Uruchom funkcję lokalnie:
```bash
supabase functions serve send-program-email --env-file supabase/functions/.env
```

2. Testuj z curl:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-program-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"emailTo":["test@example.com"],"subject":"Test","htmlBody":"<p>Test</p>","pdfUrl":"https://example.com/test.pdf","filename":"test.pdf"}'
```

### Parametry funkcji

- `emailTo` (array) - Lista adresów email odbiorców
- `subject` (string) - Temat wiadomości
- `htmlBody` (string) - Treść HTML wiadomości
- `filePath` (string, **zalecany**) - Ścieżka do PDF w Supabase Storage (np. "123/Program-2024-01-15.pdf")
- `pdfUrl` (string, opcjonalny) - URL do PDF (fallback gdy nie ma filePath)
- `filename` (string, opcjonalny) - Nazwa pliku PDF (domyślnie: "program.pdf")

**Uwaga:** Zalecane jest użycie `filePath` zamiast `pdfUrl`, ponieważ Edge Function pobiera plik bezpośrednio z Supabase Storage używając Service Role Key, co zapewnia lepszą wydajność i bezpieczeństwo.
