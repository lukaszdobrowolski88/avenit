# 🚀 Avenit — wdrożenie na własnym VPS (Hostinger)

Zastępuje Vercel + Supabase. Cały stack (baza, API, worker, reverse proxy, statyczne SPA) działa w Dockerze na Twoim serwerze.

## Architektura

```
VPS (Docker Compose)
├── caddy      — TLS (wildcard *.domena.pl), reverse proxy, serwuje web + panel
│   ├── {kościół}.domena.pl → aplikacja web
│   ├── admin.domena.pl     → panel administracyjny
│   └── api.domena.pl       → API (dla aplikacji mobilnej)
├── api        — Node.js/Fastify: auth, dane, storage, funkcje, realtime (WS)
├── worker     — zadania cykliczne (kampanie push/SMS, windykacja, sync poczty)
└── postgres   — avenit_platform + avenit_tenant_<slug> (baza per kościół)
```

## Wymagania

- VPS Hostinger **KVM2** (2 vCPU / 8 GB) lub większy; Docker + Docker Compose.
- Domena z DNS w Cloudflare (dla wildcard TLS). Rekordy:
  - `A  @         → <IP VPS>`
  - `A  *         → <IP VPS>`  (wildcard — wszystkie subdomeny kościołów)
  - `A  admin     → <IP VPS>`
  - `A  api       → <IP VPS>`
- Token API Cloudflare (Zone → DNS → Edit) do certyfikatu wildcard.

## Krok 1 — Przygotowanie serwera

```bash
# na VPS
curl -fsSL https://get.docker.com | sh
git clone <twoje-repo> avenit && cd avenit
cp deploy/.env.production.example .env
nano .env   # uzupełnij WSZYSTKIE sekrety (patrz komentarze w pliku)
```

Wygeneruj sekrety:
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # MAIL_ENCRYPTION_SECRET
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

## Krok 2 — Deploy

```bash
./deploy.sh
```

Skrypt: buduje obrazy → buduje frontendy → startuje Postgres → migruje schemat platform → startuje wszystko. Caddy automatycznie pobierze certyfikat wildcard.

## Krok 3 — Pierwszy administrator platformy

```bash
docker compose exec api node -e "
import('./src/db.js').then(async ({platformPool})=>{
  const {hashPassword}=await import('./src/auth/passwords.js');
  await platformPool.query(
    'INSERT INTO platform_admins (email, full_name, password_hash) VALUES (\$1,\$2,\$3) ON CONFLICT (email) DO NOTHING',
    ['admin@avenit.pl','Administrator', await hashPassword('ZMIEN_TO_HASLO')]
  );
  console.log('Admin utworzony'); process.exit(0);
});"
```

Zaloguj się na `https://admin.avenit.pl`. **Od razu włącz 2FA** w Ustawieniach.

## Krok 4 — Utwórz pierwszy kościół (tenant)

W panelu: **Tenanci → + Nowy tenant**. Podaj nazwę, subdomenę (np. `schwro`), e-mail i hasło administratora kościoła. System utworzy bazę `avenit_tenant_schwro`, załaduje schemat, założy konto admina. Kościół działa natychmiast na `https://schwro.avenit.pl`.

## Krok 5 — Migracja istniejącego kościoła z Supabase

Patrz **[deploy/MIGRACJA_SUPABASE.md](deploy/MIGRACJA_SUPABASE.md)** — runbook przeniesienia produkcji „schwro" (dane + pliki + hasła użytkowników).

## Aktualizacje

```bash
git pull && ./deploy.sh
```

## Backup

```bash
# ręcznie
./deploy/backup.sh
# automatycznie (cron hosta) — codziennie 3:00
echo "0 3 * * * $(pwd)/deploy/backup.sh >> $(pwd)/backups/backup.log 2>&1" | crontab -
```

## Aplikacja mobilna (Expo)

W `packages/mobile` ustaw `EXPO_PUBLIC_API_URL=https://api.avenit.pl` oraz `EXPO_PUBLIC_TENANT=<slug kościoła>` (lub buduj osobny build per kościół), a następnie `eas build` / `eas update`.

## WordPress (formularze)

Plugin `wordpress-plugin/avenit-forms` — w ustawieniach pluginu podaj `https://<kościół>.avenit.pl`. Shortcode: `[avenit_form id="..."]` (stary `[church_form]` nadal działa).

## Diagnostyka

```bash
docker compose logs -f api        # logi API
docker compose logs -f worker     # logi zadań cyklicznych
docker compose logs -f caddy      # logi TLS/proxy
docker compose ps                 # status usług
```

Typowe problemy:
- **Brak certyfikatu wildcard** → sprawdź `CLOUDFLARE_API_TOKEN` i rekord DNS `*`.
- **502 na subdomenie** → API nie wstało; `docker compose logs api`.
- **„Nieznany tenant"** → brak wpisu w tabeli `tenants` lub zła subdomena.
