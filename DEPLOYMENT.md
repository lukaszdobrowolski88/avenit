# Deployment

> **Uwaga:** Avenit nie używa już Supabase ani Vercela. Cały backend i hosting działają na własnym VPS w Dockerze.
>
> Pełna instrukcja wdrożenia: **[DEPLOY_VPS.md](./DEPLOY_VPS.md)**
> Migracja istniejącego kościoła z Supabase: **[deploy/MIGRACJA_SUPABASE.md](./deploy/MIGRACJA_SUPABASE.md)**

## Skrót

```bash
# na VPS, w katalogu repozytorium
cp deploy/.env.production.example .env   # uzupełnij sekrety
./deploy/deploy.sh                        # build + migracja + start
```

Usługi (Docker Compose): `postgres`, `api`, `worker`, `caddy`. Panel administracyjny platformy: `https://admin.<twoja-domena>`. Każdy kościół (tenant) na własnej subdomenie `https://<slug>.<twoja-domena>`.

Dawne funkcje Edge (SendGrid, Resend, SMSAPI, Web/Expo Push, Przelewy24, iCal, IMAP/SMTP) zostały przeniesione do backendu `packages/api` jako trasy `/api/fn/*` oraz zadania cykliczne workera. Zmienne środowiskowe tych usług konfigurujesz w pliku `.env` (patrz `deploy/.env.production.example`).
