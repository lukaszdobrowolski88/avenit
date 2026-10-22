// `@expo/config` w tej wersji nie reeksportuje typu ExpoConfig — luźny alias lokalny.
// (Typ i tak jest wymazywany w runtime; expo czyta wyeksportowany obiekt konfiguracji.)
type ExpoConfig = Record<string, any>;

const variant = process.env.APP_VARIANT ?? 'production';
const isPreview = variant === 'preview';
const isDev = variant === 'development';

// Teksty próśb o mikrofon i aparat — jedno źródło dla infoPlist i pluginów (expo-audio, WebRTC,
// CallKit), żeby żaden plugin nie wstawił angielskiego domyślnego tekstu.
const MIC_TEXT = 'Avenit używa mikrofonu do nagrywania wiadomości głosowych w czacie oraz w rozmowach audio i wideo.';
const CAMERA_TEXT = 'Avenit używa aparatu, aby zrobić zdjęcie i dołączyć je do wiadomości lub zadania, a także w rozmowach wideo.';

// Identyfikator aplikacji (Android applicationId / iOS bundle ID). Avenit, nie legacy
// 'com.schtomy.app' (apka nigdy nie była w sklepie, więc nie było czego chronić).
// NIEODWRACALNY po utworzeniu wpisu w Play/App Store.
const baseId = 'pl.avenit.app';
const suffix = isPreview ? '.preview' : isDev ? '.dev' : '';

// Universal Links (iOS) / App Links (Android): link z kodu QR tłumaczenia na żywo
// (https://<kościół>.avenit.pl/tlumaczenie/<token>) otwiera aplikację, gdy jest zainstalowana —
// inaczej przeglądarkę. Pliki weryfikacyjne serwuje API na każdym hoście
// (packages/api/src/public/app-links.js — tam też identyfikatory aplikacji i odciski certyfikatów).
// Zakres: /tlumaczenie/<token> (token = dokładnie 32 znaki) i /tlumaczenie/sluchaj/<id>; konsola
// tłumacza i „Oryginał” zostają na webie. Zmiana = zmiana natywna (nowy build, nie OTA).
// Wariant dev (pl.avenit.app.dev) bez linków — nie ma go w plikach weryfikacyjnych.
const APP_LINK_DOMAIN = 'avenit.pl';
const appLinks = !isDev;
const INTERP_TOKEN_LENGTH = 32;
const appLinkData = [`*.${APP_LINK_DOMAIN}`, APP_LINK_DOMAIN].flatMap((host) => [
  // Android nie zna klas znaków ani wykluczeń: „.” = dowolny znak, więc wzorzec dokładnej długości
  // tokenu nie łapie /tlumaczenie/konsola/<id> ani /tlumaczenie/oryginal/<id> (id wydarzeń są krótkie),
  // ani wersji „tylko przeglądarka” /tlumaczenie/<token>/.
  { scheme: 'https', host, pathPattern: `/tlumaczenie/${'.'.repeat(INTERP_TOKEN_LENGTH)}` },
  { scheme: 'https', host, pathPrefix: '/tlumaczenie/sluchaj/' },
]);

const config: ExpoConfig = {
  name: isPreview ? 'Avenit (preview)' : isDev ? 'Avenit (dev)' : 'Avenit',
  slug: 'avenit',
  // 1.1.0 = Expo SDK 57 (nowy runtime natywny — OTA dla 1.0.x publikuje się osobno).
  // 1.2.0 = Universal Links / App Links (entitlement associated-domains, intent-filter) — BEZ nowych
  // modułów natywnych, więc runtime zostaje 1.1.0 (niżej): jedna aktualizacja OTA trafia do 1.1.0 i 1.2.0.
  version: '1.2.0',
  orientation: 'portrait',
  scheme: ['avenit', 'schtomy'],
  icon: './assets/icon.png',
  // Aplikacja ma tylko jasny wygląd — systemowe wybieraki i okna też jasne (inaczej w trybie
  // ciemnym telefonu kółka daty/godziny i Alerty były ciemne na tle jasnej apki).
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    // Logo „avenit · CHURCH MANAGER” (grafiki_avenit/logo, słód na papierze) na przezroczystym tle;
    // tło = papier, jak ekran logowania — przejście bez błysku.
    backgroundColor: '#F6F4EE',
  },
  // Prośby o uprawnienia per język telefonu (en = recenzent Apple) — klucze pod "ios" (SDK 55+
  // tłumaczy też zasoby Androida; płaskie klucze iOS łamały lint wydania). Lokalizacje decydują też,
  // jakie języki App Store pokazuje przy apce — bez nich byłby sam angielski. Ukraiński dopisz,
  // gdy interfejs mobilki będzie przetłumaczony (dziś t() obejmuje tylko część ekranów).
  locales: {
    pl: './locales/pl.json',
    en: './locales/en.json',
  },
  ios: {
    bundleIdentifier: baseId + suffix,
    // applinks:*.avenit.pl — Apple pobiera AASA z avenit.pl; avenit.pl osobno (gwiazdka nie obejmuje
    // domeny głównej). EAS przy buildzie sam włącza „Associated Domains” w App ID i profilu.
    ...(appLinks ? { associatedDomains: [`applinks:*.${APP_LINK_DOMAIN}`, `applinks:${APP_LINK_DOMAIN}`] } : {}),
    // Tylko iPhone: układ jest projektowany pod telefon w pionie. Na iPadzie apka i tak działa
    // (tryb zgodności iPhone). Wsparcia iPada nie da się zdjąć po pierwszej publikacji,
    // a dodać można zawsze — wtedy App Store wymaga też zrzutów 13".
    supportsTablet: false,
    config: {
      // Tylko HTTPS/TLS systemu — zwolnione z deklaracji eksportowej (ITSAppUsesNonExemptEncryption=NO),
      // App Store Connect nie pyta o szyfrowanie przy każdym buildzie.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      CFBundleDevelopmentRegion: 'pl',
      NSFaceIDUsageDescription: 'Użyj Face ID, aby odblokować aplikację Avenit bez wpisywania hasła.',
      NSCalendarsUsageDescription: 'Avenit dodaje wybrane przez Ciebie wydarzenia kościoła do kalendarza w telefonie.',
      NSPhotoLibraryUsageDescription:
        'Avenit potrzebuje dostępu do zdjęć, aby ustawić Twoje zdjęcie profilowe albo dołączyć zdjęcie do wiadomości lub zadania.',
      NSCameraUsageDescription: CAMERA_TEXT,
      NSMicrophoneUsageDescription: MIC_TEXT,
      // Rozmowy audio/wideo (CallKit): voip — przychodzące połączenia z pushu VoIP (PushKit) także
      // przy zamkniętej apce; audio — rozmowa trwa po zablokowaniu ekranu / wyjściu z apki.
      // (Plugin expo-callkit-telecom dopisuje je też sam — tu jawnie, żeby było widać.)
      UIBackgroundModes: ['voip', 'audio'],
    },
    // Manifest prywatności (wymóg Apple od 05.2024): powody użycia „required reason API” przez
    // React Native i moduły Expo. Apple nie czyta poprawnie manifestów statycznych podów,
    // więc deklarujemy je w manifeście aplikacji. Danych do śledzenia nie zbieramy.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['0A2A.1', '3B52.1', 'C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
    },
  },
  android: {
    package: baseId + suffix,
    // App Links (autoVerify): weryfikacja przez https://avenit.pl/.well-known/assetlinks.json
    // (host z gwiazdką) — pakiet + SHA-256 klucza podpisu Google Play i klucza przesyłania z EAS.
    ...(appLinks
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: appLinkData,
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
    // FCM (push). google-services.json musi zawierać pakiet danego wariantu — projekt Firebase
    // avenit-app ma pl.avenit.app (produkcja) i pl.avenit.app.preview. Nowy wariant = dodaj
    // aplikację Android w Firebase i pobierz plik ponownie.
    googleServicesFile: './google-services.json',
    // RECORD_AUDIO — wiadomości głosowe i rozmowy; CAMERA — rozmowy wideo. Uprawnienia połączeń
    // (MANAGE_OWN_CALLS, FOREGROUND_SERVICE_PHONE_CALL, USE_FULL_SCREEN_INTENT) dokłada manifest
    // expo-callkit-telecom.
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
    // Plugin WebRTC dopisuje SYSTEM_ALERT_WINDOW (rysowanie nad innymi apkami) — niepotrzebne,
    // a Google Play pyta o nie osobno.
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
    // Mapa grup (react-native-maps). Android wymaga klucza Google Maps — podaj go
    // przez env GOOGLE_MAPS_ANDROID_KEY (w profilu EAS). iOS używa Apple Maps bez klucza.
    // Bez klucza mapa na Androidzie będzie pusta; reszta apki działa normalnie.
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY },
    },
    adaptiveIcon: {
      // Znak „a” Avenit (słód) na kurkumie — jak awatar marki (grafiki_avenit/avatar).
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFBE0B',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-local-authentication',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#FFBE0B',
        // Dźwięk przyjścia wiadomości dla powiadomień w tle (iOS: payload sound 'receive.wav').
        // Działa od najbliższego builda natywnego; starsze buildy grają dźwięk systemowy.
        sounds: ['./assets/sounds/receive.wav'],
      },
    ],
    [
      'expo-calendar',
      {
        // Bez tego plugin wstawia ogólnikowe „Allow $(PRODUCT_NAME) to access your calendars”
        // (także dla przypomnień, których apka nie używa) — częsty powód odrzucenia (5.1.1).
        calendarPermission: 'Avenit dodaje wybrane przez Ciebie wydarzenia kościoła do kalendarza w telefonie.',
        remindersPermission: 'Avenit nie korzysta z aplikacji Przypomnienia.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: MIC_TEXT,
        // Bez odtwarzania w tle: domyślnie plugin dodaje usługę Androida „media playback”
        // (FOREGROUND_SERVICE_MEDIA_PLAYBACK) — nieużywaną, a w Google Play wymagającą osobnej
        // deklaracji. Tło dla rozmów zapewnia CallKit/Telecom (iOS: UIBackgroundModes voip+audio).
        enableBackgroundPlayback: false,
      },
    ],
    // Rozmowy audio/wideo natywnie: LiveKit (WebRTC) + CallKit (iOS) / Core-Telecom (Android).
    // Wymagają nowego builda natywnego (nie OTA).
    [
      '@livekit/react-native-expo-plugin',
      {
        // Android: tryb rozmowy (echo cancellation, słuchawka/głośnik jak w telefonie).
        android: { audioType: 'communication' },
      },
    ],
    [
      '@config-plugins/react-native-webrtc',
      { cameraPermission: CAMERA_TEXT, microphonePermission: MIC_TEXT },
    ],
    [
      'expo-callkit-telecom',
      {
        microphonePermission: MIC_TEXT,
        cameraPermission: CAMERA_TEXT,
        // Jak serwer: po 45 s dzwonienia połączenie jest „nieodebrane”.
        incomingCallTimeout: 45,
        // Dzwoniący czeka trochę dłużej niż serwer (jak web OUTGOING_TIMEOUT_MS = 55 s).
        outgoingCallTimeout: 55,
        includesCallsInRecents: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // Google Play od 31.08.2026 przyjmuje nowe apki i aktualizacje tylko z targetSdk 36
          // (Android 16). Android 16 wymusza rysowanie pod paskami systemowymi (edge-to-edge) —
          // ekrany biorą odstępy z useSafeAreaInsets.
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: '36.0.0',
        },
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    tenant: process.env.EXPO_PUBLIC_TENANT,
    // Wariant builda — środowisko APNs tokenu VoIP (development = sandbox, reszta = production).
    appVariant: variant,
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? null,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  // Aktualizacje OTA (eas update): zmiany tylko w JS/TS trafiają na telefony bez nowego builda.
  // runtimeVersion = wersja ABI natywnego, NIE wersja w sklepie. 1.2.0 różni się od 1.1.0 tylko
  // entitlementem/intent-filtrem (bez nowych modułów natywnych), więc dzielą runtime '1.1.0'.
  // Po dodaniu/aktualizacji modułu natywnego albo podniesieniu SDK ustaw tu nową wartość (np. '1.3.0').
  runtimeVersion: '1.1.0',
  ...(process.env.EAS_PROJECT_ID
    ? { updates: { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`, fallbackToCacheTimeout: 0 } }
    : {}),
};

export default config;
