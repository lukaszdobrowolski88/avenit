// Szablony e-maili formularza zgłoszeniowego avenit.pl.
// Email-safe HTML: tabele + style inline, max-width 600, bez zewnętrznych zasobów.
import { config } from '../config.js';

export const esc = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const BRAND = {
  dark: '#0f172a', amber: '#f59e0b', amberDark: '#d97706',
  text: '#1e293b', muted: '#64748b', line: '#e2e8f0', bg: '#f1f5f9', soft: '#fffbeb',
};

// Wspólna rama: ciemny nagłówek z logo, biała karta treści, stopka.
function shell({ preheader, subtitle, content }) {
  return `<!doctype html>
<html lang="pl">
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:${BRAND.dark};border-radius:16px 16px 0 0;padding:28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:Arial,Helvetica,sans-serif;">
                <span style="font-size:26px;font-weight:800;color:${BRAND.amber};letter-spacing:-0.5px;">Avenit</span><br>
                <span style="font-size:13px;color:#94a3b8;">${esc(subtitle)}</span>
              </td>
              <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;vertical-align:top;">avenit.pl</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:36px 40px;font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.6;">
            Avenit — system zarządzania kościołem · <a href="https://avenit.pl" style="color:${BRAND.amberDark};text-decoration:none;">avenit.pl</a><br>
            Ta wiadomość została wysłana automatycznie w związku ze zgłoszeniem na avenit.pl.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const row = (label, value) => `
  <tr>
    <td style="padding:9px 16px 9px 0;font-size:13px;color:${BRAND.muted};white-space:nowrap;vertical-align:top;border-bottom:1px solid ${BRAND.line};">${label}</td>
    <td style="padding:9px 0;font-size:15px;color:${BRAND.text};font-weight:bold;border-bottom:1px solid ${BRAND.line};">${value}</td>
  </tr>`;

const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px;"><tr>
    <td style="background:${BRAND.amberDark};border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
    </td>
  </tr></table>`;

const messageBox = (message) => message ? `
  <div style="background:${BRAND.soft};border-left:4px solid ${BRAND.amber};border-radius:0 10px 10px 0;padding:16px 20px;margin:20px 0 4px;font-size:15px;color:#334155;white-space:pre-wrap;">${esc(message)}</div>` : '';

// Powiadomienie dla administratora platformy o nowym zgłoszeniu.
export function leadNotificationEmail(lead) {
  const panelUrl = `https://admin.${config.APP_DOMAIN}/leads`;
  const html = shell({
    preheader: `${lead.name}${lead.church ? ` — ${lead.church}` : ''}: nowe zgłoszenie ze strony`,
    subtitle: 'Nowe zgłoszenie ze strony',
    content: `
      <h1 style="margin:0 0 6px;font-size:22px;color:${BRAND.dark};">📥 Nowe zgłoszenie</h1>
      <p style="margin:0 0 22px;color:${BRAND.muted};">Ktoś wypełnił formularz na avenit.pl. Odpowiedz na tę wiadomość, aby napisać bezpośrednio do zgłaszającego.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Imię i nazwisko', esc(lead.name))}
        ${row('E-mail', `<a href="mailto:${esc(lead.email)}" style="color:${BRAND.amberDark};text-decoration:none;">${esc(lead.email)}</a>`)}
        ${row('Telefon', lead.phone ? `<a href="tel:${esc(lead.phone).replace(/[^+\d]/g, '')}" style="color:${BRAND.amberDark};text-decoration:none;">${esc(lead.phone)}</a>` : '<span style="color:#94a3b8;font-weight:normal;">—</span>')}
        ${row('Kościół / wspólnota', lead.church ? esc(lead.church) : '<span style="color:#94a3b8;font-weight:normal;">—</span>')}
      </table>
      ${lead.message ? `<p style="margin:22px 0 0;font-size:13px;color:${BRAND.muted};">Wiadomość:</p>${messageBox(lead.message)}` : ''}
      ${button(panelUrl, 'Otwórz w panelu →')}
      <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">ID zgłoszenia: ${esc(lead.id)}</p>`,
  });
  const text = `Nowe zgłoszenie ze strony avenit.pl

Imię i nazwisko: ${lead.name}
E-mail: ${lead.email}
Telefon: ${lead.phone || '—'}
Kościół: ${lead.church || '—'}

${lead.message || '(brak wiadomości)'}

Panel: ${panelUrl}
ID zgłoszenia: ${lead.id}`;
  return { subject: `Avenit — nowe zgłoszenie: ${lead.church || lead.name}`, html, text };
}

// Potwierdzenie dla osoby wysyłającej formularz.
export function leadConfirmationEmail(lead) {
  const firstName = String(lead.name || '').trim().split(/\s+/)[0];
  const html = shell({
    preheader: 'Otrzymaliśmy Twoje zgłoszenie — odezwiemy się zwykle w 1–2 dni robocze.',
    subtitle: 'Potwierdzenie zgłoszenia',
    content: `
      <h1 style="margin:0 0 6px;font-size:22px;color:${BRAND.dark};">Dziękujemy, ${esc(firstName)}! 🙌</h1>
      <p style="margin:0 0 18px;color:${BRAND.muted};">Twoje zgłoszenie dotarło do nas i już na nie patrzymy. Zwykle odzywamy się w ciągu <strong style="color:${BRAND.text};">1–2 dni roboczych</strong>.</p>
      ${lead.message ? `<p style="margin:0;font-size:13px;color:${BRAND.muted};">Twoja wiadomość:</p>${messageBox(lead.message)}` : ''}
      <p style="margin:24px 0 10px;color:${BRAND.text};">Chcesz porozmawiać od razu?</p>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;font-size:15px;">✉️ &nbsp;<a href="mailto:lukasz@avenit.pl" style="color:${BRAND.amberDark};text-decoration:none;font-weight:bold;">lukasz@avenit.pl</a></td></tr>
        <tr><td style="padding:4px 0;font-size:15px;">📞 &nbsp;<a href="tel:+48607693996" style="color:${BRAND.amberDark};text-decoration:none;font-weight:bold;">+48 607 693 996</a></td></tr>
      </table>
      ${button('https://avenit.pl/#funkcje', 'Zobacz, co potrafi Avenit →')}
      <p style="margin:22px 0 0;font-size:13px;color:#94a3b8;">Jeśli to nie Ty wysłałeś(-aś) to zgłoszenie, po prostu zignoruj tę wiadomość.</p>`,
  });
  const text = `Dziękujemy, ${firstName}!

Twoje zgłoszenie dotarło do nas — odezwiemy się zwykle w ciągu 1–2 dni roboczych.

${lead.message ? `Twoja wiadomość:\n${lead.message}\n\n` : ''}Kontakt bezpośredni:
- lukasz@avenit.pl
- +48 607 693 996

Avenit — system zarządzania kościołem · https://avenit.pl
Jeśli to nie Ty wysłałeś(-aś) to zgłoszenie, zignoruj tę wiadomość.`;
  return { subject: 'Avenit — otrzymaliśmy Twoje zgłoszenie ✅', html, text };
}
