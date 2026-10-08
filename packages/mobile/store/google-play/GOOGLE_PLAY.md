# Publikacja w Google Play — Avenit (Android)

Odpowiednik [`APP_STORE.md`](../../APP_STORE.md) dla `pl.avenit.app`. Teksty sklepu: [`listing.json`](listing.json),
grafiki: [`graphics.py`](graphics.py) → `out/` (poza gitem). EAS Metadata nie obsługuje Google Play, więc wszystko
poniżej wpisuje się w Play Console (albo przez Google Play Developer API, gdy będzie klucz konta usługi).

## 1. Blokery techniczne — przed pierwszym buildem

| Co | Stan | Do zrobienia |
|---|---|---|
| **targetSdk 36** (wymóg Play od 31.08.2026 dla nowych apek i aktualizacji) | ✅ `app.config.ts` → `expo-build-properties`: compileSdk/targetSdk 36, build-tools 36.0.0 | Sprawdzić na telefonie z Androidem 15/16 (pkt 1a) |
| **`google-services.json` z pakietem `pl.avenit.app`** | ❌ plik ma tylko `pl.avenit.app.preview` — build produkcyjny się nie złoży | Firebase → projekt **avenit-app** → Dodaj aplikację Android → pakiet `pl.avenit.app` → pobierz nowy `google-services.json` (zawiera oba pakiety) i podmień w `packages/mobile` |
| **Klucz FCM V1 w EAS dla `pl.avenit.app`** | ❌ jest tylko dla `.preview` | `eas credentials -p android` → production → Google Service Account → FCM V1 → użyj istniejącego klucza `firebase-adminsdk-fbsvc@avenit-app` (ten sam projekt Firebase) |
| Keystore produkcyjny | ✅ w EAS (z sierpnia 2026) | — |

### 1a. Android 16 — co sprawdzić na telefonie
Przy targetSdk 35+ Android rysuje apkę pod paskiem statusu i nawigacji (edge-to-edge, od API 36 bez wyjątku).
Nagłówki (`insets.top`) i pasek zakładek (`insets.bottom`) są na to gotowe. **Ryzyko: klawiatura** —
okno nie zmniejsza się już samo, a `KeyboardAvoidingView` działa u nas tylko na iOS (14 miejsc). Sprawdź:
logowanie, pole wiadomości w Komunikatorze, nowa prośba modlitewna — czy klawiatura nie zasłania pola.
Jeśli zasłania: `behavior="padding"` także na Androidzie w tych 14 miejscach.

## 2. Konto Google Play Console

- Konto **osobiste założone po 13.11.2023** → zanim włączysz produkcję, potrzebny jest **test zamknięty z min.
  12 testerami przez 14 dni bez przerwy** (spadek poniżej 12 zeruje licznik). Konto **organizacji** jest z tego zwolnione
  (wymaga D-U-N-S). Zaplanuj to od razu — to najdłuższy etap.
- Weryfikacja tożsamości i (dla kont osobistych) adresu/telefonu w Play Console.

## 3. Kolejność kroków

1. **Play Console → Utwórz aplikację**: nazwa *Avenit Church Manager*, język domyślny **polski (pl-PL)**, aplikacja
   (nie gra), **bezpłatna**, akceptacja zasad.
2. **Firebase + FCM** (tabela w pkt 1).
3. **Build AAB**: z `packages/mobile`: `EAS_PROJECT_ID=5e740a70-96bb-4fbc-a00f-ecf4bea0b9df eas build -p android --profile production`.
4. **Pierwszy upload ręcznie** (API Google tego nie pozwala): Testowanie → **Testy wewnętrzne** → Utwórz wersję →
   wgraj `.aab` z EAS. Play App Signing włączy się sam.
5. **Karta sklepu** (§4) i **Zawartość aplikacji** (§5).
6. **Test zamknięty** (12 testerów × 14 dni, jeśli konto osobiste) → wniosek o dostęp do produkcji → **Produkcja**.
7. Kolejne wersje: `eas submit -p android --profile production` — wymaga klucza konta usługi
   (`google-play-service-account.json`, ścieżka już jest w `eas.json`; NIGDY do repo): Google Cloud → konto usługi
   z kluczem JSON → Play Console → Użytkownicy i uprawnienia → zaproś e-mail konta usługi z uprawnieniami do wydań.

## 4. Karta sklepu (Rozwój → Karta sklepu)

| Pole | Wartość |
|---|---|
| Nazwa (30) | `Avenit Church Manager` |
| Krótki opis (80) | z `listing.json` (PL 74 zn., EN 78 zn.) |
| Pełny opis (4000) | z `listing.json` (PL 2127 zn., EN 2218 zn.) |
| Ikona 512×512 | `out/icon-512.png` |
| Grafika promocyjna 1024×500 | `out/pl/feature-graphic.png` (EN: `out/en-US/…`) |
| Zrzuty telefonu (2–8, 9:16) | `out/pl/phone-01…07.png` (EN: `out/en-US/…`) |
| Kategoria | **Produktywność** (tagi: kościół, wolontariat, wydarzenia) |
| E-mail kontaktowy | `lukasz@avenit.pl` |
| Strona www | `https://avenit.pl` |
| Telefon (opcjonalnie) | `+48 607 693 996` |
| Polityka prywatności | `https://avenit.pl/polityka-prywatnosci/` |

Tłumaczenie EN: Karta sklepu → Zarządzaj tłumaczeniami → angielski (USA) → teksty i grafiki z `en-US`.
Zrzuty: pasek statusu jest androidowy (bez wycięcia iPhone'a) — wygenerowane z tych samych zrzutów kościoła demo.

## 5. Zawartość aplikacji (Polityka → Zawartość aplikacji)

**Dostęp do aplikacji** → *Całość lub część funkcji jest ograniczona* → dodaj instrukcję:
- nazwa: `Konto demo`, login `recenzja@demo.avenit.pl`, hasło jak w App Store (kościół demo, bez 2FA),
- uwagi: *Church management app; interface in Polish. On first launch accept the Community Guidelines
  („Akceptuję zasady”). Accounts are created by church administrators — no sign-up in the app.*

**Reklamy** → Nie, aplikacja nie zawiera reklam.

**Ocena treści (IARC)** → kategoria *Komunikacja / społecznościowe*: przemoc, seks, wulgaryzmy, substancje,
hazard — **Nie**; użytkownicy mogą się komunikować i wymieniać treści — **Tak**; udostępnianie lokalizacji
innym — **Nie**; zakupy cyfrowe — **Nie**; nieograniczony dostęp do internetu — **Nie**. Wynik: niska kategoria
wiekowa + oznaczenie „Interakcja użytkowników”.

**Grupa docelowa** → 13–15, 16–17, 18+ (bez dzieci poniżej 13 — inaczej obowiązują zasady programu Rodzina).
Apka nie jest skierowana do dzieci.

**Aplikacja z wiadomościami (News)** → Nie. **Śledzenie kontaktów / COVID** → Nie. **Aplikacja rządowa** → Nie.
**Funkcje finansowe** → brak (ofiary realizuje zewnętrzny operator płatności w przeglądarce, bez Google Play Billing
— apka nie sprzedaje treści cyfrowych). **Aplikacje zdrowotne** → brak.

**Usuwanie konta** → Tak, w aplikacji (Konto → Prywatność → Usuń konto) + URL: `https://avenit.pl/usun-konto/`.

### Bezpieczeństwo danych (Data safety)
Zbieranie: **Tak**. Udostępnianie stronom trzecim: **Nie** (hosting, poczta, Expo/Firebase do pushy to
dostawcy usług działający w naszym imieniu — według definicji Google to nie jest „udostępnianie”).
Szyfrowanie w transmisji: **Tak** (HTTPS). Możliwość usunięcia danych: **Tak**.

| Kategoria Google | Typ | Zbierane | Wymagane? | Cel |
|---|---|---|---|---|
| Dane osobowe | Imię i nazwisko, Adres e-mail, Identyfikatory użytkownika | Tak | Wymagane | Działanie aplikacji, Zarządzanie kontem |
| Dane osobowe | Numer telefonu, Adres | Tak | Opcjonalne | Działanie aplikacji |
| Dane osobowe | Przekonania religijne lub polityczne (przynależność do kościoła) | Tak | Wymagane | Działanie aplikacji |
| Informacje finansowe | Historia zakupów (zestawienie ofiar) | Tak | Opcjonalne | Działanie aplikacji |
| Wiadomości | Inne wiadomości w aplikacji (Komunikator, prośby modlitewne) | Tak | Opcjonalne | Działanie aplikacji |
| Zdjęcia i filmy | Zdjęcia | Tak | Opcjonalne | Działanie aplikacji |
| Pliki audio | Nagrania głosowe | Tak | Opcjonalne | Działanie aplikacji |
| Pliki i dokumenty | Pliki i dokumenty (załączniki) | Tak | Opcjonalne | Działanie aplikacji |
| Aktywność w aplikacji | Interakcje z aplikacją (logowania, używane moduły) | Tak | Wymagane | Analityka, Działanie aplikacji |
| Identyfikatory urządzenia | Identyfikatory urządzenia lub inne (token push FCM) | Tak | Opcjonalne | Działanie aplikacji |

**Nie deklarujemy**: lokalizacji (mapa grup pokazuje adresy grup, nie czyta lokalizacji telefonu), kontaktów,
kalendarza (wydarzenia zapisujemy do kalendarza na telefonie — dane nie trafiają na serwer), zdrowia, historii
przeglądania, diagnostyki (brak raportowania awarii). Odcisk palca / twarz — tylko na urządzeniu.

### Uprawnienia (nie wymagają osobnych deklaracji)
`CAMERA`, `RECORD_AUDIO`, `READ/WRITE_CALENDAR`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`, `RECEIVE_BOOT_COMPLETED`.
Brak `READ_MEDIA_IMAGES/VIDEO` (zdjęcia przez systemowy wybierak) → bez deklaracji „Uprawnienia do zdjęć i filmów”.
Brak usług pierwszoplanowych, dokładnych alarmów i lokalizacji w tle.

## 6. Wymogi treści użytkowników (polityka UGC Google Play)
Te same co dla App Store i już wdrożone: akceptacja zasad społeczności przy pierwszym uruchomieniu, zgłaszanie
wiadomości i próśb, blokowanie osób, maskowanie wulgaryzmów, moderacja w ciągu 24 h (e-mail + push do moderatorów,
panel „Zgłoszenia” na webie). Szczegóły: [`APP_STORE.md` §7](../../APP_STORE.md).

## 7. Grafiki — jak odświeżyć
Po nowych zrzutach z symulatora (`../screenshots/raw/`, nazwy z `../screenshots/captions.json`):
`python3 graphics.py` → `out/`. Nagłówki zmieniasz w `captions.json` (wspólne z App Store).
