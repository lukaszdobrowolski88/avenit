// Komunikator — „Media, pliki, linki, głosowe” rozmowy (panel informacji o rozmowie: web + mobilka).
//
// Filtrowanie po stronie serwera: załączniki rozbite SQL-em (jsonb_array_elements) i odsiane po
// rodzaju, linki — tylko wiadomości z adresem w treści (content ~* 'https?://|www.'), adresy
// wyciągane tu, a tytuł/serwis z cache podglądów (link_previews, jeśli ktoś już otworzył podgląd).
// Cała rozmowa, łącznie z odpowiedziami w wątkach (112) — pozycja ma thread_root_id, żeby klient
// otworzył wątek zamiast szukać odpowiedzi na głównej osi.
// Paczkami od najnowszych z kursorem (created_at z pełną precyzją, id, pozycja załącznika).
// Dostęp: wyłącznie uczestnik rozmowy (jak /api/db). Pliki zwracamy z ZWYKŁYM adresem — klienci
// wyświetlają je przez podpisany link (K1, prywatne pliki czatu), jak w samej rozmowie.
import { ApiError } from './querybuilder.js';
import { isMember } from './komunikator.js';
import { normalizePreviewUrl } from '../fn/link-preview.js';

export const MEDIA_KINDS = ['media', 'files', 'links', 'voice'];
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lower = (v) => String(v ?? '').trim().toLowerCase();

// Rodzaj załącznika — te same zasady co klienci (chatLogic.isVoiceAttachment / isImageAttachment).
// COALESCE — brak pola daje NULL, a NOT NULL odrzuciłby zwykłe pliki.
const VOICE_SQL = `(COALESCE(a.e->>'isVoiceMessage', '') = 'true' OR COALESCE(a.e->>'type', '') LIKE 'audio/%' OR COALESCE(a.e->>'name', '') LIKE 'voice-%')`;
const VISUAL_SQL = `(COALESCE(a.e->>'type', '') LIKE 'image/%' OR COALESCE(a.e->>'type', '') LIKE 'video/%')`;
const KIND_SQL = {
  voice: VOICE_SQL,
  media: `(NOT ${VOICE_SQL} AND ${VISUAL_SQL})`,
  files: `(NOT ${VOICE_SQL} AND NOT ${VISUAL_SQL})`,
};

// Czyste (testy) — rodzaj pojedynczego załącznika jak w SQL.
export function attachmentKind(a) {
  if (!a || typeof a !== 'object' || !a.url) return null;
  const type = String(a.type || '');
  if (a.isVoiceMessage === true || a.isVoiceMessage === 'true' || type.startsWith('audio/') || String(a.name || '').startsWith('voice-')) return 'voice';
  if (type.startsWith('image/') || type.startsWith('video/')) return 'media';
  return 'files';
}

// Kursor: base64url z [created_at (tekst Postgresa — mikrosekundy), id, pozycja].
export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}
export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !Number.isFinite(Date.parse(v[0])) || !UUID_RE.test(String(v[1] ?? ''))) return null;
    const ord = v[2] == null ? null : Number(v[2]);
    if (ord != null && (!Number.isInteger(ord) || ord < 0)) return null;
    return { ts: v[0], id: String(v[1]), ord };
  } catch {
    return null;
  }
}

// ── Linki w treści (jak web utils/linkify.js) ────────────────────────────────
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_CHAR = /[.,;:!?'"»”’\]}]/;
function trimUrl(raw) {
  let url = raw;
  while (url.length) {
    const ch = url[url.length - 1];
    if (ch === ')') {
      const open = (url.match(/\(/g) || []).length;
      const close = (url.match(/\)/g) || []).length;
      if (close > open) { url = url.slice(0, -1); continue; }
      break;
    }
    if (TRAILING_CHAR.test(ch)) { url = url.slice(0, -1); continue; }
    break;
  }
  return url;
}
const hrefOf = (url) => (/^www\./i.test(url) ? `https://${url}` : url);

// Adresy http(s) z treści — bez powtórzeń, w kolejności występowania.
export function extractLinks(text) {
  const s = String(text ?? '');
  const out = [];
  const seen = new Set();
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(s))) {
    const start = m.index;
    if (start > 0 && /[\w@.-]/.test(s[start - 1])) continue; // np. e-mail „jan@www.x.pl”
    const url = trimUrl(m[0]);
    if (!url || /^www\.$/i.test(url)) continue;
    const href = hrefOf(url);
    let u;
    try { u = new URL(href); } catch { continue; }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; }
}

const clip = (v, n) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null;
};

async function senderNames(db, emails) {
  const list = [...new Set(emails.map(lower).filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await db.query(
    `SELECT lower(email) AS e, COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), email) AS display
       FROM app_users WHERE lower(email) = ANY($1::text[])`,
    [list],
  );
  return new Map(rows.map((r) => [r.e, r.display]));
}

async function previewsFor(db, urls) {
  const keys = [...new Set(urls.map((u) => normalizePreviewUrl(u)).filter(Boolean))];
  if (!keys.length) return new Map();
  try {
    const { rows } = await db.query(`SELECT url, data FROM link_previews WHERE url = ANY($1::text[])`, [keys]);
    return new Map(rows.map((r) => [r.url, r.data && typeof r.data === 'object' ? r.data : {}]));
  } catch {
    return new Map(); // brak tabeli (przed migracją 088) — same domeny
  }
}

const parseLimit = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
};

async function attachmentsPage(db, convId, kind, cursor, limit) {
  const params = [convId];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  let after = '';
  if (cursor) {
    after = cursor.ord == null
      ? `AND (m.created_at, m.id::text) < (${push(cursor.ts)}::timestamptz, ${push(cursor.id)})`
      : `AND (m.created_at, m.id::text, a.ord) < (${push(cursor.ts)}::timestamptz, ${push(cursor.id)}, ${push(cursor.ord)}::bigint)`;
  }
  const { rows } = await db.query(
    `SELECT m.id::text AS message_id, m.sender_email, m.created_at, m.created_at::text AS ts, a.ord::int AS ord, a.e AS attachment,
            to_jsonb(m)->>'thread_root_id' AS thread_root_id
       FROM messages m
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(m.attachments) = 'array' THEN m.attachments ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS a(e, ord)
      WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
        AND jsonb_typeof(a.e) = 'object' AND COALESCE(a.e->>'url', '') <> ''
        AND ${KIND_SQL[kind]}
        ${after}
      ORDER BY m.created_at DESC, m.id::text DESC, a.ord DESC
      LIMIT ${push(limit + 1)}`,
    params,
  );
  const page = rows.slice(0, limit);
  const names = await senderNames(db, page.map((r) => r.sender_email));
  const items = page.map((r) => ({
    key: `${r.message_id}-${r.ord}`,
    message_id: r.message_id,
    thread_root_id: r.thread_root_id || null,
    sender_email: r.sender_email,
    sender_name: names.get(lower(r.sender_email)) || r.sender_email,
    created_at: new Date(r.created_at).toISOString(),
    attachment: r.attachment,
  }));
  const last = page[page.length - 1];
  return { items, next: rows.length > limit && last ? encodeCursor([last.ts, last.message_id, last.ord]) : null };
}

async function linksPage(db, convId, cursor, limit) {
  const params = [convId];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  const after = cursor ? `AND (m.created_at, m.id::text) < (${push(cursor.ts)}::timestamptz, ${push(cursor.id)})` : '';
  const { rows } = await db.query(
    `SELECT m.id::text AS message_id, m.sender_email, m.created_at, m.created_at::text AS ts, m.content,
            to_jsonb(m)->>'thread_root_id' AS thread_root_id
       FROM messages m
      WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
        AND m.content ~* '(https?://|www\\.)'
        ${after}
      ORDER BY m.created_at DESC, m.id::text DESC
      LIMIT ${push(limit + 1)}`,
    params,
  );
  const page = rows.slice(0, limit);
  const perMessage = page.map((r) => ({ r, urls: extractLinks(r.content) }));
  const [names, previews] = await Promise.all([
    senderNames(db, page.map((r) => r.sender_email)),
    previewsFor(db, perMessage.flatMap((x) => x.urls)),
  ]);
  const items = [];
  for (const { r, urls } of perMessage) {
    urls.forEach((url, i) => {
      const p = previews.get(normalizePreviewUrl(url)) || {};
      items.push({
        key: `${r.message_id}-${i}`,
        message_id: r.message_id,
        thread_root_id: r.thread_root_id || null,
        sender_email: r.sender_email,
        sender_name: names.get(lower(r.sender_email)) || r.sender_email,
        created_at: new Date(r.created_at).toISOString(),
        url,
        domain: domainOf(url),
        title: clip(p.title, 200),
        site_name: clip(p.siteName, 80),
        description: clip(p.description, 240),
      });
    });
  }
  const last = page[page.length - 1];
  return { items, next: rows.length > limit && last ? encodeCursor([last.ts, last.message_id, null]) : null };
}

// POST chat-media { conversation_id, kind, cursor?, limit? } → { kind, items, next }.
export async function conversationMedia(ctx, user, body = {}) {
  const convId = String(body.conversation_id ?? '');
  const kind = String(body.kind || 'media');
  if (!UUID_RE.test(convId)) throw new ApiError(400, 'Nie wybrano rozmowy.');
  if (!MEDIA_KINDS.includes(kind)) throw new ApiError(400, 'Nieznany rodzaj materiałów.');
  if (!(await isMember(ctx.db, convId, lower(user?.email)))) throw new ApiError(403, 'Brak dostępu do tej rozmowy.', 'NO_ACCESS');
  const cursor = body.cursor ? decodeCursor(body.cursor) : null;
  if (body.cursor && !cursor) throw new ApiError(400, 'Nieprawidłowa strona wyników.');
  const limit = parseLimit(body.limit);
  const page = kind === 'links'
    ? await linksPage(ctx.db, convId, cursor, limit)
    : await attachmentsPage(ctx.db, convId, kind, cursor, limit);
  return { kind, ...page };
}
