# Social Media — Facebook i Instagram (moduł `social`)

Planowanie, akceptacja i publikacja postów na stronach Facebooka i kontach firmowych Instagrama,
jak w Bufferze. Migracja tenanta `121_social_media.sql`, kod: `packages/api/src/social/*`,
`packages/api/src/fn/social.js`, `src/modules/Social/*`, wspólne reguły `packages/shared/src/lib/social.js`.

## Jak to działa

- **Kanały** — jedna platformowa aplikacja Meta dla wszystkich kościołów. Osoba z prawem
  „Podłączaj i odłączaj kanały” klika *Połącz Facebook i Instagram*, loguje się do Facebooka
  i wybiera strony. Avenit zapisuje token każdej strony (AES-256-GCM, jak sekrety integracji)
  i podpięte do niej konto firmowe Instagrama. Token strony z tokenu długoterminowego nie wygasa.
  Wygasa dopiero po zmianie hasła, cofnięciu zgody albo utracie roli na stronie. Wtedy kanał
  dostaje status „Połącz ponownie”, a w module pojawia się baner.
- **Posty** — wspólna treść i media plus opcjonalnie własna treść, format (IG: post, rolka,
  relacja) i pierwszy komentarz dla każdego kanału. Walidacja limitów sieci działa na żywo
  w kompozytorze i ponownie na serwerze (te same funkcje z `shared/lib/social.js`).
- **Termin**:
  - *Kolejka* — najbliższy wolny slot z harmonogramu w zakładce Kanały (czas polski,
    jeden post na slot w każdym kanale),
  - *Teraz*,
  - *Wybrany termin*.
- **Akceptacja** — osoba bez prawa publikacji wysyła post do akceptacji (opcjonalnie z proponowanym
  terminem). Zatwierdzający dostają powiadomienie (dzwonek i push). Mogą zatwierdzić post albo
  odesłać go do poprawy z uwagą. Zmiana zaplanowanego posta przez osobę bez prawa publikacji
  odsyła go z powrotem do akceptacji.
- **Publikacja** — worker co minutę (`forEachTenant('social', 'social')`). „Opublikuj teraz” rusza
  od razu, bez czekania na minutę. Cele są przejmowane przez `FOR UPDATE SKIP LOCKED` z dzierżawą 10 min.
  - Błędy chwilowe (limit Meta, 5xx, sieć) są ponawiane po 1, 5 i 15 min, łącznie najwyżej 4 próby.
  - Token nieważny oznacza, że kanał przechodzi w status `revoked`.
  - Wideo i karuzele z wideo na IG to status *Przetwarzanie*. Worker sprawdza kontener co minutę,
    najdłużej 45 min, i publikuje ten sam kontener bez wysyłania pliku od nowa.
  - Gdy dzierżawa minie w trakcie publikacji, nie ponawiamy jej automatycznie, bo post mógł już
    wyjść. Kończy się błędem z prośbą o sprawdzenie strony.
  - Błąd albo częściowa publikacja: powiadomienie do autora i zatwierdzającego.
- **Pliki** — publiczny bucket `social-media` z losowymi ścieżkami, bo Meta pobiera pliki po URL-u.
  - Wgrywa tylko osoba z dostępem do modułu, limit 50 MB.
  - Instagram przyjmuje wyłącznie JPEG o proporcjach od 4:5 do 1,91:1. Serwer robi kopię JPEG
    (sharp) i przycina ją do środka, gdy proporcje wychodzą poza zakres. Kompozytor ostrzega o tym
    z wyprzedzeniem.

## Uprawnienia (Ustawienia → Uprawnienia → Social Media)

| Prawo | Co daje |
|---|---|
| `module:social` | wgląd w moduł (kalendarz, kolejka, kanały) |
| Posty: tworzenie (`res:social_posts:create`) | szkice i wysyłanie do akceptacji; własne posty autor edytuje zawsze |
| Posty: edycja / usuwanie | edycja / usuwanie **cudzych** postów (szkice innych też są wtedy widoczne) |
| `action:social:publish` | publikowanie i planowanie bez akceptacji, zatwierdzanie i odsyłanie postów, ponawianie |
| `action:social:manage_accounts` | podłączanie i odłączanie kanałów |
| Zestawy hashtagów / godziny kolejki | zwykły CRUD |

Administrator, rada i koordynator mają wszystko z presetów (`*`, `module:*`). Lider i członek nie
mają dostępu, dopóki nie zostanie nadany w macierzy (np. służbie Media). Moduł jest w standardzie
(wszystkie plany). Platforma może go wyłączyć kościołowi w panelu admina (`tenant_modules`).

## Konfiguracja aplikacji Meta (jednorazowo, platforma)

1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create app** → typ **Business**,
   przypięta do konta firmowego Avenit w Meta Business Suite.
2. Przypadki użycia (use cases): **Manage everything on your Page** oraz **Manage messaging & content
   on Instagram** (Instagram API z logowaniem przez Facebooka). Produkt **Facebook Login for Business**.
3. **Facebook Login for Business → Settings**:
   - Valid OAuth Redirect URIs: `https://app.avenit.pl/api/social/oauth/meta/callback`
   - Client OAuth login: włączone, Web OAuth login: włączone, Enforce HTTPS: włączone.
4. **App settings → Basic**:
   - App domains: `avenit.pl`
   - Privacy Policy URL: `https://app.avenit.pl/polityka-prywatnosci`
   - Terms of Service URL: `https://app.avenit.pl/regulamin`
   - User data deletion → *Data deletion callback URL*: `https://app.avenit.pl/api/social/meta/data-deletion`
   - Ikona aplikacji (1024×1024), kategoria, kontakt.
5. **App settings → Advanced**:
   - Deauthorize callback URL: `https://app.avenit.pl/api/social/meta/deauthorize`
   - **Require App Secret: Yes** (Avenit wysyła `appsecret_proof` przy każdym wywołaniu).
6. Uprawnienia, o które prosi aplikacja:
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
   - `pages_manage_engagement` (pierwszy komentarz na FB)
   - `business_management` (strony z Business Managera)
   - `instagram_basic`, `instagram_content_publish`
   - `instagram_manage_comments` (pierwszy komentarz na IG)
7. (Opcjonalnie) Facebook Login for Business → **Configurations** → nowa konfiguracja typu *User access
   token* z powyższymi uprawnieniami. Jej ID wpisz jako `META_CONFIG_ID`, wtedy dialog logowania
   bierze zakresy z konfiguracji.
8. Na VPS w `/opt/avenit/.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   META_CONFIG_ID=          # opcjonalnie
   ```
   potem `docker compose up -d api worker`. Wersja Graph API: `META_GRAPH_VERSION` (domyślnie `v26.0`).

### Tryb deweloperski vs. publiczny

- **Development mode** — połączyć kanał mogą tylko osoby z rolą w aplikacji (Admin / Developer /
  Tester w *App roles*). Wystarczy na start dla schwro: dodaj administratorów stron kościoła jako
  testerów. Publikacja działa normalnie na ich stronach.
- **Live + Advanced Access** — dla wszystkich kościołów potrzebne są:
  1. **Business verification** (dokumenty firmy Avenit),
  2. **App Review** dla każdego uprawnienia z punktu 6 (zwykle 2–4 tygodnie). Do każdego uprawnienia
     nagranie ekranu z pełnym przebiegiem, tak żeby recenzent mógł go odtworzyć na koncie testowym:
     - logowanie do Avenit → Social Media → Kanały → *Połącz Facebook i Instagram* → ekran zgód Meta
       → wybór strony → kanały na liście,
     - *Utwórz post* → zdjęcie + tekst → FB i IG → *Opublikuj teraz* → post widoczny na stronie i na
       Instagramie (link „Zobacz post”),
     - pierwszy komentarz (IG i FB) → komentarz widoczny pod postem,
     - odłączenie kanału.
  3. Dane logowania do konta testowego Avenit dla recenzenta (osobny kościół demo).

## Ograniczenia i znane zachowania

- Instagram: najwyżej 100 postów z API na dobę na konto; karuzela do 10 elementów; rolki to wideo
  MP4/MOV (H.264/AAC); relacje bez podpisu; linki w podpisie nie są klikalne.
- Facebook: wideo albo zdjęcia w jednym poście (nie oba naraz); link bez zdjęcia daje podgląd linku.
- Usunięcie opublikowanego posta w Avenit nie usuwa go z Facebooka ani Instagrama.
- Limit pliku 50 MB (wspólny limit storage API). Dłuższe rolki trzeba skompresować.

## Następne etapy (plan)

1. Udostępnianie z wydarzeń, kazań i ogłoszeń (gotowy szkic z linkiem i grafiką), reguły
   automatyczne, UTM i krótkie linki, strona linków („link in bio”).
2. Asystent AI w kompozytorze (warianty tekstu, hashtagi, tłumaczenie PL/EN/UK) przez `ai-assist`.
3. Analityka postów (zasięg, reakcje, najlepsze godziny), wymaga `read_insights` /
   `instagram_manage_insights`.
4. Kolejne sieci: Threads, LinkedIn, YouTube, Bluesky; przypomnienia do ręcznej publikacji (TikTok,
   relacje).
5. Mobilka: akceptacja, szybki post ze zdjęciem z telefonu.
