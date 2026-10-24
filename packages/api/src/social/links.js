// Social Media — krótkie linki, UTM, ustawienia i gotowe szkice z treści Avenit (migracja 123).
//
// Krótki link: https://<kościół>.avenit.pl/l/<kod> (trasa social/pages.js). Przy publikacji na
// Facebooku worker podmienia adresy w treści na krótkie linki z UTM (utm_source=facebook,
// utm_medium=social, utm_campaign=avenit-<post>), żeby liczyć kliknięcia per post i kanał.
// Instagram — bez podmiany (linki w podpisie i tak nie są klikalne).
// Wydarzenie nie ma publicznej strony — link do niego pokazuje publiczną kartę wydarzenia
// (tylko wydarzenia jawnie udostępnione przez osobę z prawem tworzenia postów).
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { storagePath } from '../storage/files.js';
import { SocialError } from './meta.js';
import { SOCIAL_BUCKET } from './publish.js';
import {
  DEFAULT_TEMPLATES, renderTemplate, eventVars, sermonVars, youtubeThumb, withUtm, findUrls, isShortLink, isSocialHost,
} from '@avenit/shared/src/lib/socialShare.js';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (len = 7) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');
const lower = (v) => String(v ?? '').trim().toLowerCase();

export const tenantBase = (sub) => `https://${sub}.${config.APP_DOMAIN}`;
export const shortUrl = (sub, code) => `${tenantBase(sub)}/l/${code}`;

export async function createLink(db, sub, link) {
  for (let i = 0; i < 5; i += 1) {
    const code = randomCode();
    try {
      await db.query(
        `INSERT INTO social_links (code, kind, target_url, ref_id, title, description, image_url, post_id, provider, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [code, link.kind || 'url', link.target_url || null, link.ref_id != null ? String(link.ref_id) : null,
          link.title ? String(link.title).slice(0, 300) : null, link.description ? String(link.description).slice(0, 600) : null,
          link.image_url || null, link.post_id || null, link.provider || null, link.created_by ? lower(link.created_by) : null]);
      return { code, url: shortUrl(sub, code) };
    } catch (e) {
      if (e?.code !== '23505') throw e; // kolizja kodu — losujemy ponownie
    }
  }
  throw new SocialError('Nie udało się utworzyć krótkiego linku.', { code: 'link', status: 500 });
}

// ── Ustawienia (app_settings) ───────────────────────────────────────────────
export const DEFAULT_SETTINGS = { shorten_links: true, utm: true };

async function readSetting(db, key) {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
    return rows[0]?.value ? JSON.parse(rows[0].value) : null;
  } catch { return null; }
}
async function writeSetting(db, key, value) {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
}

export async function loadSettings(db) {
  return { ...DEFAULT_SETTINGS, ...(await readSetting(db, 'social_settings') || {}) };
}
export async function saveSettings(db, body = {}) {
  const next = { shorten_links: body.shorten_links !== false, utm: body.utm !== false };
  await writeSetting(db, 'social_settings', next);
  return next;
}

// ── Podmiana linków w treści (worker, przed publikacją na Facebooku) ────────
export async function shortenForTarget(ctx, { text, link, post, target, settings }) {
  if (!settings?.shorten_links) return { text, link };
  const sub = ctx.tenantSubdomain || ctx.tenantSlug;
  const campaign = `avenit-${String(post.id).slice(0, 8)}`;
  const map = new Map();
  const make = async (url) => {
    if (map.has(url)) return map.get(url);
    const target_url = settings.utm ? withUtm(url, { source: target.provider, medium: 'social', campaign }) : url;
    const { url: short } = await createLink(ctx.db, sub, { kind: 'url', target_url, post_id: post.id, provider: target.provider, created_by: post.created_by });
    map.set(url, short);
    return short;
  };
  let out = String(text || '');
  for (const url of findUrls(out)) {
    if (isShortLink(url) || isSocialHost(url)) continue;
    out = out.split(url).join(await make(url));
  }
  let outLink = link;
  if (link && !isShortLink(link) && !isSocialHost(link)) outLink = await make(link);
  return { text: out, link: outLink };
}

// Krótkie linki posta z kliknięciami (szczegóły posta).
export async function postLinks(db, postId) {
  try {
    const { rows } = await db.query(
      `SELECT code, kind, target_url, provider, clicks, last_click_at FROM social_links WHERE post_id = $1 ORDER BY created_at`, [postId]);
    return rows;
  } catch (e) {
    if (e?.code === '42P01') return [];
    throw e;
  }
}

// ── Gotowy szkic z wydarzenia / kazania ─────────────────────────────────────
export async function loadEvent(db, id) {
  try {
    const { rows } = await db.query(`SELECT * FROM events WHERE id = $1`, [id]);
    return rows[0] || null;
  } catch (e) {
    if (e?.code === '22P02' || e?.code === '22003') return null;
    throw e;
  }
}
export async function loadSermon(db, id) {
  try {
    const { rows } = await db.query(`SELECT * FROM sermons WHERE id = $1`, [id]);
    return rows[0] || null;
  } catch (e) {
    if (e?.code === '22P02' || e?.code === '22003') return null;
    throw e;
  }
}

// Link do wydarzenia / kazania — jeden na treść (ponowne udostępnienie używa istniejącego).
export async function contentLink(ctx, kind, row, createdBy) {
  const sub = ctx.tenantSubdomain || ctx.tenantSlug;
  const ref = String(row.id);
  const { rows } = await ctx.db.query(
    `SELECT code FROM social_links WHERE kind = $1 AND ref_id = $2 AND post_id IS NULL ORDER BY created_at LIMIT 1`, [kind, ref]);
  if (rows[0]) return shortUrl(sub, rows[0].code);
  if (kind === 'event') {
    const v = eventVars(row);
    const { url } = await createLink(ctx.db, sub, {
      kind, ref_id: ref, title: v.tytul, description: [v.data, v.godzina, v.miejsce].filter(Boolean).join(' · '), created_by: createdBy,
    });
    return url;
  }
  const { url } = await createLink(ctx.db, sub, {
    kind, ref_id: ref, target_url: `${tenantBase(sub)}/sermon/${encodeURIComponent(row.slug)}`,
    title: row.title, description: [row.speaker, row.series].filter(Boolean).join(' · '),
    image_url: youtubeThumb(row.video_url), created_by: createdBy,
  });
  return url;
}

// Miniatura YouTube → plik w buckecie social-media (Meta pobiera media z naszego storage).
async function fetchThumbToMedia(ctx, url) {
  if (!url) return null;
  try {
    const res = await globalThis.fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return null; // pusta zaślepka YouTube
    const dir = crypto.randomBytes(9).toString('hex');
    const rel = `${dir}/plik.jpg`;
    const dst = storagePath(ctx.tenantSlug, SOCIAL_BUCKET, rel);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.writeFile(dst, buf);
    let width = 480, height = 360;
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buf).metadata();
      width = meta.width || width; height = meta.height || height;
    } catch { /* bez sharp — domyślne wymiary hqdefault */ }
    return { path: rel, mime: 'image/jpeg', kind: 'image', width, height, size: buf.length, alt: null, name: 'miniatura.jpg' };
  } catch { return null; }
}

// → { content, media, source_type, source_id, link, title }
export async function sharePrefill(ctx, access, { kind, id, template } = {}) {
  if (kind !== 'event' && kind !== 'sermon') throw new SocialError('Nieznany rodzaj treści.', { status: 400 });
  const email = access.me?.email;
  if (kind === 'event') {
    const ev = await loadEvent(ctx.db, id);
    if (!ev) throw new SocialError('Nie znaleziono wydarzenia.', { status: 404, code: 'NOT_FOUND' });
    const link = await contentLink(ctx, 'event', ev, email);
    const content = renderTemplate(template || DEFAULT_TEMPLATES.event, eventVars(ev, link));
    return { content, media: [], source_type: 'event', source_id: String(ev.id), link, title: ev.title };
  }
  const s = await loadSermon(ctx.db, id);
  if (!s) throw new SocialError('Nie znaleziono kazania.', { status: 404, code: 'NOT_FOUND' });
  if (!s.is_published || !s.slug) throw new SocialError('Udostępnić można opublikowane kazanie (z publicznym adresem).', { status: 400, code: 'NOT_PUBLISHED' });
  const link = await contentLink(ctx, 'sermon', s, email);
  const content = renderTemplate(template || DEFAULT_TEMPLATES.sermon, sermonVars(s, link));
  const thumb = await (ctx.deps?.fetchThumb || fetchThumbToMedia)(ctx, youtubeThumb(s.video_url));
  return { content, media: thumb ? [thumb] : [], source_type: 'sermon', source_id: String(s.id), link, title: s.title };
}

// ── Strona linków (/linki) ──────────────────────────────────────────────────
export const DEFAULT_LINK_PAGE = { enabled: false, title: '', bio: '', links: [], show_events: true, show_sermons: true, show_posts: true };

export async function loadLinkPage(db) {
  const raw = await readSetting(db, 'social_link_page');
  return { ...DEFAULT_LINK_PAGE, ...(raw || {}) };
}

// Przyciski strony linków dostają krótkie linki (licznik kliknięć); te same adresy — te same kody.
export async function saveLinkPage(ctx, body = {}) {
  const db = ctx.db;
  const sub = ctx.tenantSubdomain || ctx.tenantSlug;
  const cur = await loadLinkPage(db);
  const links = [];
  for (const l of (Array.isArray(body.links) ? body.links : []).slice(0, 30)) {
    const label = String(l?.label || '').trim().slice(0, 80);
    let url = String(l?.url || '').trim().slice(0, 2000);
    if (!label || !url) continue;
    if (!/^https?:\/\//i.test(url) && !/^mailto:|^tel:/i.test(url)) url = `https://${url}`;
    const prev = (cur.links || []).find((x) => x.url === url && x.code);
    let code = prev?.code;
    if (!code) code = (await createLink(db, sub, { kind: 'bio', target_url: url, title: label })).code;
    links.push({ label, url, code });
  }
  const next = {
    enabled: Boolean(body.enabled),
    title: String(body.title || '').trim().slice(0, 120),
    bio: String(body.bio || '').trim().slice(0, 600),
    links,
    show_events: body.show_events !== false,
    show_sermons: body.show_sermons !== false,
    show_posts: body.show_posts !== false,
  };
  await writeSetting(db, 'social_link_page', next);
  return withClicks(db, next);
}

export async function withClicks(db, page) {
  const codes = (page.links || []).map((l) => l.code).filter(Boolean);
  if (!codes.length) return page;
  const { rows } = await db.query(`SELECT code, clicks FROM social_links WHERE code = ANY($1::text[])`, [codes]).catch(() => ({ rows: [] }));
  const m = new Map(rows.map((r) => [r.code, r.clicks]));
  return { ...page, links: page.links.map((l) => ({ ...l, clicks: m.get(l.code) || 0 })) };
}
