# Migracje bazy danych

## Jak uruchomić migracje w Supabase

1. Zaloguj się do panelu Supabase: https://supabase.com/dashboard
2. Wybierz swój projekt
3. Przejdź do zakładki **SQL Editor**
4. Skopiuj zawartość pliku `add_auth_user_id.sql`
5. Wklej do edytora SQL i kliknij **Run**

## Co robi migracja `add_auth_user_id.sql`

1. **Dodaje kolumnę `auth_user_id`** do tabeli `app_users` - łączy użytkowników aplikacji z kontami autentykacji Supabase
2. **Tworzy indeks** dla lepszej wydajności wyszukiwania
3. **Automatycznie tworzy superadmina** (lukasz@schwro.pl) jeśli nie istnieje
4. **Tworzy trigger** - automatycznie dodaje nowych użytkowników do `app_users` po rejestracji w systemie auth

## Superadmin

- **Email**: lukasz@schwro.pl
- **Rola**: superadmin
- **Uprawnienia**: Pełny dostęp do wszystkich modułów i zakładek
- **Ochrona**: Nie można usunąć ani zablokować tego konta

## Pierwsze logowanie superadmina

1. Uruchom migrację SQL (powyżej)
2. Utwórz hasło dla superadmina w panelu Supabase:
   - Przejdź do **Authentication** > **Users**
   - Znajdź lub dodaj użytkownika `lukasz@schwro.pl`
   - Ustaw hasło (lub użyj opcji "Send Magic Link")
3. Zaloguj się w aplikacji używając tego emaila i hasła

## Dodawanie nowych użytkowników

Teraz użytkownicy dodani przez panel administracyjny w aplikacji:
- Otrzymają automatycznie konto w Supabase Authentication
- Będą mogli się zalogować używając podanego emaila i hasła
- Ich uprawnienia będą zarządzane przez system ról i indywidualnych uprawnień

##WAŻNE

⚠️ **Przed uruchomieniem migracji upewnij się, że masz backup bazy danych!**

Aby utworzyć backup w Supabase:
1. Przejdź do **Database** > **Backups**
2. Kliknij **Create backup**
