# Publikacja w App Store — Avenit (iOS)

Komplet materiałów i kroków do pierwszej publikacji `pl.avenit.app`. Teksty sklepu żyją w
[`store.config.json`](store.config.json) (EAS Metadata), konfiguracja buildu w [`app.config.ts`](app.config.ts)
i [`eas.json`](eas.json). Tego, czego nie da się wysłać z pliku (zrzuty, ankieta prywatności, konto demo),
dotyczą sekcje 4–7 poniżej.

## 1. Co jest gotowe w repo

| Element | Gdzie | Uwagi |
|---|---|---|
| Nazwa, podtytuł, opis, słowa kluczowe, tekst promocyjny (PL + EN) | `store.config.json` → `apple.info` | Limity znaków sprawdzone; `eas metadata:lint` bez błędów |
| Kategorie | `store.config.json` → `categories` | Główna: Produktywność, dodatkowa: Styl życia |
| Odpowiedzi do oceny wieku | `store.config.json` → `advisory` | Bez pytania „Social Media” — schemat EAS go nie zna, patrz §5 |
| Prywatność, wsparcie, strona www | `store.config.json` | `avenit.pl/polityka-prywatnosci/`, `avenit.pl/#kontakt`, `avenit.pl` |
| Deklaracja szyfrowania | `app.config.ts` → `ios.config.usesNonExemptEncryption: false` | Tylko HTTPS — App Store Connect nie pyta o eksport przy każdym buildzie |
| Manifest prywatności (PrivacyInfo) | `app.config.ts` → `ios.privacyManifests` | Powody „required reason API” dla RN/Expo, bez śledzenia |
| Opisy uprawnień (aparat, zdjęcia, mikrofon, kalendarz, Face ID) | `app.config.ts` + `locales/pl.json`, `locales/en.json` | Konkretne zamiast domyślnych „Allow … to access”; po angielsku dla recenzenta |
| Tylko iPhone | `app.config.ts` → `supportsTablet: false` | Bez wymogu zrzutów z iPada; na iPadzie apka i tak działa w trybie iPhone |
| Numer buildu | `eas.json` → `production.autoIncrement` | Każdy build produkcyjny dostaje kolejny numer |
| Wysyłka do App Store Connect | `eas.json` → `submit.production.ios.appleTeamId` | `ascAppId` dopisz po utworzeniu apki (§2, krok 3) |
| Ikona 1024×1024 bez przezroczystości | `assets/icon.png` | Spełnia wymóg Apple |

## 2. Kolejność kroków

1. **Konto i formalności w App Store Connect** (jednorazowo)
   - Konto jest typu *Individual* (zespół N4C97P5LL8) → w sklepie jako sprzedawca widnieje **„Lukasz Dobrowolski”**, nie „Avenit”.
     Jeśli ma być „Avenit”, potrzebne jest konto *Organization* (firma + numer D-U-N-S). Zmianę typu konta można
     zrobić później przez wsparcie Apple, ale najprościej przed pierwszą publikacją.
   - **Status przedsiębiorcy (DSA, UE)**: Business → Compliance. Bez tej deklaracji apka nie pojawi się w sklepach UE,
     w tym w Polsce. Avenit jest usługą komercyjną, więc to raczej „trader”: adres, telefon i e-mail będą publicznie
     widoczne na stronie apki w UE.
   - Umowa na darmowe aplikacje jest aktywna domyślnie, umowa płatna nie jest potrzebna.
2. **Push dla produkcji**: `eas credentials -p ios` → profil *production* → Push Notifications →
   *Use an existing push key* → klucz **93333W3XV8** (ten sam co dla preview).
3. **Rekord apki**: przy pierwszym `eas submit` EAS sam zaproponuje założenie apki w App Store Connect
   (bundle `pl.avenit.app`, język główny: **polski**, SKU np. `avenit-ios`). Potem dopisz `ascAppId` (Apple ID apki,
   10 cyfr, widoczne w App Information) do `eas.json`, wtedy kolejne wysyłki nie wymagają pytań.
4. **Build**: z czystej kopii `main` z prawdziwymi `node_modules`:
   `eas build -p ios --profile production` (wymaga interaktywnego logowania Apple). To build natywny, bo zmieniły się
   Info.plist, lokalizacje i manifest.
5. **TestFlight**: `eas submit -p ios --profile production --latest` → przetestuj na swoim iPhonie (logowanie,
   push, aparat, zdjęcia, nagranie głosowe, kalendarz, ofiary).
6. **Metadane**: `eas metadata:push` z `packages/mobile` (teksty, kategorie, ocena wieku). Albo wklej ręcznie z
   `store.config.json`.
7. **Ręcznie w App Store Connect**: zrzuty (§4), App Privacy (§3), pytanie „Social Media” w ocenie wieku (§5),
   dane recenzji + konto demo (§6), cena „Darmowa”, dostępność krajów, Content Rights (§5).
8. **Wyślij do recenzji**. `automaticRelease: false` → po akceptacji publikujesz ręcznie przyciskiem.

## 3. App Privacy („Etykieta prywatności”) — odpowiedzi

Śledzenie (tracking): **Nie**. Brak reklam, brak SDK analitycznych i reklamowych. Wszystkie dane poniżej są
**powiązane z tożsamością użytkownika** (konto w kościele) i **nie służą do śledzenia**.

| Kategoria Apple | Typ danych | Cel |
|---|---|---|
| Contact Info | Name, Email Address, Phone Number, Physical Address | App Functionality |
| User Content | Emails or Text Messages (Komunikator), Photos or Videos, Audio Data (wiadomości głosowe), Other User Content (prośby o modlitwę, formularze, zadania, nieobecności) | App Functionality |
| Identifiers | User ID | App Functionality |
| Sensitive Info | Sensitive Info (przynależność do kościoła = przekonania religijne) | App Functionality |
| Financial Info | Other Financial Info (historia ofiar w zestawieniu wpłat) | App Functionality |
| Usage Data | Product Interaction (logowania, używane moduły — polityka prywatności §3) | App Functionality, Analytics |

**Nie deklarujemy**: Location (mapa grup pokazuje adresy grup, nie pobiera lokalizacji telefonu), Contacts
(apka nie czyta książki adresowej), Health, Browsing/Search History, Diagnostics (brak raportowania awarii).
Face ID działa lokalnie i nic nie trafia na serwer. Dane karty płatniczej podaje się u operatora płatności,
nie w apce.

> Uwaga: deklarujemy dane zbierane przez **apkę** (to, co wysyła na serwer Avenit). Jeśli dojdzie Sentry,
> analityka albo lokalizacja, tę tabelę trzeba zaktualizować przed wydaniem.

## 4. Zrzuty ekranu

- **Wymagane**: iPhone 6,9" — **1320 × 2868** px (pion), od 3 do 10 sztuk, PNG/JPG bez przezroczystości.
  Mniejsze iPhone'y App Store skaluje sam. iPad nie jest potrzebny (`supportsTablet: false`).
- Źródło: symulator **iPhone 17 Pro Max** (natywnie 1320×2868) → `xcrun simctl io booted screenshot`.
- **Tylko fikcyjne dane** (kościół demo, §6). Na zrzutach nie może być prawdziwych członków schwro (RODO).
- Status bar: `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4`.

- **Plansze robi skrypt** [`store/screenshots/frame.py`](store/screenshots/frame.py): surowe zrzuty wrzuć do
  `store/screenshots/raw/` pod nazwami z [`captions.json`](store/screenshots/captions.json), uruchom
  `python3 frame.py` i dostaniesz `out/pl/NN.png` oraz `out/en-US/NN.png` w 1320×2868 (telefon w ramce, nagłówek
  w Manrope). `raw/` i `out/` są poza gitem. Nagłówki zmieniasz w `captions.json`, a rozmiar czcionki dopasowuje
  się sam.

Proponowany zestaw (nagłówek w sygnaturze marki: bold + light, kropka w kurkumie, tło papier `#F6F4EE`):

| # | Ekran (trasa) | Nagłówek PL | Nagłówek EN |
|---|---|---|---|
| 1 | Pulpit (`avenit://dashboard`) | **Cały kościół.** Jedna aplikacja. | **The whole church.** One app. |
| 2 | Moja służba / zaproszenie (`avenit://serve`) | **Grafik służb.** Jednym dotknięciem. | **Serving schedule.** One tap. |
| 3 | Pieśń z akordami (`avenit://songs/<id>`) | **Akordy i tonacja.** Na każdą próbę. | **Chords and keys.** Ready for rehearsal. |
| 4 | Komunikator, rozmowa zespołu | **Rozmowy zespołów.** Ankiety i modlitwy. | **Team chat.** Polls and prayer. |
| 5 | Kalendarz / wydarzenie (`avenit://calendar`) | **Wydarzenia.** Z zapisami. | **Events.** With sign-ups. |
| 6 | Moduły (`avenit://modules`) | **Kazania, grupy, modlitwa.** Zawsze pod ręką. | **Sermons, groups, prayer.** Always at hand. |

Opcjonalnie: wideo podglądowe (App Preview) 15–30 s, 886×1920 lub 1080×1920. Nie jest wymagane.

## 5. Ocena wieku i prawa do treści

Wartości są już w `store.config.json`. Wszystkie treści wrażliwe: **Brak**. Messaging and Chat: **Tak**.
User-Generated Content: **Tak**. Reklamy, kontrola rodzicielska, weryfikacja wieku, nieograniczony dostęp do sieci,
hazard, loot boxy, tematy zdrowotne: **Nie**.

- **Social Media** (pytanie dodane przez Apple 07.2026, brak w schemacie EAS — zaznacz ręcznie): zalecam **Tak**.
  Ściana modlitwy to feed treści użytkowników z reakcjami, widoczny dla całej wspólnoty, więc mieści się w definicji
  Apple. Skutek: ocena **13+**, co dla apki kościoła nie jest ograniczeniem. „Nie” daje 4+, ale przy recenzji grozi
  odrzuceniem za błędną deklarację.
- **Content Rights** („Does your app contain, show, or access third-party content?”): **Tak** — teksty pieśni i
  nagrania kazań dodaje kościół w ramach własnych licencji (np. CCLI). Zaznacz, że masz do tego prawa.

## 6. Recenzja Apple — konto demo i notatki

Recenzent musi się zalogować, a apka nie ma rejestracji. **Potrzebny jest osobny kościół demo z fikcyjnymi danymi**
(np. tenant `demo`). Nie dawaj konta na schwro, bo recenzent zobaczyłby dane prawdziwych osób. Wymagania dla konta:

- e-mail tylko w tenancie demo (logowanie globalne nie pokaże wtedy wyboru kościoła), **bez 2FA**;
- rola z dostępem do większości modułów (np. lider), wypełnione: wydarzenia na najbliższe tygodnie, grafik z zaproszeniem
  „pending”, kilka pieśni z akordami, kazania, 2–3 rozmowy w Komunikatorze, prośby na ścianie modlitwy, grupa domowa
  z adresem;
- hasło ważne przez cały czas recenzji (i kolejnych aktualizacji).

Kontakt dla recenzenta: Łukasz Dobrowolski, lukasz@avenit.pl, +48 607 693 996 (dane z polityki prywatności).

**Notes for App Review** (do wklejenia):

```
Avenit is a church management platform (SaaS) used by Polish churches. Each church administrator
creates member accounts in the web panel, so the app has no sign-up screen. Please use the demo
account provided; it belongs to a demo church that contains only fictional data.

Sign in: enter the e-mail and password on the first screen and tap "Zaloguj" (Sign in).
Two-factor authentication is disabled for this demo account.

The interface is in Polish. Main areas: Pulpit (Home), Kalendarz (Calendar), Komunikator (Messenger),
Moduły (Modules: songs with chords, sermons, prayer wall, home groups, serving schedule), Konto (Account).

Giving: donations go to the user's own church (a religious non-profit organization). The app shows
the church's giving options and the payment is completed outside the app, in Safari, on the payment
operator's page. The app sells no digital goods or services.

Messenger and prayer wall are private to the members of a single church. Members can report content
and block users; church administrators moderate it. [<- keep this paragraph only once reporting and
blocking are implemented, see risk 1]

Account deletion: Konto (Account) tab > Prywatność (Privacy) > Usuń konto (Delete account).
```

## 7. Ryzyka odrzucenia — do decyzji przed wysyłką

1. **Treści użytkowników bez zgłaszania i blokowania (wytyczna 1.2) — ryzyko wysokie.** Komunikator i ściana modlitwy
   to UGC, a apka nie ma przycisku „Zgłoś” ani „Zablokuj użytkownika”. Apple wymaga dla UGC: filtrowania, zgłaszania
   treści, blokowania użytkowników i publicznego kontaktu. Zalecenie przed wysyłką: „Zgłoś” na wiadomości i prośbie
   modlitewnej (trafia do administratora kościoła), „Zablokuj” w profilu rozmówcy (ukrywa jego wiadomości) oraz
   akceptacja regulaminu z zakazem treści obraźliwych.
2. **Usuwanie konta (5.1.1(v)) — ryzyko średnie.** Apka linkuje do `avenit.pl/usun-konto`. To formularz prośby
   przekazywanej administratorowi kościoła, a Apple preferuje usunięcie zainicjowane w apce i realizowane bez
   kontaktu z obsługą. Argument dla recenzenta: apka nie zakłada kont (zakłada je kościół). Do poprawy na stronie:
   tekst mówi tylko o Google Play („Ta strona dotyczy aplikacji Avenit (Google Play…)”), trzeba dopisać App Store.
   Lepiej: przycisk „Usuń konto” w apce wysyłający żądanie przez API i od razu dezaktywujący konto.
3. **Ofiary (3.2.2) — ryzyko niskie/średnie.** Płatność otwiera się w Safari (`Linking.openURL`), co jest zgodne z
   wytyczną. Jeśli recenzent zakwestionuje formularz kwoty w apce, rozwiązaniem jest otwieranie całej strony ofiar
   w Safari.
4. **Polityka prywatności nie opisuje apki mobilnej.** Brakuje: tokenów push, dostępu do aparatu, zdjęć i mikrofonu,
   lokalnego Face ID, operatora płatności i usuwania konta z apki. Apple sprawdza, czy polityka obejmuje dane
   z etykiety (§3). Projekt sekcji do dopisania na `avenit.pl/polityka-prywatnosci` jest poniżej.
5. **Język.** Interfejs mobilki jest w większości po polsku (`t()` obejmuje ~80 tekstów, ~60 plików ma polski
   na sztywno), dlatego opis EN mówi to wprost, a lokalizacje systemowe to tylko PL i EN. Ukraiński dodaj do
   `locales` po przetłumaczeniu apki.

### Projekt sekcji polityki prywatności (do dopisania jako nowy punkt)

> **Aplikacja mobilna Avenit (iOS i Android).** Aplikacja służy członkom wspólnot korzystających z platformy Avenit.
> Przetwarza dane konta (imię i nazwisko, e-mail, telefon, adres, zdjęcie profilowe) oraz treści, które dodajesz:
> wiadomości tekstowe i głosowe, zdjęcia i pliki, prośby o modlitwę, zapisy, nieobecności i zadania. Aby wysyłać
> powiadomienia, zapisujemy token powiadomień urządzenia (dostarczany przez Apple/Google za pośrednictwem usługi Expo).
> Z aparatu, biblioteki zdjęć, mikrofonu i kalendarza aplikacja korzysta tylko po Twojej zgodzie i tylko w chwili, gdy
> sam wybierasz tę funkcję. Odblokowanie Face ID / odciskiem palca odbywa się wyłącznie na urządzeniu, a dane
> biometryczne nie są nam przekazywane. Płatności (ofiary) realizuje operator płatności na swojej stronie, a aplikacja
> nie przetwarza danych kart. Aplikacja nie zawiera reklam ani narzędzi śledzących. Usunięcie konta możesz zlecić
> w aplikacji (Konto → Prywatność → Usuń konto) lub na stronie avenit.pl/usun-konto.

## 8. Przy kolejnych wersjach

- Zmiana tylko JS → `eas update --channel production` (OTA, bez recenzji). Zmiana natywna → podbij `version`
  w `app.config.ts`, nowy build i recenzja.
- „What's New” (`releaseNotes` w `store.config.json`) dodawaj od wersji 1.0.1; przy pierwszej wersji App Store
  tego pola nie przyjmuje.
- Nowe uprawnienie natywne = nowy opis w `app.config.ts` **i** w `locales/*.json`.
