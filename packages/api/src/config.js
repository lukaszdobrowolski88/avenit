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

  // Usługi zewnętrzne (opcjonalne — funkcje zgłoszą brak przy użyciu)
  SENDGRID_API_KEY: z.string().optional(),
  MAILING_FROM_EMAIL: z.string().default('noreply@avenit.pl'),
  MAILING_FROM_NAME: z.string().default('Avenit'),
  // Adresat powiadomień o zgłoszeniach z formularza na avenit.pl
  LANDING_CONTACT_EMAIL: z.string().default('kontakt@avenit.pl'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('noreply@avenit.pl'),
  SMSAPI_TOKEN: z.string().optional(),
  SMSAPI_DEFAULT_SENDER: z.string().optional(),
  SMSAPI_API_URL: z.string().default('https://api.smsapi.pl'),
  SMSAPI_WEBHOOK_SECRET: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().default('mailto:kontakt@avenit.pl'),
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
});

export const config = schema.parse(process.env);

export const isProd = config.NODE_ENV === 'production';
