// Social Media — publiczne strony renderowane na serwerze (bez logowania, host kościoła):
//   GET /l/:code               krótki link: przekierowanie (z licznikiem kliknięć), a dla wydarzenia —
//                              publiczna karta wydarzenia; robotom (Facebook, Messenger…) podgląd OG
//                              dla wydarzeń i kazań (SPA nie ma meta tagów, crawler nie uruchamia JS)
//   GET /l/:code/kalendarz.ics plik kalendarza udostępnionego wydarzenia
//   GET /linki                 strona linków („link in bio”): przyciski, wydarzenia, kazania, posty
//   GET /api/public/sermon/:slug  opublikowane kazanie (JSON) — publiczna strona /sermon/:slug
//                              (wcześniej czytała /api/db, które wymaga zalogowania)
import { isBotUa } from '../analytics/enrich.js';
import { loadLinkPage } from './links.js';
import { eventVars, plainText, formatDayPl, formatTime, youtubeThumb, youtubeId, ymdOf } from '@avenit/shared/src/lib/socialShare.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CODE_RE = /^[A-Za-z0-9]{5,12}$/;
const SAFE_TARGET = /^(https?:\/\/|mailto:|tel:)/i;

async function branding(req) {
  const out = { name: req.tenant?.name || 'Avenit', logo: null };
  try {
    const { rows } = await req.db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [['org_name', 'org_logo_url']]);
    for (const r of rows) {
      if (r.key === 'org_name' && r.value) out.name = r.value;
      if (r.key === 'org_logo_url' && r.value) out.logo = r.value;
    }
  } catch { /* strona publiczna — bez brandingu */ }
  return out;
}

const absUrl = (req, u) => {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${req.hostname}${u.startsWith('/') ? '' : '/'}${u}`;
};

// Szkielet strony w identyfikacji Avenit (papier, słód, kurkuma; Manrope).
function shell({ title, description, image, url, brand, body, refresh }) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || '')}"><meta property="og:site_name" content="${esc(brand.name)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
${refresh ? `<meta http-equiv="refresh" content="0;url=${esc(refresh)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--paper:#F6F4EE;--paper2:#ECE8DE;--ink:#2A2312;--ink2:#4A463E;--ink3:#6B6557;--kurkuma:#FFBE0B;--gold:#8A6606;--card:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Manrope,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:560px;margin:0 auto;padding:28px 16px 48px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.brand img{width:48px;height:48px;border-radius:50%;object-fit:cover;background:var(--paper2)}.brand .mono{width:48px;height:48px;border-radius:50%;background:var(--ink);color:var(--kurkuma);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
.brand b{font-size:17px}.card{background:var(--card);border-radius:22px;padding:20px;margin-bottom:12px}
.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:0 0 8px}
h1{font-size:28px;line-height:1.15;margin:0 0 6px;font-weight:800;letter-spacing:-.02em}h1 .dot{color:var(--kurkuma)}
.meta{color:var(--ink2);font-weight:600;font-size:15px;line-height:1.5}.desc{white-space:pre-wrap;color:var(--ink2);line-height:1.6;font-size:15px;margin-top:14px}
.btn{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;padding:14px 18px;margin-top:10px;background:var(--card);color:var(--ink)}
.btn.primary{background:var(--kurkuma);color:var(--ink)}.row{display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;padding:12px 0;border-bottom:1px solid var(--paper2)}
.row:last-child{border-bottom:0}.row .when{width:54px;flex-shrink:0;text-align:center;background:var(--paper);border-radius:14px;padding:6px 0;font-weight:800;font-size:18px;line-height:1.05}
.row .when small{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:700}.row .t{font-weight:700;font-size:15px}.row .s{color:var(--ink3);font-size:13px;font-weight:600;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.grid a{display:block;aspect-ratio:1;border-radius:14px;overflow:hidden;background:var(--paper2)}.grid img{width:100%;height:100%;object-fit:cover}
.bio{color:var(--ink2);line-height:1.55;font-size:15px;margin:-8px 0 16px;white-space:pre-wrap}footer{text-align:center;color:var(--ink3);font-size:12px;margin-top:28px}footer a{color:var(--ink3)}
</style></head><body><div class="wrap">
<div class="brand">${brand.logo ? `<img src="${esc(brand.logo)}" alt="">` : `<span class="mono">${esc((brand.name || 'A').trim()[0] || 'A')}</span>`}<b>${esc(brand.name)}</b></div>
${body}
<footer>${esc(brand.name)} · <a href="https://avenit.pl" rel="noopener">Avenit</a></footer></div></body></html>`;
}

function sendHtml(reply, html, { status = 200, cache = 'public, max-age=300' } = {}) {
  reply.code(status).header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', cache).header('X-Robots-Tag', 'noindex');
  return reply.send(html);
}

async function notFound(req, reply) {
  const brand = await branding(req);
  return sendHtml(reply, shell({ title: 'Nie znaleziono', brand, body: '<div class="card"><h1>Nie znaleziono<span class="dot">.</span></h1><p class="meta">Ten link wygasł albo jest nieprawidłowy.</p></div>' }), { status: 404, cache: 'no-cache' });
}

const FORMAT_LABEL = { online: 'Online', hybrid: 'Na miejscu i online' };

function eventBody(ev, code) {
  const v = eventVars(ev);
  const end = formatTime(ev.end_time);
  const when = [v.data, v.godzina ? `godz. ${v.godzina}${end ? `–${end}` : ''}` : ''].filter(Boolean).join(' · ');
  const desc = plainText(ev.details_html || ev.description || '');
  const place = [v.miejsce, FORMAT_LABEL[ev.format]].filter(Boolean).join(' · ');
  return `<div class="card"><p class="eyebrow">Wydarzenie</p><h1>${esc(v.tytul)}<span class="dot">.</span></h1>
<div class="meta">${esc(when)}${place ? `<br>${esc(place)}` : ''}</div>${desc ? `<div class="desc">${esc(desc)}</div>` : ''}</div>
<a class="btn primary" href="/l/${esc(code)}/kalendarz.ics">Dodaj do kalendarza</a>`;
}

// Plik .ics wydarzenia (czas polski; bez godziny — wydarzenie całodniowe).
export function eventIcs(ev, { host, code }) {
  const d = ymdOf(ev.date).replace(/-/g, '');
  const t = /^(\d{1,2}):(\d{2})/.exec(String(ev.time || ''));
  const e = /^(\d{1,2}):(\d{2})/.exec(String(ev.end_time || ''));
  const pad = (n) => String(n).padStart(2, '0');
  const fold = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Avenit//Social//PL', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:social-${code}@${host}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`];
  if (t) {
    const start = `${d}T${pad(t[1])}${t[2]}00`;
    let endStr;
    if (e) endStr = `${d}T${pad(e[1])}${e[2]}00`;
    else { const h = (Number(t[1]) + 1) % 24; endStr = `${d}T${pad(h)}${t[2]}00`; }
    lines.push(`DTSTART;TZID=Europe/Warsaw:${start}`, `DTEND;TZID=Europe/Warsaw:${endStr}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d}`);
  }
  lines.push(`SUMMARY:${fold(ev.title || 'Wydarzenie')}`);
  if (ev.location) lines.push(`LOCATION:${fold(ev.location)}`);
  const desc = plainText(ev.details_html || ev.description || '', 1500);
  lines.push(`DESCRIPTION:${fold(`${desc}${desc ? '\n\n' : ''}https://${host}/l/${code}`)}`, `URL:https://${host}/l/${code}`, 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

async function loadLink(req, code) {
  if (!CODE_RE.test(code)) return null;
  try {
    const { rows } = await req.db.query(`SELECT * FROM social_links WHERE code = $1`, [code]);
    return rows[0] || null;
  } catch { return null; }
}

async function loadEventById(db, id) {
  try {
    const { rows } = await db.query(`SELECT * FROM events WHERE id = $1`, [id]);
    return rows[0] || null;
  } catch { return null; }
}

export default async function socialPublicRoutes(app) {
  const limit = { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } };

  app.get('/l/:code', { preHandler: app.requireTenant, ...limit }, async (req, reply) => {
    if (reply.sent) return undefined;
    const link = await loadLink(req, String(req.params.code || ''));
    if (!link) return notFound(req, reply);
    const bot = isBotUa(req.headers['user-agent']);
    if (!bot) {
      req.db.query(`UPDATE social_links SET clicks = clicks + 1, last_click_at = now() WHERE code = $1`, [link.code]).catch(() => {});
    }
    const brand = await branding(req);
    const selfUrl = `https://${req.hostname}/l/${link.code}`;
    if (link.kind === 'event') {
      const ev = await loadEventById(req.db, link.ref_id);
      if (!ev) return notFound(req, reply);
      const v = eventVars(ev);
      return sendHtml(reply, shell({
        title: v.tytul || 'Wydarzenie', description: [v.data, v.godzina, v.miejsce].filter(Boolean).join(' · '),
        image: absUrl(req, brand.logo), url: selfUrl, brand, body: eventBody(ev, link.code),
      }));
    }
    const target = link.target_url && SAFE_TARGET.test(link.target_url) ? link.target_url : null;
    if (!target) return notFound(req, reply);
    // Kazanie: robot dostaje podgląd OG (strona kazania to SPA bez meta tagów), człowiek — przekierowanie.
    if (bot && link.kind === 'sermon') {
      return sendHtml(reply, shell({
        title: link.title || 'Kazanie', description: link.description || '', image: link.image_url || absUrl(req, brand.logo),
        url: selfUrl, brand, refresh: target,
        body: `<div class="card"><p class="eyebrow">Kazanie</p><h1>${esc(link.title || '')}</h1><p class="meta">${esc(link.description || '')}</p></div><a class="btn primary" href="${esc(target)}">Posłuchaj</a>`,
      }));
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.redirect(target, 302);
  });

  app.get('/l/:code/kalendarz.ics', { preHandler: app.requireTenant, ...limit }, async (req, reply) => {
    if (reply.sent) return undefined;
    const link = await loadLink(req, String(req.params.code || ''));
    const ev = link?.kind === 'event' ? await loadEventById(req.db, link.ref_id) : null;
    if (!ev) return notFound(req, reply);
    reply.header('Content-Type', 'text/calendar; charset=utf-8').header('Content-Disposition', 'attachment; filename="wydarzenie.ics"');
    return reply.send(eventIcs(ev, { host: req.hostname, code: link.code }));
  });

  app.get('/linki', { preHandler: app.requireTenant, ...limit }, async (req, reply) => {
    if (reply.sent) return undefined;
    const page = await loadLinkPage(req.db);
    if (!page.enabled) return notFound(req, reply);
    const brand = await branding(req);
    const parts = [];
    if (page.links?.length) {
      parts.push(page.links.map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="/l/${esc(l.code)}" rel="noopener">${esc(l.label)}</a>`).join(''));
    }
    if (page.show_events) {
      const { rows } = await req.db.query(
        `SELECT DISTINCT ON (e.id) l.code, e.title, e.date, e.time, e.location FROM social_links l JOIN events e ON e.id::text = l.ref_id
          WHERE l.kind = 'event' AND l.post_id IS NULL AND e.date >= CURRENT_DATE ORDER BY e.id, l.created_at`).catch(() => ({ rows: [] }));
      const evs = rows.sort((a, b) => ymdOf(a.date).localeCompare(ymdOf(b.date)) || String(a.time || '').localeCompare(String(b.time || ''))).slice(0, 6);
      if (evs.length) {
        parts.push(`<div class="card" style="margin-top:18px"><p class="eyebrow">Najbliższe wydarzenia</p>${evs.map((e) => {
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymdOf(e.date));
          const day = m ? Number(m[3]) : '';
          const mon = m ? ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'][Number(m[2]) - 1] : '';
          return `<a class="row" href="/l/${esc(e.code)}"><span class="when">${day}<small>${mon}</small></span><span><div class="t">${esc(e.title)}</div><div class="s">${esc([formatTime(e.time), e.location].filter(Boolean).join(' · '))}</div></span></a>`;
        }).join('')}</div>`);
      }
    }
    if (page.show_sermons) {
      const { rows } = await req.db.query(
        `SELECT title, speaker, sermon_date, slug FROM sermons WHERE is_published = true AND slug IS NOT NULL
          ORDER BY sermon_date DESC NULLS LAST LIMIT 3`).catch(() => ({ rows: [] }));
      if (rows.length) {
        parts.push(`<div class="card"><p class="eyebrow">Ostatnie kazania</p>${rows.map((s) => `<a class="row" href="/sermon/${esc(encodeURIComponent(s.slug))}"><span><div class="t">${esc(s.title)}</div><div class="s">${esc([s.speaker, formatDayPl(s.sermon_date)].filter(Boolean).join(' · '))}</div></span></a>`).join('')}</div>`);
      }
    }
    if (page.show_posts) {
      const { rows } = await req.db.query(
        `SELECT DISTINCT ON (p.id) p.id, t.permalink, COALESCE(t.media, p.media) AS media, t.published_at FROM social_post_targets t
           JOIN social_posts p ON p.id = t.post_id
          WHERE t.status = 'published' AND t.permalink IS NOT NULL
          ORDER BY p.id, (t.provider = 'instagram') DESC, t.published_at DESC`).catch(() => ({ rows: [] }));
      const posts = rows.filter((r) => Array.isArray(r.media) && r.media.some((m) => m.kind !== 'video'))
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at)).slice(0, 6);
      if (posts.length) {
        parts.push(`<div class="card"><p class="eyebrow">Z naszych mediów</p><div class="grid">${posts.map((r) => {
          const m = r.media.find((x) => x.kind !== 'video');
          return `<a href="${esc(r.permalink)}" rel="noopener"><img src="/storage/social-media/${esc(m.path)}?w=384" alt="${esc(m.alt || '')}" loading="lazy"></a>`;
        }).join('')}</div></div>`);
      }
    }
    const title = page.title || brand.name;
    const body = `<h1>${esc(title)}<span class="dot">.</span></h1>${page.bio ? `<p class="bio">${esc(page.bio)}</p>` : '<div style="height:12px"></div>'}${parts.join('')}`;
    return sendHtml(reply, shell({ title, description: page.bio || brand.name, image: absUrl(req, brand.logo), url: `https://${req.hostname}/linki`, brand, body }));
  });

  app.get('/api/public/sermon/:slug', { preHandler: app.requireTenant, ...limit }, async (req, reply) => {
    if (reply.sent) return undefined;
    const slug = String(req.params.slug || '').slice(0, 200);
    const { rows } = await req.db.query(
      `SELECT id, title, speaker, series, sermon_date, scripture_ref, description, audio_url, video_url, notes, slug
         FROM sermons WHERE slug = $1 AND is_published = true ORDER BY sermon_date DESC NULLS LAST LIMIT 1`, [slug]).catch(() => ({ rows: [] }));
    if (!rows[0]) return reply.code(404).send({ error: 'Nie znaleziono kazania.' });
    return reply.send({ sermon: { ...rows[0], thumbnail: youtubeThumb(rows[0].video_url), youtube_id: youtubeId(rows[0].video_url) } });
  });
}
