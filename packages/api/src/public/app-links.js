// Universal Links (iOS) i App Links (Android): link z kodu QR tłumaczenia
// (https://<kościół>.avenit.pl/tlumaczenie/<token>) otwiera aplikację Avenit, gdy jest
// zainstalowana — inaczej przeglądarkę (strona słuchacza bez zmian).
//
// System pobiera pliki weryfikacyjne z /.well-known/ domeny: przy hostach z gwiazdką
// (applinks:*.avenit.pl, android:host="*.avenit.pl") z domeny głównej avenit.pl, przy
// konkretnych hostach z każdego z nich. Caddy kieruje te dwie ścieżki do API na KAŻDYM hoście
// (deploy/Caddyfile, przed fallbackiem SPA), więc odpowiedź nie zależy od tenanta.
// Wymagania Apple: HTTP 200 po https, bez przekierowań, application/json, bez rozszerzenia.
//
// Zakres w aplikacji (musi zgadzać się z intentFilters w packages/mobile/app.config.ts i z
// packages/mobile/src/features/interpretation/logic.ts → appLinkTarget):
//   • /tlumaczenie/<token>          — publiczny link/QR (token = dokładnie 32 znaki, logic.js
//                                     newPublicToken: randomBytes(24) base64url);
//   • /tlumaczenie/sluchaj/<id>     — słuchanie z konta (zalogowany);
//   • /tlumaczenie/konsola/…, /tlumaczenie/oryginal/… — ZAWSZE web (konsola tłumacza, stół akustyka).
// Wersje „tylko przeglądarka” (aplikacja otwiera je w przeglądarce, bez pętli z powrotem do siebie):
// /tlumaczenie/<token>/ (ukośnik na końcu) i /login?next=/tlumaczenie/sluchaj/<id> — nie pasują do
// żadnego wzorca poniżej.

// Apple Developer Team (eas.json → submit.production.ios.appleTeamId).
export const APPLE_TEAM_ID = 'N4C97P5LL8';
// Produkcja + preview (ten sam zespół; build preview z EAS też ma associatedDomains).
export const IOS_BUNDLE_IDS = ['pl.avenit.app', 'pl.avenit.app.preview'];

export const ANDROID_PACKAGE = 'pl.avenit.app';
// Odciski SHA-256 certyfikatów podpisu wersji produkcyjnej:
//   • klucz podpisywania aplikacji w Google Play (Play App Signing) — tym podpisane są instalacje
//     ze sklepu (androidpublisher generatedApks → certificateSha256Hash);
//   • klucz przesyłania (upload) z EAS — tym podpisany jest AAB/APK prosto z EAS (np. instalacja
//     ręczna/testy przed sklepem).
export const ANDROID_SHA256_FINGERPRINTS = [
  '77:C2:6C:D4:33:27:90:A3:C1:FC:84:0A:33:DE:97:C7:3F:C7:C1:33:B7:78:AD:61:0F:65:9A:1A:BF:70:B0:11', // Play App Signing
  'EA:A7:B9:0F:A5:A5:E0:A1:E9:3D:78:D7:FF:72:07:9B:D0:EF:3F:A0:2C:DF:3C:4E:93:23:D7:DF:D8:8C:4D:F3', // EAS upload key
];

// Długość publicznego tokenu tłumaczenia — wzorzec dokładnie tej długości (a nie „cokolwiek po
// /tlumaczenie/”) nie łapie konsoli/oryginału ani wersji „tylko przeglądarka”.
export const INTERP_TOKEN_LENGTH = 32;

export function appleAppSiteAssociation() {
  const token = '?'.repeat(INTERP_TOKEN_LENGTH);
  return {
    applinks: {
      details: [
        {
          appIDs: IOS_BUNDLE_IDS.map((b) => `${APPLE_TEAM_ID}.${b}`),
          // Kolejność ma znaczenie: pierwszy pasujący wpis wygrywa — wykluczenia najpierw.
          components: [
            { '/': '/tlumaczenie/konsola/*', exclude: true, comment: 'Konsola tłumacza — web' },
            { '/': '/tlumaczenie/oryginal/*', exclude: true, comment: 'Oryginał (stół akustyka) — web' },
            { '/': '/tlumaczenie/sluchaj/*', comment: 'Słuchanie z konta' },
            { '/': `/tlumaczenie/${token}`, comment: 'Publiczny link/QR słuchacza' },
          ],
        },
      ],
    },
  };
}

export function assetLinks() {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
      },
    },
  ];
}

const sendJson = (reply, body) =>
  reply
    .code(200)
    .header('Content-Type', 'application/json')
    // Apple i Google i tak trzymają własną kopię (CDN Apple, weryfikator Androida) — godzina wystarczy.
    .header('Cache-Control', 'public, max-age=3600')
    .send(JSON.stringify(body));

// Bez requireTenant: ta sama treść na avenit.pl, app./api. i każdej subdomenie kościoła.
export default async function appLinksRoutes(app) {
  app.get('/.well-known/apple-app-site-association', async (req, reply) => sendJson(reply, appleAppSiteAssociation()));
  app.get('/.well-known/assetlinks.json', async (req, reply) => sendJson(reply, assetLinks()));
}
