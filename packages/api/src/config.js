// Konfiguracja z env — jedno miejsce, walidacja przy starcie.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Domena bazowa platformy: tenant = <slug>.APP_DOMAIN, panel = admin.APP_DOMAIN
  APP_DOMAIN: z.string().default('localhost'),
  // Pełny publiczny URL API (dla linków w mailach itp.)
  PUBLIC_API_URL: z.string().default('http://localhost:3001'),

  // Postgres — użytkownik musi mieć prawo CREATE DATABASE (prowizjonowanie tenantów)
  DATABASE_URL: z.string().default('postgres://avenit:avenit@localhost:5432/avenit_platform'),

  JWT_SECRET: z.string().default('dev-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  // Pliki tenantów: /srv/storage/<tenant>/<bucket>/<path>
  STORAGE_DIR: z.string().default('./storage'),

  // Analityka (bazy GeoIP domyślnie na wolumenie storage: <STORAGE_DIR>/geoip)
  GEOIP_DIR: z.string().optional(),
  ANALYTICS_RAW_RETENTION_DAYS: z.coerce.number().default(400),
  // Opcjonalnie: dokładniejsze bazy MaxMind GeoLite2 zamiast DB-IP Lite
  MAXMIND_LICENSE_KEY: z.string().optional(),

  // Usługi zewnętrzne (opcjonalne — funkcje zgłoszą brak przy użyciu)
  SENDGRID_API_KEY: z.string().optional(),
  MAILING_FROM_EMAIL: z.string().default('noreply@avenit.pl'),
  MAILING_FROM_NAME: z.string().default('Avenit'),
  // Adresat powiadomień o zgłoszeniach z formularza na avenit.pl
  LANDING_CONTACT_EMAIL: z.string().default('lukasz@avenit.pl'),
  // Alert do operatora platformy o nowym zgłoszeniu treści (bez treści; pusty = wyłączony)
  MODERATION_ALERT_EMAIL: z.string().default('lukasz@avenit.pl'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('noreply@avenit.pl'),
  SMSAPI_TOKEN: z.string().optional(),
  SMSAPI_DEFAULT_SENDER: z.string().optional(),
  SMSAPI_API_URL: z.string().default('https://api.smsapi.pl'),
  SMSAPI_WEBHOOK_SECRET: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().default('mailto:lukasz@avenit.pl'),
  MAIL_ENCRYPTION_SECRET: z.string().optional(),
  P24_MERCHANT_ID: z.string().optional(),
  P24_POS_ID: z.string().optional(),
  P24_CRC: z.string().optional(),
  P24_API_KEY: z.string().optional(),
  P24_SANDBOX: z.string().default('true'),
  DEFAULT_SMTP_HOST: z.string().optional(),
  DEFAULT_SMTP_PORT: z.coerce.number().optional(),
  DEFAULT_SMTP_USER: z.string().optional(),
  DEFAULT_SMTP_PASS: z.string().optional(),

  // SSO platformowe (jedna aplikacja OAuth na dostawcę dla WSZYSTKICH tenantów).
  // Jeden URI przekierowania: https://app.APP_DOMAIN/api/auth/oauth/<provider>/callback
  // Tenant tylko włącza SSO; może też podać własne poświadczenia (per-tenant override).
  SSO_GOOGLE_CLIENT_ID: z.string().optional(),
  SSO_GOOGLE_CLIENT_SECRET: z.string().optional(),
  SSO_MICROSOFT_CLIENT_ID: z.string().optional(),
  SSO_MICROSOFT_CLIENT_SECRET: z.string().optional(),
  SSO_MICROSOFT_TENANT: z.string().default('common'),

  // Integracje Google Workspace / Microsoft 365 (src/integrations, docs/integrations-workspace.md).
  // Jeden URI przekierowania: https://app.APP_DOMAIN/api/integrations/oauth/<provider>/callback
  //  MS_*     — platformowa aplikacja WIELODOSTĘPNA Entra ID (katalog: uprawnienie aplikacji
  //             User.Read.All + zgoda administratora kościoła; tokeny client credentials per katalog).
  //  GOOGLE_* — platformowy klient OAuth Google (opcjonalnie; kościół może podać własny, a gdy ma
  //             własne SSO Google — jego klient jest używany ponownie).
  // Puste = karta pokazuje „skonfiguruj na platformie” albo korzysta z własnej aplikacji kościoła.
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Faza 3 (pliki z Dysku Google): klucz API przeglądarki dla Google Picker (ograniczony do
  // odwołań HTTP *.APP_DOMAIN, tylko Picker API) i numer projektu Google Cloud (appId). Puste
  // appId = numer z identyfikatora klienta OAuth. Kościół może podać własne (Ustawienia → Integracje).
  GOOGLE_PICKER_API_KEY: z.string().optional(),
  GOOGLE_PICKER_APP_ID: z.string().optional(),

  // Połączenia audio/wideo (LiveKit SFU, usługa `livekit` w docker-compose). Bez klucza i sekretu
  // połączenia są wyłączone: fn call-* → 503 calls_disabled, web chowa przyciski.
  //  LIVEKIT_URL  — publiczny adres sygnalizacji dla klientów (domyślnie wss://rtc.APP_DOMAIN),
  //  LIVEKIT_HOST — adres wewnętrzny dla API (RoomService: kończenie pokoju, lista pokoi).
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_HOST: z.string().default('http://livekit:7880'),

  // Natywne dzwonienie w aplikacji mobilnej (VoIP push — src/push/voip.js). Pliki kluczy z katalogu
  // ./secrets montowanego w compose (/run/secrets/avenit, tylko do odczytu); brak pliku = dany kanał
  // VoIP wyłączony (dzwonienie idzie zwykłym pushem Expo).
  APNS_KEY_PATH: z.string().default('/run/secrets/avenit/AuthKey_27A63CM38V.p8'),
  APNS_KEY_ID: z.string().default('27A63CM38V'),
  APNS_TEAM_ID: z.string().default('N4C97P5LL8'),
  APNS_BUNDLE_ID: z.string().default('pl.avenit.app'),
  FCM_SERVICE_ACCOUNT_PATH: z.string().default('/run/secrets/avenit/avenit-app-firebase-adminsdk-fbsvc-f52d1c5ece.json'),
});

export const config = schema.parse(process.env);

export const isProd = config.NODE_ENV === 'production';
