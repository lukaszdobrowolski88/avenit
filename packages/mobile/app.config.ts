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
    // Białe tło (jak ekran logowania) — splash-icon jest 512×512 bez alfy (logo na bieli),
    // więc na pomarańczowym tle dawał białą płytę + pomarańczowe pasy. Na bieli = czysto.
    backgroundColor: '#ffffff',
  },
  ios: {
    bundleIdentifier: baseId + suffix,
    supportsTablet: true,
    infoPlist: {
      NSFaceIDUsageDescription: 'Użyj Face ID aby odblokować aplikację Avenit bez wpisywania hasła.',
      NSCalendarsUsageDescription: 'Aplikacja eksportuje wydarzenia do Twojego kalendarza.',
      NSPhotoLibraryUsageDescription: 'Wybierz zdjęcie do wysłania w wiadomości.',
      NSCameraUsageDescription: 'Zrób zdjęcie do wysłania w wiadomości.',
      NSMicrophoneUsageDescription: 'Nagraj wiadomość głosową w czacie.',
    },
  },
  android: {
    package: baseId + suffix,
    // FCM (push). google-services.json musi zawierać pakiet danego wariantu —
    // obecnie tylko pl.avenit.app.preview; przed buildem produkcyjnym dodaj
    // pl.avenit.app w Firebase i pobierz nowy plik.
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
    'expo-calendar',
    [
      'expo-av',
      {
        microphonePermission: 'Nagraj wiadomość głosową w czacie.',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          kotlinVersion: '1.9.25',
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
