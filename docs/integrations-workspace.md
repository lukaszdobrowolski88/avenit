# Integracje Google Workspace i Microsoft 365

Plan trzech faz i to, co trzeba skonfigurować. Faza 1 jest zaimplementowana (migracja tenanta 118).

| Faza | Zakres | Połączenie | Status |
|------|--------|------------|--------|
| 1 | Połączenie kościoła + synchronizacja kont z katalogu | kościoła (`scope_kind='tenant'`) | **zrobione** |
| 2 | Dwukierunkowa synchronizacja kalendarza (wydarzenia ↔ Google Calendar / Outlook) | osoby (`scope_kind='user'`) + opcjonalnie kalendarz zasobu kościoła | schemat gotowy |
| 3 | Wybór plików (Google Drive / OneDrive / SharePoint) w materiałach, zadaniach, Komunikatorze | osoby | schemat gotowy |

## Architektura (Faza 1)

- **Jeden URI przekierowania** dla wszystkich kościołów, jak SSO: `https://app.<APP_DOMAIN>/api/integrations/oauth/<google|microsoft>/callback`
  (produkcja: `https://app.avenit.pl/api/integrations/oauth/google/callback`, `.../microsoft/callback`).
  Tenant i id jednorazowego stanu są w podpisanym (HMAC) `state`; PKCE (S256); ciasteczko `avenit_intg` z nonce
  na `.avenit.pl` wiąże callback z przeglądarką, która zaczęła łączenie.
- **Tabele (tylko serwer, nie ma ich w `/api/db`)**: `integration_connections` (tokeny szyfrowane `lib/mailcrypto.js`),
  `integration_oauth_states`, `workspace_integration_settings` (własna aplikacja OAuth + ustawienia katalogu),
  `directory_links` (konto Avenit ↔ id w katalogu), `directory_sync_runs` (historia).
- **Kod**: `packages/api/src/integrations/` — `providers.js` (zakresy, poświadczenia), `tokens.js` (`getAccessToken`:
  odświeżanie, zapis, status `error`/`revoked`), `oauth.js` (start/callback), `directory.js` (pobranie, plan, zastosowanie),
  `access.js` (uprawnienia), `routes.js` (callback). Funkcje: `fn/workspace-integration.js`, `fn/directory-sync.js`
  (worker co 6 h: `17 */6 * * *`). Web: Ustawienia → Integracje → `WorkspaceIntegrations.jsx`.
- **Poświadczenia aplikacji OAuth** (kolejność): własna kościoła (karta „Własna aplikacja OAuth”, tylko administrator)
  → klient SSO kościoła (`sso_<provider>_client_id` + sekret — bez drugiego klienta) → env `MS_CLIENT_ID/SECRET`,
  `GOOGLE_CLIENT_ID/SECRET` → env `SSO_*`.

### Google

- OAuth z `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` → refresh token.
- Zakresy Fazy 1: `openid email profile`, `https://www.googleapis.com/auth/admin.directory.user.readonly`,
  `https://www.googleapis.com/auth/admin.directory.group.readonly` (grupy tylko listowane — pod przyszłe mapowanie na służby).
- Wymagane konto Workspace (`hd` w id_token) z rolą administratora (próba `users.list` przy łączeniu).
- Katalog: `GET admin.googleapis.com/admin/directory/v1/users?customer=my_customer` (paginacja `nextPageToken`);
  pomijane `suspended`, `archived`.

### Microsoft

- Aplikacja **wielodostępna** platformy (env `MS_*`), dwa kroki:
  1. logowanie administratora (delegowane `openid profile email User.Read`, PKCE, katalog `organizations`) → `tid`
     i rola: **Administrator globalny** albo **Administrator ról uprzywilejowanych** (oświadczenie `wids` albo `/me/memberOf`);
  2. zgoda administratora `https://login.microsoftonline.com/<tid>/v2.0/adminconsent` dla **tego samego** `tid`
     (parametry powrotu zgody nie są podpisane — dlatego krok 1), potem token client credentials z rolą `User.Read.All`.
- Katalog: `GET graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,userType,proxyAddresses`
  (paginacja `@odata.nextLink`, tylko adresy Graph). Bez refresh tokenu — token aplikacji per katalog kościoła.
- Pomijane: `accountEnabled=false` (skrzynki współdzielone, sale, zasoby, wyłączeni), `userType=Guest`/`#EXT#`, brak `mail`.

### Zasady synchronizacji

- Podgląd (X nowych / Y istniejących do powiązania / Z do zablokowania) przed pierwszym zastosowaniem; automat co 6 h dopiero po nim.
- Dopasowanie po e-mailu bez wielkości liter, także aliasy (Google `aliases`/`emails`, Microsoft `proxyAddresses smtp:` i UPN).
- Nowe konta tylko z dozwolonych domen (ustawienie → `sso_allowed_domains` → domena połączonego konta), rola domyślna
  `czlonek` (nigdy rola administracyjna), tryb **kolejka zatwierdzeń** (domyślnie) albo **aktywne**; bez hasła — logowanie
  przez SSO dostawcy (karta ostrzega, gdy SSO wyłączone) albo zaproszenie e-mail „ustaw hasło”.
- Role istniejących kont nigdy się nie zmieniają. Blokada przy wyłączeniu/usunięciu w katalogu tylko z ustawieniem
  „Zablokuj konto w Avenit”, tylko dla kont powiązanych, nigdy administratorów/superadministratorów. Pusty katalog lub
  błąd API = przerwanie bez zmian; automat pomija hurtowe blokady (> max(5, 30%)).
- Uprawnienia: konfiguracja i podgląd — `action:settings:manage_integrations`; zastosowanie i włączenie automatu —
  dodatkowo `action:settings:manage_users`; własna aplikacja OAuth — tylko administrator. Wpisy w historii konta
  (`account_events`, aktor `directory:<provider>`).

## Co musi zrobić operator platformy

1. **Microsoft (Entra ID → App registrations → New registration)**: „Accounts in any organizational directory (multitenant)”.
   - Redirect URI (Web): `https://app.avenit.pl/api/integrations/oauth/microsoft/callback`.
   - API permissions: Microsoft Graph delegowane `openid`, `profile`, `email`, `User.Read`; **aplikacji** `User.Read.All`.
   - Token configuration → Add groups claim → **Directory roles** (oświadczenie `wids` — bez niego działa fallback `/me/memberOf`).
   - Certificates & secrets → client secret; **Publisher verification** (MPN) zalecana — bez niej ekran zgody ostrzega „niezweryfikowany wydawca”.
   - `.env` na VPS: `MS_CLIENT_ID=…`, `MS_CLIENT_SECRET=…` → `docker compose up -d api worker`.
2. **Google (opcjonalnie, klient platformy)**: OAuth client „Web application”, redirect URI
   `https://app.avenit.pl/api/integrations/oauth/google/callback`; `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   Zob. „Weryfikacja Google” niżej — zalecany model to klient per kościół.
3. Migracja tenantów: `node packages/api/db/migrate.mjs tenants` (118 jest idempotentna).

## Co musi zrobić administrator kościoła

- **Microsoft 365**: Ustawienia → Integracje → Microsoft 365 → Połącz → zaloguj się kontem Administratora globalnego →
  zatwierdź zgodę w imieniu organizacji → ustaw domeny/tryb → Podgląd zmian → Zastosuj. Cofnięcie: Entra → Enterprise applications → Avenit → Delete.
- **Google Workspace** (własny klient — zalecane):
  1. Google Cloud Console (projekt organizacji): włącz **Admin SDK API**.
  2. OAuth consent screen: **Internal** (bez weryfikacji Google, bez limitu 100 użytkowników).
  3. Credentials → OAuth client „Web application” → redirect URI `https://app.avenit.pl/api/integrations/oauth/google/callback`
     (kościół z własnym SSO Google: dodaj ten URI do istniejącego klienta SSO — zostanie użyty automatycznie).
  4. Avenit: Własna aplikacja OAuth → Client ID + sekret (o ile nie używa klienta SSO) → Połącz kontem superadministratora → Podgląd → Zastosuj.

## Weryfikacja aplikacji i zakresy w kolejnych fazach

- **Google**: zakresy Admin SDK, Calendar (`calendar.events`) są „sensitive” — klient **External** wymaga weryfikacji;
  bez niej użytkownicy widzą ekran ostrzeżenia, a aplikacja ma limit 100 użytkowników. `drive.readonly`/`drive` są
  „restricted” → coroczny audyt **CASA**. Dlatego:
  - Faza 1–2: klient **Internal** per kościół (każdy kościół swój klient) albo weryfikacja klienta platformowego,
  - Faza 3: **Google Picker + `drive.file`** (dostęp tylko do plików wybranych przez osobę) — „non-sensitive”, bez CASA.
- **Microsoft**: Faza 2 — delegowane `offline_access Calendars.ReadWrite` (zgoda użytkownika; organizacje mogą wymagać
  zgody administratora), Faza 3 — File Picker v8 OneDrive/SharePoint z `Files.Read.All` delegowanym (albo `Files.ReadWrite`
  przy zapisie). Weryfikacja wydawcy zalecana od Fazy 1.
- Połączenia osób (`integration_connections.scope_kind='user'`, `user_id`) i `getAccessToken` z refresh tokenem są już
  gotowe; brakuje UI (Moje konto → Połączone konta), fn i logiki kalendarza/plików.

## Ryzyka

- Zgoda administratora Microsoft propaguje się z opóźnieniem (status „consent_pending” → spróbuj „Synchronizuj teraz” za kilka minut).
- Konta bez hasła wymagają włączonego SSO dostawcy albo zaproszeń e-mail (karta ostrzega).
- Klient SSO Google użyty ponownie potrzebuje DRUGIEGO redirect URI (integracje mają inną ścieżkę niż logowanie).
- `SSO_*` env nie są przekazywane w `docker-compose.yml` (tylko nowe `MS_*`/`GOOGLE_*`) — SSO platformowe dalej wymaga ich dopisania.
