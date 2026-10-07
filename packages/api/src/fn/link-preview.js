// Komunikator+ (K2): podgląd linku z wiadomości (tytuł, opis, obrazek, nazwa serwisu).
// POST /api/fn/link-preview { url } → { url, title, description, image, siteName } albo {}.
//
// Ochrona SSRF (serwer pobiera adres podany przez użytkownika):
//  • tylko http/https, porty 80/443/8080/8443, bez danych logowania w adresie,
//  • nazwa hosta: bez localhost/.local/.internal i nazw jednoczłonowych (sieć Dockera: api, postgres…),
//  • KAŻDY adres IP z DNS sprawdzany (prywatne, pętla zwrotna, link-local, CGNAT, multicast, IPv6
//    ULA/link-local, IPv4 zmapowane w IPv6) — a połączenie idzie DOKŁADNIE na sprawdzony adres
//    (lookup przypięty), więc podmiana DNS między sprawdzeniem a połączeniem (rebinding) nie działa,
//  • najwyżej 3 przekierowania (każde sprawdzane od nowa), 5 s na całość, 1 MB treści.
// Cache: tabela link_previews (url PK, data jsonb, fetched_at) — 7 dni; nieudane 1 dzień.
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

export const name = 'link-preview';
export const rateLimit = { max: 60, timeWindow: '1 minute' };

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const CACHE_OK_MS = 7 * 24 * 3600 * 1000;
const CACHE_FAIL_MS = 24 * 3600 * 1000;
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.intranet', '.corp', '.home.arpa'];

// ── Adresy IP ───────────────────────────────────────────────────────────────
function ipv4Blocked(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local (metadane chmury)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast, zarezerwowane, broadcast
  return false;
}

// IPv6 → 8 liczb (obsługa „::” i końcówki IPv4). null = niepoprawny.
function expandIpv6(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1].split('.').map(Number);
    s = s.slice(0, -v4[1].length) + `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array(fill).fill('0'), ...tail];
  if (parts.length !== 8) return null;
  const nums = parts.map((h) => parseInt(h, 16));
  return nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff) ? null : nums;
}
const v4From = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function ipv6Blocked(ip) {
  const h = expandIpv6(ip);
  if (!h) return true;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return ipv4Blocked(v4From(h[6], h[7])); // ::ffff:a.b.c.d, ::a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b) return ipv4Blocked(v4From(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return ipv4Blocked(v4From(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // dokumentacja
  if ((h[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // site-local (przestarzałe)
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // discard
  return false;
}

export function isBlockedAddress(ip) {
  const s = String(ip || '').replace(/^\[|\]$/g, '');
  if (net.isIPv4(s)) return ipv4Blocked(s);
  if (net.isIPv6(s)) return ipv6Blocked(s);
  return true;
}

// ── Adres URL ───────────────────────────────────────────────────────────────
// Poprawny publiczny adres http(s) albo null. „www.przyklad.pl” → https://www.przyklad.pl.
export function normalizePreviewUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 2048) return null;
  if (/^www\./i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!ALLOWED_PORTS.has(u.port)) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  const bare = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) {
    if (isBlockedAddress(bare)) return null;
  } else {
    if (host === 'localhost' || BLOCKED_SUFFIXES.some((x) => host.endsWith(x))) return null;
    if (!host.includes('.')) return null; // nazwy jednoczłonowe (sieć wewnętrzna)
  }
  u.hash = '';
  return u.toString();
}

// Adres do połączenia: IP literal albo pierwszy adres z DNS — wszystkie muszą być publiczne.
export async function resolvePublicAddress(hostname, lookup = dns.lookup) {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) return isBlockedAddress(bare) ? null : { address: bare, family: net.isIP(bare) };
  let list;
  try { list = await lookup(bare, { all: true, verbatim: true }); } catch { return null; }
  if (!Array.isArray(list) || !list.length) return null;
  if (list.some((a) => isBlockedAddress(a.address))) return null;
  return { address: list[0].address, family: list[0].family };
}

// ── Pobranie (jeden skok) z przypiętym adresem ──────────────────────────────
function requestOnce(u, pinned, signal) {
  const mod = u.protocol === 'https:' ? https : http;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const req = mod.request({
      protocol: u.protocol,
      hostname: host,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      signal,
      servername: net.isIP(host) ? undefined : host,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AvenitLinkPreview/1.0; +https://avenit.pl)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.5,*/*;q=0.1',
        'Accept-Language': 'pl,en;q=0.8,uk;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      // Połączenie wyłącznie na sprawdzony adres (ochrona przed DNS rebinding).
      lookup: (_name, opts, cb) => {
        if (opts && opts.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
        else cb(null, pinned.address, pinned.family);
      },
    }, resolve);
    req.on('error', reject);
    req.end();
  });
}

function readBody(res, maxBytes) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  let stream = res;
  if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
  else if (enc.includes('br')) stream = res.pipe(zlib.createBrotliDecompress());
  else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate());
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } };
    stream.on('data', (c) => {
      if (done) return;
      const room = maxBytes - size;
      chunks.push(room < c.length ? c.subarray(0, room) : c);
      size += Math.min(c.length, room);
      if (size >= maxBytes) { finish(); res.destroy(); } // limit: dalej nie czytamy
    });
    stream.on('end', finish);
    stream.on('error', (e) => (done ? undefined : (size ? finish() : reject(e))));
    res.on('aborted', finish);
  });
}

export async function fetchLimited(url, { lookup, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, maxRedirects = MAX_REDIRECTS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safe = normalizePreviewUrl(current);
      if (!safe) return null;
      const u = new URL(safe);
      const pinned = await resolvePublicAddress(u.hostname, lookup);
      if (!pinned) return null;
      const res = await requestOnce(u, pinned, ctrl.signal);
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        current = new URL(String(res.headers.location), u).toString();
        continue;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return null; }
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      if (contentType.startsWith('image/')) { res.destroy(); return { finalUrl: safe, contentType, body: Buffer.alloc(0) }; }
      if (!/text\/html|application\/xhtml/.test(contentType)) { res.destroy(); return null; }
      const body = await readBody(res, maxBytes);
      return { finalUrl: safe, contentType, body };
    }
    return null; // za dużo przekierowań
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Parsowanie HTML ─────────────────────────────────────────────────────────
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', bdquo: '„', rdquo: '”', ldquo: '“', rsquo: '’', lsquo: '‘', copy: '©', reg: '®',
  trade: '™', oacute: 'ó', Oacute: 'Ó', middot: '·', bull: '•',
};
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s, max) => {
  const t = decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return out;
}

function decodeHtml(buf, contentType) {
  let charset = (String(contentType).match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) {
    const head = buf.subarray(0, 4096).toString('latin1');
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try { return new TextDecoder(charset || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

const safeImage = (src, base) => {
  if (!src) return null;
  try {
    const u = new URL(decodeEntities(src).trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const s = u.toString();
    return s.length <= 2048 ? s : null;
  } catch { return null; }
};

export function parsePreview(html, finalUrl) {
  const meta = {};
  const tagRe = /<(meta|link)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const a = attrs(m[0]);
    if (m[1].toLowerCase() === 'meta') {
      const key = String(a.property || a.name || a.itemprop || '').toLowerCase();
      if (key && a.content != null && !(key in meta)) meta[key] = a.content;
    } else if (String(a.rel || '').toLowerCase() === 'image_src' && a.href && !('link:image_src' in meta)) {
      meta['link:image_src'] = a.href;
    }
  }
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const host = (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ''); } catch { return null; } })();
  const title = clean(meta['og:title'] || meta['twitter:title'] || titleTag, 200);
  const description = clean(meta['og:description'] || meta['twitter:description'] || meta.description, 400);
  const image = safeImage(
    meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || meta['link:image_src'],
    finalUrl
  );
  const siteName = clean(meta['og:site_name'] || meta['application-name'], 100) || host;
  if (!title && !description && !image) return null;
  return { url: finalUrl, title, description, image, siteName };
}

// ── Cache ───────────────────────────────────────────────────────────────────
async function cacheGet(db, url) {
  try {
    const { rows } = await db.query(`SELECT data, fetched_at FROM link_previews WHERE url = $1`, [url]);
    const r = rows[0];
    if (!r) return undefined;
    const data = r.data && typeof r.data === 'object' ? r.data : {};
    const age = Date.now() - new Date(r.fetched_at).getTime();
    const ttl = Object.keys(data).length ? CACHE_OK_MS : CACHE_FAIL_MS;
    return age < ttl ? data : undefined;
  } catch {
    return undefined;
  }
}
async function cachePut(db, url, data) {
  try {
    await db.query(
      `INSERT INTO link_previews (url, data, fetched_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (url) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
      [url, JSON.stringify(data || {})]);
  } catch { /* brak tabeli — bez cache */ }
}

// Wynik zawsze z adresem, o który pytano (klient łączy podgląd z linkiem z wiadomości);
// względne obrazki rozwiązywane względem adresu po przekierowaniach.
export async function buildPreview(url, opts = {}) {
  const got = await fetchLimited(url, opts);
  if (!got) return {};
  if (got.contentType.startsWith('image/')) {
    let host = null;
    try { host = new URL(got.finalUrl).hostname.replace(/^www\./, ''); } catch { /* */ }
    return { url, title: null, description: null, image: got.finalUrl, siteName: host };
  }
  const data = parsePreview(decodeHtml(got.body, got.contentType), got.finalUrl);
  return data ? { ...data, url } : {};
}

export default async function handler(req, reply) {
  const url = normalizePreviewUrl(req.body?.url);
  if (!url) return reply.send({});
  const cached = await cacheGet(req.db, url);
  if (cached !== undefined) return reply.send(cached);
  let data = {};
  try {
    data = await buildPreview(url);
  } catch (err) {
    req.log.debug?.({ err }, 'link-preview: błąd pobrania');
    data = {};
  }
  await cachePut(req.db, url, data);
  return reply.send(data);
}
