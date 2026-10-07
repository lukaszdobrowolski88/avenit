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
3. **Serwer przed buildem**: po merge PR deploy (migracja **089**: zgłoszenia próśb, akceptacja zasad) i skrypt
   kościoła demo (§6). Apka z tej wersji woła nowe funkcje serwera (`community-terms`, `content-report`,
   `delete-my-account`), więc serwer musi być pierwszy.
4. **Rekord apki**: przy pierwszym `eas submit` EAS sam zaproponuje założenie apki w App Store Connect
   (bundle `pl.avenit.app`, język główny: **polski**, SKU np. `avenit-ios`). Potem dopisz `ascAppId` (Apple ID apki,
   10 cyfr, widoczne w App Information) do `eas.json`, wtedy kolejne wysyłki nie wymagają pytań.
5. **Build**: z czystej kopii `main` z prawdziwymi `node_modules`:
   `eas build -p ios --profile production` (wymaga interaktywnego logowania Apple). To build natywny, bo zmieniły się
   Info.plist, lokalizacje i manifest.
6. **TestFlight**: `eas submit -p ios --profile production --latest` → przetestuj na swoim iPhonie (logowanie,
   push, aparat, zdjęcia, nagranie głosowe, kalendarz, ofiary).
7. **Metadane**: `eas metadata:push` z `packages/mobile` (teksty, kategorie, ocena wieku). Albo wklej ręcznie z
   `store.config.json`.
8. **Ręcznie w App Store Connect**: zrzuty (§4), App Privacy (§3), pytanie „Social Media” w ocenie wieku (§5),
   dane recenzji + konto demo (§6), cena „Darmowa”, dostępność krajów, Content Rights (§5).
9. **Wyślij do recenzji**. `automaticRelease: false` → po akceptacji publikujesz ręcznie przyciskiem.

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

Recenzent musi się zalogować, a apka nie ma rejestracji. Do tego służy **kościół demo `demo.avenit.pl`** z samymi
fikcyjnymi danymi (nie schwro — tam recenzent zobaczyłby prawdziwe osoby). Zakłada go i wypełnia skrypt
[`packages/api/scripts/demo-tenant.mjs`](../api/scripts/demo-tenant.mjs) (na VPS, z `/opt/avenit`):

```
docker compose exec -e DEMO_REVIEW_PASSWORD='<hasło dla recenzenta>' api node scripts/demo-tenant.mjs
```

- Konto recenzenta: **`recenzja@demo.avenit.pl`**, rola lider, bez 2FA, e-mail tylko w tym kościele (logowanie
  globalne nie pokazuje wyboru kościoła). Zasady społeczności nie są zaakceptowane — recenzent zobaczy bramkę zasad.
- Dane: 6 wydarzeń od najbliższej niedzieli, zaproszenie do służby „pending” + potwierdzone, program nabożeństwa,
  6 pieśni z domeny publicznej z akordami, 4 kazania (cykl „List do Filipian”), 5 próśb na ścianie modlitwy (w tym
  anonimowa i wysłuchana), 3 grupy domowe we Wrocławiu (mapa), rozmowa zespołu i rozmowa prywatna.
- Skrypt jest powtarzalny: czyści dane demo i wstawia je z datami od dziś. **Uruchom go przed każdą recenzją**
  (także aktualizacji), żeby wydarzenia nie były przeszłe.
- Przetestowany na czystej bazie (szablon + migracje do 089) razem z testem end-to-end nowych funkcji.

Kontakt dla recenzenta: Łukasz Dobrowolski, lukasz@avenit.pl, +48 607 693 996 (dane z polityki prywatności).

**Notes for App Review** (do wklejenia):

```
Avenit is a church management platform (SaaS) used by Polish churches. Each church administrator
creates member accounts in the web panel, so the app has no sign-up screen. Please use the demo
account provided; it belongs to a demo church that contains only fictional data.

Sign in: enter the e-mail and password on the first screen and tap "Zaloguj" (Sign in).
Two-factor authentication is disabled for this demo account. On first launch the app asks you to
accept the Community Guidelines ("Akceptuję zasady").

The interface is in Polish. Main areas: Pulpit (Home), Kalendarz (Calendar), Komunikator (Messenger),
Moduły (Modules: songs with chords, sermons, prayer wall, home groups, serving schedule), Konto (Account).

User-generated content (Guideline 1.2):
- Users must accept Community Guidelines with zero tolerance for objectionable content before using the app.
- Profanity is automatically masked in messages and prayer requests.
- Report: long-press a message in Komunikator > "Zgłoś"; on the prayer wall tap "..." on a request > "Zgłoś prośbę".
- Block: long-press a message > "Zablokuj", or "..." on a prayer request > "Zablokuj autora". Blocked users'
  messages and prayer requests are hidden; the list is in Konto > Prywatność > Zablokowane osoby.
- Every report notifies the church moderators by e-mail and push. They review reports in the web panel and can
  remove the content or block the author's account; reports are handled within 24 hours.
- Contact: Konto > Pomoc > Napisz do nas (lukasz@avenit.pl).

Account deletion: Konto (Account) > Prywatność (Privacy) > Usuń konto (Delete account). The account is deleted
immediately after password confirmation.

Giving: donations go to the user's own church (a religious non-profit organization) and the payment is completed
outside the app, in Safari, on the payment operator's page. The app sells no digital goods or services.
```

## 7. Wymagania Apple — co jest zrobione

| Wytyczna | Stan |
|---|---|
| 1.2 Treści użytkowników | Zasady społeczności do akceptacji przy pierwszym uruchomieniu (`TermsGate`, fn `community-terms`), maskowanie wulgaryzmów przy zapisie (`lib/moderation.js`: wiadomości, modlitwy, tablice), zgłaszanie wiadomości (Komunikator+) i próśb (fn `content-report`), blokowanie osób + lista „Zablokowane osoby” w Koncie, e-mail i push do moderatorów przy każdym zgłoszeniu (+ alert do operatora `MODERATION_ALERT_EMAIL`), panel „Zgłoszenia” w webowym Komunikatorze z akcjami „Usuń treść” i „Zablokuj autora” (fn `moderate-content`), kontakt w Koncie → Pomoc |
| 5.1.1(v) Usuwanie konta | W apce: Konto → Prywatność → Usuń konto, potwierdzenie hasłem, usunięcie natychmiast (fn `delete-my-account`); administratorzy kościoła dostają e-mail o kartotece. Strona `avenit.pl/usun-konto` mówi o App Store i o ścieżce w apce |
| 5.1.1 Polityka prywatności | Nowy punkt 5 „Aplikacja mobilna” na `avenit.pl/polityka-prywatnosci` (push przez Expo/APNs/FCM, uprawnienia, Face ID lokalnie, płatności, brak śledzenia, moderacja, usuwanie konta) |
| 2.1 Konto demo | Kościół `demo` + skrypt (§6) |
| 3.2.2 Ofiary | Płatność w Safari (`Linking.openURL`); rola lider w demo nie ma modułu ofiar |

Do sprawdzenia przez Ciebie: zdanie o standardowych klauzulach umownych dla Expo w polityce prywatności (umowa
powierzenia z Expo) — to deklaracja prawna, potwierdź ją przed publikacją.

Język: interfejs mobilki jest w większości po polsku (`t()` obejmuje ~80 tekstów, ~60 plików ma polski na sztywno),
dlatego opis EN mówi to wprost, a lokalizacje systemowe to tylko PL i EN. Ukraiński dodaj do `locales` po
przetłumaczeniu apki.

## 8. Przy kolejnych wersjach

- Zmiana tylko JS → `eas update --channel production` (OTA, bez recenzji). Zmiana natywna → podbij `version`
  w `app.config.ts`, nowy build i recenzja.
- „What's New” (`releaseNotes` w `store.config.json`) dodawaj od wersji 1.0.1; przy pierwszej wersji App Store
  tego pola nie przyjmuje.
- Nowe uprawnienie natywne = nowy opis w `app.config.ts` **i** w `locales/*.json`.
