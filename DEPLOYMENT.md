# 🚀 Deployment Edge Function - Instrukcja

## ✅ Supabase CLI jest już zainstalowane!

Lokalizacja: `~/.local/bin/supabase`

## Krok 1: Zaloguj się do Supabase

Otwórz terminal i wykonaj:

```bash
~/.local/bin/supabase login
```

Zostanie otwarta przeglądarka, gdzie zaloguje się do Supabase. Zaakceptuj autoryzację CLI.

**Alternatywnie** (jeśli przeglądarka się nie otworzy):

1. Przejdź do: https://app.supabase.com/account/tokens
2. Wygeneruj nowy Access Token
3. Skopiuj token i użyj:

```bash
~/.local/bin/supabase login --token YOUR_ACCESS_TOKEN
```

## Krok 2: Sprawdź ID swojego projektu

1. Przejdź do: https://app.supabase.com
2. Wybierz swój projekt
3. W URL zobaczysz coś w stylu: `https://app.supabase.com/project/ABC123XYZ`
4. Skopiuj ten ID projektu (np. `ABC123XYZ`)

## Krok 3: Połącz CLI z projektem

W terminalu, w katalogu projektu:

```bash
cd /Users/lukaszdobrowolski/church-manager
~/.local/bin/supabase link --project-ref YOUR_PROJECT_ID
```

Zastąp `YOUR_PROJECT_ID` swoim rzeczywistym ID projektu.

## Krok 4: Ustaw zmienne środowiskowe

Ustaw klucz API Resend:

```bash
~/.local/bin/supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Zastąp `re_xxx...` swoim rzeczywistym kluczem API z https://resend.com/api-keys

**Uwaga:** `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są automatycznie dostępne w Edge Functions - nie musisz ich ustawiać.

## Krok 5: Deploy Edge Function

```bash
~/.local/bin/supabase functions deploy send-program-email
```

Poczekaj na zakończenie procesu. Powinieneś zobaczyć komunikat:

```
Deployed Function send-program-email on project YOUR_PROJECT_ID
✓ Deployed Function send-program-email
```

## Krok 6: Sprawdź logi (opcjonalnie)

Możesz sprawdzić czy funkcja działa:

```bash
~/.local/bin/supabase functions logs send-program-email
```

## Krok 7: Testowanie

1. Wejdź do aplikacji
2. Otwórz program
3. Kliknij przycisk **PDF** - wygeneruj PDF
4. Kliknij przycisk **Mail** - wyślij email
5. Sprawdź skrzynkę email czy załącznik PDF dotarł

## Troubleshooting

### Problem: Brak bucket 'programs'

Jeśli zobaczysz błąd "bucket 'programs' does not exist":

1. Przejdź do Supabase Dashboard → Storage
2. Kliknij "New bucket"
3. Nazwa: `programs`
4. Public bucket: ✅ (zaznacz)
5. Kliknij "Create bucket"

Zobacz więcej: [STORAGE_SETUP.md](./supabase/STORAGE_SETUP.md)

### Problem: Błąd autoryzacji

Jeśli funkcja zwraca błąd 401:
- Sprawdź czy `SUPABASE_SERVICE_ROLE_KEY` jest automatycznie dostępna
- Sprawdź polityki RLS na buckecie 'programs'

### Problem: Email bez załącznika

Jeśli email przychodzi bez PDF:
1. Sprawdź logi: `~/.local/bin/supabase functions logs send-program-email`
2. Sprawdź czy plik PDF istnieje w Storage (Dashboard → Storage → programs)
3. Sprawdź czy `filePath` jest poprawny w logach

### Problem: Brak logów

Jeśli nie widzisz logów console.log:
- Logi pojawiają się w Supabase Dashboard → Edge Functions → send-program-email → Logs
- Logi w CLI mogą być opóźnione o kilka sekund

## Dodatkowe komendy

### Podgląd lokalny (development)

```bash
~/.local/bin/supabase functions serve send-program-email --env-file supabase/functions/.env
```

### Usunięcie funkcji

```bash
~/.local/bin/supabase functions delete send-program-email
```

### Lista wszystkich funkcji

```bash
~/.local/bin/supabase functions list
```

## Szybki alias (opcjonalnie)

Aby nie pisać za każdym razem pełnej ścieżki, dodaj alias do `~/.zshrc`:

```bash
echo 'alias supabase="~/.local/bin/supabase"' >> ~/.zshrc
source ~/.zshrc
```

Potem możesz używać po prostu:

```bash
supabase functions deploy send-program-email
```

---

## 🎉 Gotowe!

Po wykonaniu tych kroków funkcja Edge Function będzie działać i wysyłać emaile z załącznikami PDF!
