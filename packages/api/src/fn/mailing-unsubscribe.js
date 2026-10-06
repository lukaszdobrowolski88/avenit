// Publiczny wypis z Mailingu (link „Wypisz się” w każdym mailu kampanii).
// GET  /api/fn/mailing-unsubscribe?t=<token>&c=<campaign>  → strona z prośbą o potwierdzenie
// GET  …&confirm=1  (przycisk na stronie)                     → zapis wypisu + potwierdzenie
// POST { t, c }  (gdy trasa zostanie zarejestrowana także dla POST) → zapis wypisu
// GET  ?preview=1                                            → strona dla maila testowego
//
// Token = base64url(e-mail).HMAC (send-mailing-campaign.js → unsubscribeToken), więc nikt nie
// wypisze cudzego adresu. Potwierdzenie przyciskiem chroni przed skanerami linków w skrzynkach
// (Outlook/Gmail otwierają linki z maila same z siebie). Wypisanych pomija każda wysyłka.
import { escapeHtml, verifyUnsubscribeToken, churchNameFor } from './send-mailing-campaign.js';

export const name = 'mailing-unsubscribe';
export const isPublic = true;
export const method = 'GET';
export const methods = ['GET', 'POST'];
export const rateLimit = { max: 30, timeWindow: '1 minute' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prosta strona w marce Avenit: papier, słód, kurkuma, Manrope.
export function renderPage({ title, message, church, form, tone = 'neutral' }) {
  const mark = tone === 'success' ? '✓' : tone === 'error' ? '!' : '@';
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --paper:#F6F4EE; --card:#FFFFFF; --malt:#2A2312; --muted:#6B6352; --turmeric:#FFBE0B; --line:#ECE8DE; }
  @media (prefers-color-scheme: dark) { :root { --paper:#1C1A16; --card:#26231D; --malt:#F6F4EE; --muted:#B9B2A2; --line:#3A362E; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--paper); color:var(--malt); font-family:Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { width:100%; max-width:440px; background:var(--card); border-radius:20px; padding:32px 28px; text-align:center; }
  .mark { width:48px; height:48px; margin:0 auto 16px; border-radius:50%; background:var(--line); color:var(--malt);
          display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; }
  h1 { font-size:22px; line-height:1.3; margin:0 0 10px; font-weight:700; }
  p { margin:0 0 12px; line-height:1.55; color:var(--muted); font-size:15px; }
  strong { color:var(--malt); word-break:break-all; }
  form { margin-top:20px; }
  button { appearance:none; border:0; border-radius:12px; padding:13px 22px; font:inherit; font-weight:700; font-size:15px;
           background:var(--turmeric); color:#2A2312; cursor:pointer; width:100%; }
  button:focus-visible { outline:3px solid var(--malt); outline-offset:2px; }
  .church { margin-top:24px; font-size:13px; color:var(--muted); }
  .brand { margin-top:6px; font-size:12px; color:var(--muted); opacity:.8; }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">${mark}</div>
  <h1>${escapeHtml(title)}</h1>
  ${message}
  ${form || ''}
  ${church ? `<p class="church">${escapeHtml(church)}</p>` : ''}
  <p class="brand">Avenit</p>
</main>
</body>
</html>`;
}

function sendPage(reply, code, page) {
  return reply
    .code(code)
    .header('Cache-Control', 'no-store')
    .header('X-Robots-Tag', 'noindex')
    .type('text/html; charset=utf-8')
    .send(page);
}

export default async function handler(req, reply) {
  const params = { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  const church = req.db ? await churchNameFor(req.db, req.tenant?.name) : '';

  if (params.preview) {
    return sendPage(reply, 200, renderPage({
      title: 'To jest mail testowy',
      message: '<p>W prawdziwym mailu ten link pozwala odbiorcy wypisać się z wiadomości kościoła. W teście nic się nie zmienia.</p>',
      church,
    }));
  }

  const email = verifyUnsubscribeToken(req.tenant?.slug, params.t);
  if (!email || !req.db) {
    return sendPage(reply, 400, renderPage({
      title: 'Ten link nie działa',
      message: '<p>Link jest niepełny albo nieprawidłowy. Otwórz go jeszcze raz bezpośrednio z maila albo napisz do kościoła, że chcesz się wypisać.</p>',
      church,
      tone: 'error',
    }));
  }
  const campaignId = UUID_RE.test(String(params.c || '')) ? String(params.c) : null;
  const confirmed = req.method === 'POST' || String(params.confirm || '') === '1';

  try {
    const { rows: existing } = await req.db.query(
      `SELECT 1 FROM email_unsubscribes WHERE lower(email) = $1 LIMIT 1`,
      [email]
    );
    const already = existing.length > 0;

    if (!confirmed && !already) {
      const hidden = [
        `<input type="hidden" name="t" value="${escapeHtml(params.t)}">`,
        campaignId ? `<input type="hidden" name="c" value="${escapeHtml(campaignId)}">` : '',
        '<input type="hidden" name="confirm" value="1">',
      ].join('');
      return sendPage(reply, 200, renderPage({
        title: 'Wypisać się z wiadomości?',
        message: `<p>Adres <strong>${escapeHtml(email)}</strong> przestanie dostawać maile z newslettera i ogłoszeń wysyłanych przez kościół.</p>`,
        form: `<form method="get" action="/api/fn/mailing-unsubscribe">${hidden}<button type="submit">Tak, wypisz mnie</button></form>`,
        church,
      }));
    }

    if (!already) {
      await req.db.query(
        `INSERT INTO email_unsubscribes (email, reason, campaign_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [email, 'Link w mailu', campaignId]
      );
    }
    // Zaplanowane i trwające wysyłki pominą ten adres.
    await req.db.query(
      `UPDATE email_campaign_recipients SET status = 'unsubscribed' WHERE lower(email) = $1 AND status = 'pending'`,
      [email]
    );

    if (req.method === 'POST' && !String(req.headers?.accept || '').includes('text/html')) {
      return reply.send({ success: true });
    }
    return sendPage(reply, 200, renderPage({
      title: already ? 'Ten adres jest już wypisany' : 'Wypisano',
      message: `<p>Adres <strong>${escapeHtml(email)}</strong> nie będzie już dostawać wiadomości z Mailingu kościoła.</p><p>Jeśli to pomyłka, napisz do kościoła — dopisze Cię z powrotem.</p>`,
      church,
      tone: 'success',
    }));
  } catch (err) {
    req.log?.error?.({ err }, 'mailing-unsubscribe');
    return sendPage(reply, 500, renderPage({
      title: 'Nie udało się wypisać',
      message: '<p>Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.</p>',
      church,
      tone: 'error',
    }));
  }
}
