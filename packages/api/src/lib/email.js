// Wysyłka e-maili systemowych: SendGrid (API) z fallbackiem na SMTP (nodemailer).
import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function sendEmail({ to, subject, html, text, from, fromName, replyTo, attachments }) {
  const fromEmail = from || config.MAILING_FROM_EMAIL;
  const senderName = fromName || config.MAILING_FROM_NAME;

  // Resend — preferowany, gdy skonfigurowany. Dostawca transakcyjny robi prawidłowy
  // routing MX, więc omija problem hostingu SMTP traktującego cudzą domenę jako lokalną
  // (patrz: maile na @schwro.pl odbijane przez lh.pl). Nadawca musi być na domenie
  // zweryfikowanej w Resend (RESEND_FROM_EMAIL / MAILING_FROM_EMAIL).
  if (config.RESEND_API_KEY) {
    const resendFrom = from || config.RESEND_FROM_EMAIL || config.MAILING_FROM_EMAIL;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderName ? `${senderName} <${resendFrom}>` : resendFrom,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.contentBase64, ...(a.type ? { content_type: a.type } : {}) })) }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return { ok: true, provider: 'resend' };
  }

  if (config.SENDGRID_API_KEY) {
    const body = {
      personalizations: [{ to: (Array.isArray(to) ? to : [to]).map((e) => ({ email: e })) }],
      from: { email: fromEmail, name: senderName },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject,
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        ...(html ? [{ type: 'text/html', value: html }] : []),
      ],
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              content: a.contentBase64,
              filename: a.filename,
              type: a.type || 'application/octet-stream',
              disposition: 'attachment',
            })),
          }
        : {}),
    };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    }
    return { ok: true, provider: 'sendgrid' };
  }

  if (config.DEFAULT_SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: config.DEFAULT_SMTP_HOST,
      port: config.DEFAULT_SMTP_PORT || 465,
      secure: (config.DEFAULT_SMTP_PORT || 465) === 465,
      auth: config.DEFAULT_SMTP_USER
        ? { user: config.DEFAULT_SMTP_USER, pass: config.DEFAULT_SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from: `"${senderName}" <${fromEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.type,
      })),
    });
    return { ok: true, provider: 'smtp' };
  }

  throw new Error('Brak konfiguracji e-mail (SENDGRID_API_KEY lub DEFAULT_SMTP_*)');
}

export async function sendResetPasswordEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Ustaw nowe hasło — Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset hasła</h2>
        <p>Otrzymaliśmy prośbę o ustawienie nowego hasła dla Twojego konta w systemie <strong>Avenit</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Ustaw nowe hasło</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Link jest ważny przez 1 godzinę. Jeśli to nie Ty — zignoruj tę wiadomość.</p>
      </div>`,
    text: `Ustaw nowe hasło: ${link} (link ważny 1 godzinę)`,
  });
}

// Link do zmiany hasła wysłany z Ustawień → Użytkownicy (fn admin-send-password-reset). Osoba
// z samym action:settings:manage_users nie ustawia już cudzego hasła wprost (audyt r6) — wysyła
// właścicielowi konta link, a hasło ustawia on sam. Szablon w marce (papier, słód, kurkuma).
const BRAND = {
  paper: '#F6F4EE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', turmeric: '#FFBE0B',
};
const BRAND_FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoursLabel = (h) => (h === 1 ? '1 godzinę' : h % 10 >= 2 && h % 10 <= 4 && (h % 100 < 10 || h % 100 >= 20) ? `${h} godziny` : `${h} godzin`);

export function adminPasswordResetEmail({ name = '', link, hours = 24, orgName = '' } = {}) {
  const C = BRAND;
  const F = BRAND_FONT;
  const hello = name ? `Cześć, ${escHtml(name)}!` : 'Cześć!';
  const where = ` w <strong>Avenit</strong>${orgName ? ` (${escHtml(orgName)})` : ''}`;
  const valid = hoursLabel(hours);
  const subject = 'Ustaw nowe hasło — Avenit';
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${subject}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;600;700;800&display=swap" rel="stylesheet">
<style>
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (max-width: 480px) { .card { padding: 28px 22px !important; } .h1 { font-size: 26px !important; line-height: 32px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">Link do ustawienia nowego hasła — ważny ${valid}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
  <tr><td align="center" style="padding:32px 16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 6px 16px;font-family:${F};font-size:15px;line-height:20px;font-weight:800;color:${C.malt};">avenit<span style="color:${C.turmeric};">.</span></td></tr>
      <tr><td class="card" style="background:#FFFFFF;border-radius:24px;padding:36px 32px 32px;">
        <h1 class="h1" style="margin:0 0 12px;font-family:${F};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.malt};">Nowe <span style="font-weight:300;">hasło</span><span style="color:${C.turmeric};">.</span></h1>
        <p style="margin:0 0 8px;font-family:${F};font-size:15px;line-height:23px;color:${C.text};">${hello} Administrator Twojej wspólnoty wysłał Ci link do ustawienia nowego hasła do Twojego konta${where}.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr><td align="center" bgcolor="${C.turmeric}" style="border-radius:999px;background:${C.turmeric};">
            <a href="${escHtml(link)}" target="_blank" style="display:block;padding:15px 12px;font-family:${F};font-size:16px;line-height:20px;font-weight:800;color:${C.malt};text-decoration:none;border-radius:999px;">Ustaw nowe hasło</a>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-family:${F};font-size:13px;line-height:19px;color:${C.muted};">Link jest ważny ${valid} i działa jeden raz. Dotychczasowe hasło działa, dopóki nie ustawisz nowego. Jeśli nie prosiłeś(-aś) o zmianę — zignoruj tę wiadomość.</p>
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${F};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">Wiadomość wysłana automatycznie z aplikacji Avenit.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  const text = [
    `${name ? `Cześć, ${name}!` : 'Cześć!'} Administrator Twojej wspólnoty wysłał Ci link do ustawienia nowego hasła do Twojego konta w Avenit${orgName ? ` (${orgName})` : ''}.`,
    '',
    `Ustaw nowe hasło: ${link}`,
    '',
    `Link jest ważny ${valid} i działa jeden raz. Dotychczasowe hasło działa, dopóki nie ustawisz nowego. Jeśli nie prosiłeś(-aś) o zmianę — zignoruj tę wiadomość.`,
  ].join('\n');
  return { subject, html, text };
}

export async function sendAdminPasswordResetEmail(to, opts = {}) {
  const { subject, html, text } = adminPasswordResetEmail(opts);
  return sendEmail({ to, subject, html, text });
}

// Rejestracja (tryb otwarty): potwierdzenie adresu e-mail.
export async function sendVerifyEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Potwierdź adres e-mail — Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Witaj w Avenit</h2>
        <p>Dziękujemy za rejestrację. Aby aktywować konto, potwierdź swój adres e-mail.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Potwierdź e-mail</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Link jest ważny przez 24 godziny. Jeśli to nie Ty — zignoruj tę wiadomość.</p>
      </div>`,
    text: `Potwierdź e-mail: ${link} (link ważny 24 godziny)`,
  });
}

// Zaproszenie do systemu — link do ustawienia hasła (ważny 7 dni). Wysyłane przy zakładaniu
// konta przez administratora.
export async function sendInviteEmail(to, { name, link } = {}) {
  return sendEmail({
    to,
    subject: 'Zaproszenie do Avenit — ustaw hasło',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Witaj${name ? `, ${name}` : ''}!</h2>
        <p>Utworzono dla Ciebie konto w systemie <strong>Avenit</strong>. Ustaw hasło, aby się zalogować.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Ustaw hasło</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Link jest ważny przez 7 dni.</p>
      </div>`,
    text: `Ustaw hasło do konta Avenit: ${link} (link ważny 7 dni)`,
  });
}

// Ogólne powiadomienie o zmianie konta (blokada / odblokowanie / rola / reset 2FA).
export async function sendAccountNoticeEmail(to, { name, subject, intro } = {}) {
  return sendEmail({
    to,
    subject: subject || 'Zmiana w Twoim koncie — Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Cześć${name ? `, ${name}` : ''}</h2>
        <p>${intro}</p>
        <p style="color: #6b7280; font-size: 13px;">Jeśli to nie było zamierzone, skontaktuj się z administratorem swojej organizacji.</p>
      </div>`,
    text: intro,
  });
}

// Powitanie po aktywacji konta (zatwierdzenie admina lub potwierdzenie e-mail).
export async function sendWelcomeEmail(to, { name, loginUrl } = {}) {
  return sendEmail({
    to,
    subject: 'Konto aktywne — witaj w Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Witaj${name ? `, ${name}` : ''}!</h2>
        <p>Twoje konto w systemie <strong>Avenit</strong> jest już aktywne. Możesz się zalogować.</p>
        <p style="margin: 24px 0;">
          <a href="${loginUrl}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Zaloguj się</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Miłego korzystania z aplikacji.</p>
      </div>`,
    text: `Twoje konto jest aktywne. Zaloguj się: ${loginUrl}`,
  });
}

// Rejestracja (tryb „za zgodą administratora"): powiadomienie administratorów o nowym koncie.
export async function sendAdminNewUserEmail(to, { email, name, link }) {
  return sendEmail({
    to,
    subject: 'Nowe konto oczekuje na zatwierdzenie — Avenit',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Prośba o dostęp</h2>
        <p><strong>${name || email}</strong> (${email}) zarejestrował się i oczekuje na zatwierdzenie konta.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Przejdź do ustawień</a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">Zatwierdź lub odrzuć w: Ustawienia → Użytkownicy → Oczekujący.</p>
      </div>`,
    text: `Nowe konto oczekuje na zatwierdzenie: ${name || email} (${email}). Ustawienia → Użytkownicy.`,
  });
}
