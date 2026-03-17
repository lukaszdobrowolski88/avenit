# Szablony Email dla Supabase

## Jak dodać szablony do Supabase

1. Zaloguj się do panelu Supabase: https://supabase.com/dashboard
2. Wybierz swój projekt
3. Idź do **Authentication → Email Templates**
4. Wybierz szablon do edycji i wklej zawartość

## Dostępne szablony

### 1. Reset password (`reset-password.html`) - GŁÓWNY SZABLON
Używany przy:
- Tworzeniu nowego użytkownika przez admina
- Resecie hasła ("Nie pamiętam hasła")

**Gdzie wkleić:** Authentication → Email Templates → **Reset password**

### 2. Confirm signup (`confirm-signup.html`)
Szablon potwierdzenia rejestracji (opcjonalny).

**Gdzie wkleić:** Authentication → Email Templates → **Confirm signup**

### Dostępne zmienne w szablonach

| Zmienna | Opis |
|---------|------|
| `{{ .Email }}` | Email użytkownika |
| `{{ .ConfirmationURL }}` | Link do potwierdzenia |
| `{{ .Data.full_name }}` | Imię i nazwisko (jeśli przekazane) |
| `{{ .Token }}` | Token potwierdzenia |
| `{{ .TokenHash }}` | Hash tokena |
| `{{ .SiteURL }}` | URL aplikacji |

## Podgląd szablonu

Otwórz plik `confirm-signup.html` w przeglądarce, aby zobaczyć podgląd.
