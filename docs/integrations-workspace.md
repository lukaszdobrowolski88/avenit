# Integracje Google Workspace i Microsoft 365

Plan trzech faz i to, co trzeba skonfigurować. Faza 1 (migracja tenanta 118) i Faza 2 (migracja 119) są zaimplementowane.

| Faza | Zakres | Połączenie | Status |
|------|--------|------------|--------|
| 1 | Połączenie kościoła + synchronizacja kont z katalogu | kościoła (`scope_kind='tenant'`) | **zrobione** |
| 2 | Dwukierunkowa synchronizacja kalendarza (wydarzenia ↔ Google Calendar / Outlook) | osoby (`scope_kind='user'`) + kalendarz kościoła | **zrobione** |
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

### Zasady synchronizacji katalogu

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

## Faza 2 — kalendarz Google / Outlook w obie strony

### Model

- **Kalendarz osobisty** (Mój profil → „Kalendarz Google / Outlook”, `CalendarSyncCard.jsx`): każda osoba łączy WŁASNE
  konto (połączenie `scope_kind='user'`, cel OAuth `calendar`). Avenit tworzy u niej osobny kalendarz
  **„Avenit — <nazwa kościoła>”** (nigdy kalendarz główny) i synchronizuje go w obie strony.
  - Google: zakres **`calendar.app.created`** (najwęższy — tylko kalendarze utworzone przez aplikację; bez wglądu
    w resztę kalendarzy osoby). Dowolne konto (także prywatny Gmail).
  - Microsoft: delegowane **`Calendars.ReadWrite offline_access`** (konto służbowe/szkolne; katalog z ustawień albo `organizations`).
  - Mobilka: tylko stan + przejście do Mój profil w przeglądarce (OAuth w apce — później).
- **Kalendarz kościoła** (Ustawienia → Integracje → karta dostawcy → „Kalendarz kościoła”, `manage_integrations`):
  - Microsoft: uprawnienie **aplikacji `Calendars.ReadWrite`** na połączeniu organizacji (client credentials), zapis do
    wskazanej skrzynki (zasób / skrzynka współdzielona / zwykła, np. `kalendarz@schwro.pl`) — osobny kalendarz „Avenit”
    albo główny kalendarz skrzynki. Kalendarze grup M365 — nieobsługiwane (wymagałyby `Group.ReadWrite.All`).
  - Google: kalendarz „Avenit — …” na koncie administratora, który go skonfigurował (jego połączenie osobiste z celem
    `church_calendar` = `calendar.app.created` + **`calendar.acls`**), udostępniany do odczytu domenie (`acl` typu `domain`).
    Wskazanie istniejącego kalendarza (nie utworzonego przez Avenit) wymagałoby szerszego zakresu — nieobsługiwane.
- **Tabele (tylko serwer)**: `calendar_sync_targets` (kalendarz docelowy: połączenie, rodzaj `user|church`, id kalendarza,
  kursor przyrostowy, preferencje, stan/błąd, „powiadomiono raz”, backoff, dzierżawa przebiegu), `calendar_sync_items`
  (stałe mapowanie wydarzenie ↔ id u dostawcy, etag/changeKey, skrót i pola ostatniego wysłania, `hidden`, `origin`),
  `calendar_sync_queue` (kolejka zapisów), `events.external_source/external_id` (import z kalendarza kościoła).
- **Kod**: `src/integrations/calendarLogic.js` (pola, ładunki Google/Graph, różnice — czysta logika),
  `calendarSelect.js` (które wydarzenia), `calendarApi.js` (adaptery fetch), `calendarSync.js` (przebieg),
  `calendarQueue.js` (kolejka bez zależności); fn `calendar-sync` (osoba + worker), akcje `calendar_*` w `workspace-integration`.

### Które wydarzenia

- Osobisty, tryb **„Tylko moje”** (domyślny; przełączniki): moje służby z grafiku (potwierdzone i oczekujące — tytuł
  z dopiskiem „(do potwierdzenia)”, status tentative; dopasowanie osoby jak w kanale iCal — `ownerServiceRows`),
  wydarzenia, na które się zapisałem, moja grupa domowa / służby (kanały służb z Komunikatora, `home_group_id`,
  wydarzenia z ograniczonym audytorium, do którego należę), moje spotkania online, wydarzenia, które organizuję.
  Tryb **„Wszystkie, które widzę”** — jak `/api/db` (moduł / zakres służby, kampus, segmenty widoczności).
  Służby i zapisy trafiają niezależnie od widoczności (zaproszenie skierowane wprost do osoby — jak iCal); reszta tylko
  z widocznych. Okno: 30 dni wstecz – 400 dni naprzód; starsze wpisy zostają w kalendarzu bez zmian.
- Kościoła: wyłącznie wydarzenia widoczne dla WSZYSTKICH (bez segmentów widoczności, bez kampusu), bez zarchiwizowanych,
  z filtrem modułów (`general` = ogólne) i typów. Zmiana widoczności → wydarzenie znika z kalendarza przy najbliższym przebiegu.
- Treść: tytuł, termin (Europe/Warsaw; całodniowe z końcem wyłącznym), miejsce (online — link do wydarzenia), opis +
  dopisek pod separatorem `— — —` (służba, „Spotkanie online: …”, „Zobacz w Avenit: …/wydarzenie/<id>”). Bez cykliczności
  (wydarzenia Avenit to pojedyncze terminy).

### Przebieg i harmonogram

- Wyzwalacze: każdy zapis `events` / `schedule_assignments` / `event_registrations` przez `/api/db` (hook w `routes.js`),
  `event-assignments-patch`, spotkania z Komunikatora (`meetings/service.js`), zmiana z kalendarza (inbound), import →
  `calendar_sync_queue`. Worker **co minutę** (`calendar-sync`): kolejka (debounce), usunięte z przeglądarki wydarzenia
  (siatka bezpieczeństwa: mapowania bez wydarzenia), **co ~5 min** zmiany od dostawcy, **pełne uzgodnienie co 24 h**
  (także po zmianie preferencji / „Synchronizuj teraz”). Limit 300 zapisów u dostawcy na kalendarz w przebiegu.
- Wysłanie: idempotentny upsert po `(kalendarz, wydarzenie)`; skrót treści pomija bez zmian. Google: identyfikator
  wydarzenia nadawany przez nas (`av<sha1>`) — ponowienie po awarii nie dubluje (409 → aktualizacja).
- Zmiany od dostawcy (Google `events.list` z `syncToken`, 410 → pełna lista od nowa; Graph
  `calendars/{id}/calendarView/delta` z `@odata.nextLink` → `@odata.deltaLink`, 410/400 → od nowa):
  - **pętla**: etag (Google) / changeKey (Graph) równy zapisanemu po naszym wysłaniu → pomijamy;
  - zmiana tytułu / terminu / miejsca / opisu (różnica względem `pushed_fields`): osoba, która może edytować wydarzenie
    w Avenit (`canEditEvent` — te same zasady co zapis przez `/api/db`, z zakresem służby i kampusem) → zapis do Avenit
    (+ realtime, uzgodnienie spotkania online, kolejka dla innych kalendarzy); kto nie może → przywrócenie wersji z Avenit
    i JEDNO powiadomienie (Powiadomienia + e-mail) „Zmiany wprowadzaj w Avenit”;
  - **konflikt**: last-writer-wins — zmiana w Avenit (kolejka albo `updated_at` po naszym wysłaniu) nowsza niż `updated`
    /`lastModifiedDateTime` u dostawcy → wygrywa Avenit; pola niemapowane zawsze z Avenit;
  - **usunięcie** w kalendarzu osobistym → „ukryj u mnie” (`hidden`, bez dalszej synchronizacji tego wydarzenia);
    w kalendarzu kościoła → odtworzenie (źródłem jest Avenit), a wydarzenie zaimportowane → archiwum w Avenit;
  - **nowe** wydarzenia w kalendarzu „Avenit” osoby → ignorowane (zostają nietknięte); w kalendarzu kościoła z opcją
    „Importuj nowe wydarzenia” (domyślnie wyłączona) → nowe wydarzenie Avenit w kalendarzu ogólnym (`module_key='general'`,
    widoczne dla wszystkich, `external_source`/`external_id`, autor = administrator, który skonfigurował kalendarz).
    Uwaga: w tym repo kalendarz ogólny to `general` (klucz `calendar` to moduł „Wydarzenia”).
- Błędy: 429/503 → `backoff_until` wg `Retry-After`; błąd tokenu / 401 / 403 → status `error` kalendarza (połączenie
  `error`/`revoked` z `getAccessToken`) i JEDEN e-mail do właściciela (zerowany po udanym przebiegu). Osoba usunęła cały
  kalendarz „Avenit” → przy pełnym uzgodnieniu tworzymy go od nowa (wyłączenie jest w Avenit: Wstrzymaj / Rozłącz).
- Webhooki (Google push channels / Graph subscriptions) — **nie** w tej wersji (odpytywanie co 5 min); dalsze usprawnienie:
  kanał `https://api.avenit.pl/api/integrations/calendar/webhook` + odnawianie subskrypcji przez workera.

## Co musi zrobić operator platformy

1. **Microsoft (Entra ID → App registrations → New registration)**: „Accounts in any organizational directory (multitenant)”.
   - Redirect URI (Web): `https://app.avenit.pl/api/integrations/oauth/microsoft/callback`.
   - API permissions: Microsoft Graph delegowane `openid`, `profile`, `email`, `User.Read`, **`offline_access`,
     `Calendars.ReadWrite`** (Faza 2 — kalendarze osób); **aplikacji** `User.Read.All` oraz **`Calendars.ReadWrite`**
     (Faza 2 — kalendarz kościoła; daje dostęp do wszystkich skrzynek organizacji — administrator kościoła może go
     zawęzić `New-ApplicationAccessPolicy` w Exchange Online do grupy ze skrzynką kalendarza).
   - Token configuration → Add groups claim → **Directory roles** (oświadczenie `wids` — bez niego działa fallback `/me/memberOf`).
   - Certificates & secrets → client secret; **Publisher verification** (MPN) zalecana — bez niej ekran zgody ostrzega „niezweryfikowany wydawca”.
   - `.env` na VPS: `MS_CLIENT_ID=…`, `MS_CLIENT_SECRET=…` → `docker compose up -d api worker`.
2. **Google (opcjonalnie, klient platformy)**: OAuth client „Web application”, redirect URI
   `https://app.avenit.pl/api/integrations/oauth/google/callback`; `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   Faza 2: włącz **Google Calendar API** i dodaj na ekranie zgody zakresy `calendar.app.created` i `calendar.acls`.
   Zob. „Weryfikacja Google” niżej — zalecany model to klient per kościół.
3. Migracja tenantów: `node packages/api/db/migrate.mjs tenants` (118 i 119 są idempotentne). Worker: `docker compose up -d worker`
   (nowe zadanie `calendar-sync` co minutę).

## Co musi zrobić administrator kościoła

- **Microsoft 365**: Ustawienia → Integracje → Microsoft 365 → Połącz → zaloguj się kontem Administratora globalnego →
  zatwierdź zgodę w imieniu organizacji → ustaw domeny/tryb → Podgląd zmian → Zastosuj. Cofnięcie: Entra → Enterprise applications → Avenit → Delete.
  - Kalendarz kościoła: po dodaniu uprawnienia aplikacji `Calendars.ReadWrite` → „Połącz ponownie” (nowa zgoda) →
    „Kalendarz kościoła” → adres skrzynki (np. zasób `kalendarz@schwro.pl`) → Włącz. Członkowie dodają ten kalendarz
    w Outlooku (Dodaj kalendarz → Z katalogu).
  - Kalendarze osób: każdy w Mój profil → Kalendarz Google / Outlook → Połącz (organizacja może wymagać zgody
    administratora na `Calendars.ReadWrite` — wtedy jednorazowo zatwierdź ją w Entra → Enterprise applications → Avenit → Permissions).
- **Google Workspace** (własny klient — zalecane):
  1. Google Cloud Console (projekt organizacji): włącz **Admin SDK API**.
  2. OAuth consent screen: **Internal** (bez weryfikacji Google, bez limitu 100 użytkowników).
  3. Credentials → OAuth client „Web application” → redirect URI `https://app.avenit.pl/api/integrations/oauth/google/callback`
     (kościół z własnym SSO Google: dodaj ten URI do istniejącego klienta SSO — zostanie użyty automatycznie).
  4. Avenit: Własna aplikacja OAuth → Client ID + sekret (o ile nie używa klienta SSO) → Połącz kontem superadministratora → Podgląd → Zastosuj.
  5. Kalendarz (Faza 2): w tym samym projekcie włącz **Google Calendar API**, na ekranie zgody dodaj zakresy
     `.../auth/calendar.app.created` i `.../auth/calendar.acls`. Kalendarz kościoła: Integracje → Google → „Połącz konto
     Google” → „Utwórz kalendarz kościoła” (udostępniany domenie do odczytu). Kalendarze osób: Mój profil → Połącz.

## Weryfikacja aplikacji i zakresy w kolejnych fazach

- **Google**: zakresy Admin SDK i kalendarza (także najwęższe `calendar.app.created`, `calendar.acls`) są „sensitive” — klient **External** wymaga weryfikacji;
  bez niej użytkownicy widzą ekran ostrzeżenia, a aplikacja ma limit 100 użytkowników. `drive.readonly`/`drive` są
  „restricted” → coroczny audyt **CASA**. Dlatego:
  - Faza 1–2: klient **Internal** per kościół (każdy kościół swój klient) albo weryfikacja klienta platformowego,
  - Faza 3: **Google Picker + `drive.file`** (dostęp tylko do plików wybranych przez osobę) — „non-sensitive”, bez CASA.
- **Microsoft**: Faza 2 — delegowane `offline_access Calendars.ReadWrite` (zgoda użytkownika; organizacje mogą wymagać
  zgody administratora), Faza 3 — File Picker v8 OneDrive/SharePoint z `Files.Read.All` delegowanym (albo `Files.ReadWrite`
  przy zapisie). Weryfikacja wydawcy zalecana od Fazy 1.
- Połączenia osób (`integration_connections.scope_kind='user'`, `user_id`) — używane od Fazy 2 (kalendarz); zakresy
  sumują się przy kolejnych zgodach (Google `include_granted_scopes`), Microsoft odświeża token z zakresami połączenia.

## Ryzyka
- Graph: przyrost dla kalendarza innego niż główny używa `calendars/{id}/calendarView/delta` (v1.0 dokumentuje delta dla
  widoku kalendarza; gdyby dostawca zwracał błąd dla kalendarza pomocniczego, tryb „Główny kalendarz skrzynki” w kalendarzu
  kościoła działa na tej samej ścieżce — do weryfikacji na żywym koncie przed szerokim udostępnieniem).
- Zmiana opisu z Google/Outlook zapisuje `events.description` (tekst) — wydarzenie z „Szczegółami” (HTML, `details_html`)
  pokaże od tego momentu nowy opis tekstowy.

- Zgoda administratora Microsoft propaguje się z opóźnieniem (status „consent_pending” → spróbuj „Synchronizuj teraz” za kilka minut).
- Konta bez hasła wymagają włączonego SSO dostawcy albo zaproszeń e-mail (karta ostrzega).
- Klient SSO Google użyty ponownie potrzebuje DRUGIEGO redirect URI (integracje mają inną ścieżkę niż logowanie).
- `SSO_*` env nie są przekazywane w `docker-compose.yml` (tylko nowe `MS_*`/`GOOGLE_*`) — SSO platformowe dalej wymaga ich dopisania.
