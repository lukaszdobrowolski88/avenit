-- 100: Następca refresh tokenu (rotacja) — sesja w aplikacji mobilnej nie ginie, gdy telefon
-- uśpi aplikację w trakcie odświeżania (serwer już rotował token, a odpowiedź z nowym nie
-- dotarła / nie zapisała się). Przy ponownym użyciu starego tokenu serwer idzie łańcuchem
-- replaced_by_hash do najnowszego; jeśli ten NIGDY nie został użyty (klient go nie dostał),
-- wydaje nowy zamiast wylogowywać. Użyty następca = odrzucenie (ochrona przed powtórką).
-- W pełni idempotentne.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_hash TEXT;
