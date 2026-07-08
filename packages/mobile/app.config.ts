import type { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT ?? 'production';
const isPreview = variant === 'preview';
const isDev = variant === 'development';

// Bundle ID celowo pozostaje 'com.schtomy.app' — zmiana identyfikatora oznacza
// NOWĄ aplikację w App Store/Google Play (utrata instalacji i tokenów push).
const baseId = 'com.schtomy.app';
const suffix = isPreview ? '.preview' : isDev ? '.dev' : '';

const config: ExpoConfig = {
  name: isPreview ? 'Avenit (preview)' : isDev ? 'Avenit (dev)' : 'Avenit',
  slug: 'avenit',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: ['avenit', 'schtomy'],
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#d97706',
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
    permissions: ['android.permission.RECORD_AUDIO'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#d97706',
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
        color: '#d97706',
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
};

export default config;
