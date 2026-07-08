// Port edge function test-smtp: test połączenia SMTP z konfiguracji app_smtp_config
// (nodemailer zamiast denomailer; hasło szyfrowane AES-256-GCM).
// Oryginał: supabase/functions/test-smtp/index.ts.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { decryptPassword } from '../lib/mailcrypto.js';

export const name = 'test-smtp';

export default async function handler(req, reply) {
  try {
    if (!config.MAIL_ENCRYPTION_SECRET) {
      return reply.code(500).send({ success: false, error: 'Brak klucza szyfrowania MAIL_ENCRYPTION_SECRET' });
    }

    const { config_id } = req.body || {};

    if (!config_id) {
      return reply.code(400).send({ success: false, error: 'Brak config_id' });
    }

    // Pobierz konfigurację SMTP z bazy.
    const { rows: configRows } = await req.db.query(
      `SELECT * FROM app_smtp_config WHERE id = $1`,
      [config_id]
    );
    const smtpConfig = configRows[0];

    if (!smtpConfig) {
      return reply.code(404).send({ success: false, error: 'Nie znaleziono konfiguracji SMTP' });
    }

    if (!smtpConfig.smtp_pass_encrypted) {
      return reply.code(400).send({ success: false, error: 'Brak hasła w konfiguracji' });
    }

    // Odszyfruj hasło.
    const password = await decryptPassword(smtpConfig.smtp_pass_encrypted, config.MAIL_ENCRYPTION_SECRET);

    // Testuj połączenie SMTP (port 465 lub smtp_secure => SSL/TLS od początku).
    const secure = smtpConfig.smtp_port === 465 || smtpConfig.smtp_secure === true;

    const transport = nodemailer.createTransport({
      host: smtpConfig.smtp_host,
      port: smtpConfig.smtp_port,
      secure,
      auth: {
        user: smtpConfig.smtp_user,
        pass: password,
      },
    });

    try {
      // Wyślij testowego maila do siebie.
      await transport.sendMail({
        from: smtpConfig.smtp_from,
        to: [smtpConfig.smtp_user],
        subject: 'Test połączenia SMTP - Avenit',
        text: 'To jest wiadomość testowa z Avenit.\n\nJeśli otrzymałeś ten email, konfiguracja SMTP działa poprawnie!',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #ec4899;">Test połączenia SMTP</h2>
            <p>To jest wiadomość testowa z <strong>Avenit</strong>.</p>
            <p style="color: #22c55e;">✓ Jeśli otrzymałeś ten email, konfiguracja SMTP działa poprawnie!</p>
            <hr style="margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              Serwer: ${smtpConfig.smtp_host}:${smtpConfig.smtp_port}<br>
              Użytkownik: ${smtpConfig.smtp_user}<br>
              Data testu: ${new Date().toLocaleString('pl-PL')}
            </p>
          </div>
        `,
      });

      // Zaktualizuj status testu w bazie.
      await req.db.query(
        `UPDATE app_smtp_config
            SET last_test_at = NOW(), last_test_status = 'success', last_test_error = NULL
          WHERE id = $1`,
        [config_id]
      );

      return reply.send({
        success: true,
        message: `Email testowy wysłany na ${smtpConfig.smtp_user}`,
      });
    } catch (smtpError) {
      req.log.error({ err: smtpError }, 'SMTP test error');

      // Zaktualizuj status błędu w bazie.
      await req.db.query(
        `UPDATE app_smtp_config
            SET last_test_at = NOW(), last_test_status = 'failed', last_test_error = $2
          WHERE id = $1`,
        [config_id, smtpError.message]
      );

      // Oryginał zwracał 200 z success: false.
      return reply.send({
        success: false,
        error: `Błąd SMTP: ${smtpError.message}`,
      });
    }
  } catch (err) {
    req.log.error({ err }, 'Test SMTP error');
    return reply.code(500).send({ success: false, error: err.message });
  }
}
