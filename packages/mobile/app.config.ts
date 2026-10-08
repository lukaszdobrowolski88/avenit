// `@expo/config` w tej wersji nie reeksportuje typu ExpoConfig — luźny alias lokalny.
// (Typ i tak jest wymazywany w runtime; expo czyta wyeksportowany obiekt konfiguracji.)
type ExpoConfig = Record<string, any>;

const variant = process.env.APP_VARIANT ?? 'production';
const isPreview = variant === 'preview';
const isDev = variant === 'development';

// Identyfikator aplikacji (Android applicationId / iOS bundle ID). Avenit, nie legacy
// 'com.schtomy.app' (apka nigdy nie była w sklepie, więc nie było czego chronić).
// NIEODWRACALNY po utworzeniu wpisu w Play/App Store.
const baseId = 'pl.avenit.app';
const suffix = isPreview ? '.preview' : isDev ? '.dev' : '';

const config: ExpoConfig = {
  name: isPreview ? 'Avenit (preview)' : isDev ? 'Avenit (dev)' : 'Avenit',
  slug: 'avenit',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: ['avenit', 'schtomy'],
  icon: './assets/icon.png',
  // Aplikacja ma tylko jasny wygląd — systemowe wybieraki i okna też jasne (inaczej w trybie
  // ciemnym telefonu kółka daty/godziny i Alerty były ciemne na tle jasnej apki).
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    // Logo „avenit · CHURCH MANAGER” (grafiki_avenit/logo, słód na papierze) na przezroczystym tle;
    // tło = papier, jak ekran logowania — przejście bez błysku.
    backgroundColor: '#F6F4EE',
  },
  // Prośby o uprawnienia per język telefonu (en = recenzent Apple). Lokalizacje decydują też,
  // jakie języki App Store pokazuje przy apce — bez nich byłby sam angielski. Ukraiński dopisz,
  // gdy interfejs mobilki będzie przetłumaczony (dziś t() obejmuje tylko część ekranów).
  locales: {
    pl: './locales/pl.json',
    en: './locales/en.json',
  },
  ios: {
    bundleIdentifier: baseId + suffix,
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
      NSCameraUsageDescription: 'Avenit używa aparatu, aby zrobić zdjęcie i dołączyć je do wiadomości lub zadania.',
      NSMicrophoneUsageDescription: 'Avenit używa mikrofonu do nagrywania wiadomości głosowych w czacie.',
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
    // FCM (push). google-services.json musi zawierać pakiet danego wariantu — projekt Firebase
    // avenit-app ma pl.avenit.app (produkcja) i pl.avenit.app.preview. Nowy wariant = dodaj
    // aplikację Android w Firebase i pobierz plik ponownie.
    googleServicesFile: './google-services.json',
    permissions: ['android.permission.RECORD_AUDIO'],
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
      'expo-av',
      {
        microphonePermission: 'Avenit używa mikrofonu do nagrywania wiadomości głosowych w czacie.',
      },
    ],
    // Xcode 26 + RN 0.76: łatka fmt (consteval) — patrz plugins/with-xcode26-fmt.js.
    './plugins/with-xcode26-fmt',
    [
      'expo-build-properties',
      {
        android: {
          kotlinVersion: '1.9.25',
          // Google Play od 31.08.2026 przyjmuje nowe apki i aktualizacje tylko z targetSdk 36
          // (Android 16). Domyślnie RN 0.76 celuje w 34. Android 16 wymusza rysowanie pod paskami
          // systemowymi (edge-to-edge) — ekrany biorą odstępy z useSafeAreaInsets.
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
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? null,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  // Aktualizacje OTA (eas update): zmiany tylko w JS/TS trafiają na telefony bez nowego builda.
  // runtimeVersion = wersja aplikacji — po zmianie natywnej podbij `version` i zbuduj od nowa.
  runtimeVersion: { policy: 'appVersion' },
  ...(process.env.EAS_PROJECT_ID
    ? { updates: { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`, fallbackToCacheTimeout: 0 } }
    : {}),
};

export default config;
