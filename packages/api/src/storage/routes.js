// Storage: pliki na dysku VPS — STORAGE_DIR/<tenant>/<bucket>/<ścieżka>.
// Odpowiednik supabase.storage: upload / remove / getPublicUrl / list.
// Buckety są publiczne do odczytu (tak jak dotąd w Supabase) — zapis wymaga logowania.
// WYJĄTKI (audyt 2026-10): buckety z danymi wrażliwymi — listowanie i usuwanie tylko z
// uprawnieniem modułu; deklaracje członkowskie (dane szczególnej kategorii) czytane wyłącznie
// przez podpisany, krótko ważny link (POST /api/storage/<bucket>/sign).
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { loadGrants } from '../dataapi/registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';

const BUCKET_RE = /^[a-z0-9-]+$/;

// Zdjęcia sprzętu robione telefonem mają 3–4 MB (12 Mpx) — po zapisie zmniejszamy je do
// rozsądnego rozmiaru (dłuższy bok 1600 px, JPEG/WebP/PNG w tym samym formacie). sharp
// ładowany leniwie: gdyby go zabrakło albo konwersja się nie udała, zostaje oryginał.
const SHRINK_BUCKETS = new Set(['equipment']);
const SHRINK_EXT = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };
let sharpLib;
async function shrinkImage(bucket, target) {
  const format = SHRINK_EXT[path.extname(target).toLowerCase()];
  if (!SHRINK_BUCKETS.has(bucket) || !format) return;
  try {
    if (sharpLib === undefined) sharpLib = (await import('sharp').catch(() => null))?.default ?? null;
    if (!sharpLib) return;
    const meta = await sharpLib(target).metadata();
    if (Math.max(meta.width || 0, meta.height || 0) <= 1600 && (await fsp.stat(target)).size < 600 * 1024) return;
    const out = await sharpLib(target)
      .rotate() // orientacja z EXIF (zdjęcia z iPhone'a)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .toFormat(format, format === 'png' ? { compressionLevel: 9 } : { quality: 80 })
      .toBuffer();
    if (out.length < (await fsp.stat(target)).size) await fsp.writeFile(target, out);
  } catch {
    // zostaje oryginał
  }
}

// Miniatury zdjęć na żądanie: GET /storage/<bucket>/<plik>?w=96. Awatary to często zdjęcia
// z telefonu (3–4 MB) pokazywane w kółku 40 px — lista rozmów ładowała je bardzo długo.
// Szerokości z białej listy (żadnego zalewu cache), krótszy bok = w (pod object-cover), WebP,
// zapis w STORAGE_DIR/<tenant>/.thumbs/<bucket>/<plik>@<w>.webp; odświeżane, gdy oryginał jest
// nowszy. Oryginał zostaje nietknięty; bez sharp albo przy błędzie → null (serwujemy oryginał).
export const THUMB_WIDTHS = new Set([48, 64, 96, 128, 192, 256]);
const THUMB_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export async function thumbnailFor(tenant, bucket, filePath, target, width, baseDir = config.STORAGE_DIR) {
  if (!THUMB_WIDTHS.has(width) || !THUMB_EXT.has(path.extname(target).toLowerCase())) return null;
  try {
    if (sharpLib === undefined) sharpLib = (await import('sharp').catch(() => null))?.default ?? null;
    if (!sharpLib) return null;
    const thumb = safeJoin(tenant, '.thumbs', `${bucket}/${filePath}@${width}.webp`, baseDir);
    const [src, existing] = await Promise.all([fsp.stat(target), fsp.stat(thumb).catch(() => null)]);
    if (existing && existing.mtimeMs >= src.mtimeMs) return thumb;
    await fsp.mkdir(path.dirname(thumb), { recursive: true });
    const out = await sharpLib(target)
      .rotate() // orientacja z EXIF (zdjęcia z iPhone'a)
      .resize({ width, height: width, fit: 'outside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    // Zapis przez plik tymczasowy + rename — równoległe żądania nie zobaczą połowy pliku.
    const tmp = `${thumb}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, out);
    await fsp.rename(tmp, thumb);
    return thumb;
  } catch {
    return null;
  }
}

// Znane buckety (jak w Supabase) — fail-closed na literówki.
const BUCKETS = new Set([
  'public-assets',
  'finance',
  'programs',
  'materials',
  'equipment',
  'kids-materials',
  'membership-declarations',
  'mail-attachments',
  'messenger-attachments',
  'form-uploads', // pola „plik/zdjęcie” i grafiki formularzy (brakowało → każdy upload 404)
]);

// Buckety wrażliwe: kto może listować/usuwać/podpisywać (dowolna z capability; admin zawsze).
const SENSITIVE = {
  'membership-declarations': ['module:members'],
  finance: ['module:finance'],
  'mail-attachments': ['module:mail'],
  'messenger-attachments': ['module:komunikator'],
};
// Odczyt bez podpisu zablokowany (tylko podpisany link albo pobranie z tokenem i uprawnieniem).
const SIGNED_READ = new Set(['membership-declarations']);

// Komunikator+ (K1): załączniki czatu. Podpis wydajemy TYLKO uczestnikowi rozmowy, której id
// jest pierwszym segmentem ścieżki (<conversationId>/plik — tak zapisuje aplikacja); admin
// aplikacji — jak dotąd. Starsze ścieżki webu (attachments/…, voice-messages/…) bez id rozmowy:
// uczestnik rozmowy, w której wiadomości jest ten plik. Odczyt bez podpisu blokujemy dopiero
// po włączeniu app_settings.chat_private_files = 'on' (starsze wersje aplikacji bez OTA widzą
// zdjęcia zwykłym adresem). Obrazki mailingu (mailing-images/…) zawsze publiczne — ładują je
// programy pocztowe odbiorców.
const MESSENGER_BUCKET = 'messenger-attachments';
const MESSENGER_PUBLIC_PREFIXES = ['mailing-images/'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ścieżka względna w buckecie: bez „/” na początku, znormalizowana; wyjście w górę (`..`) = null.
export function cleanRelPath(raw) {
  const p = path.posix.normalize(String(raw ?? '').replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!p || p === '.' || p === '..' || p.startsWith('../')) return null;
  return p;
}

// Ścieżka z żądania podpisu: sama ścieżka w buckecie (przyjmujemy też pełny adres pliku),
// bez zapytania i kotwicy, zdekodowana jak parametr trasy GET.
export function normalizeSignPath(raw) {
  let p = String(raw || '').trim().replace(/[?#].*$/, '');
  const marker = `/storage/${MESSENGER_BUCKET}/`;
  const i = p.indexOf(marker);
  if (i >= 0) p = p.slice(i + marker.length);
  p = p.replace(/^\/+/, '');
  if (p.startsWith(`${MESSENGER_BUCKET}/`)) p = p.slice(MESSENGER_BUCKET.length + 1);
  try { if (/%[0-9a-f]{2}/i.test(p)) p = decodeURIComponent(p); } catch { /* zostaje surowa */ }
  return cleanRelPath(p);
}

// Id rozmowy z pierwszego segmentu ścieżki (albo null dla starszych ścieżek).
export function conversationIdFromPath(filePath) {
  const first = String(filePath || '').split('/')[0];
  return UUID_RE.test(first) ? first : null;
}

export const isPublicMessengerPath = (filePath) => MESSENGER_PUBLIC_PREFIXES.some((p) => String(filePath || '').startsWith(p));

async function isAppAdminReq(req) {
  try {
    const { rows } = await req.db.query(`SELECT is_super_admin, role FROM app_users WHERE id = $1`, [req.user.id]);
    if (rows[0]?.is_super_admin) return true;
    const { adminRoles } = await loadGrants(req.db, req.tenant.db_name);
    return adminRoles.has(rows[0]?.role ?? req.user.role);
  } catch {
    return false;
  }
}

async function canSignMessengerFile(req, filePath) {
  if (isPublicMessengerPath(filePath)) return true;
  if (await isAppAdminReq(req)) return true;
  const email = String(req.user?.email || '').toLowerCase();
  if (!email) return false;
  const convId = conversationIdFromPath(filePath);
  try {
    if (convId) {
      const { rows } = await req.db.query(
        `SELECT 1 FROM conversation_participants WHERE conversation_id::text = $1 AND lower(user_email) = $2 LIMIT 1`,
        [convId, email]);
      return rows.length > 0;
    }
    // Starsza ścieżka — szukamy wiadomości z tym plikiem w moich rozmowach.
    const like = `%/${MESSENGER_BUCKET}/${filePath.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await req.db.query(
      `SELECT 1 FROM messages m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $2
        WHERE m.attachments::text LIKE $1 LIMIT 1`,
      [like, email]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// app_settings.chat_private_files (cache 60 s per tenant).
const privateFilesCache = new Map();
async function chatPrivateFiles(req) {
  const key = req.tenant?.db_name;
  const hit = privateFilesCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.on;
  let on = false;
  try {
    const { rows } = await req.db.query(`SELECT value FROM app_settings WHERE key = 'chat_private_files' LIMIT 1`);
    on = String(rows[0]?.value ?? '').trim().replace(/^"(.*)"$/, '$1').toLowerCase() === 'on';
  } catch { /* brak — wyłączone */ }
  privateFilesCache.set(key, { on, at: Date.now() });
  return on;
}

function validSignature(req, bucket, filePath) {
  const exp = Number(req.query?.exp);
  const sig = String(req.query?.sig || '');
  const expected = Number.isFinite(exp) ? signFor(req.tenant.slug, bucket, filePath, exp) : '';
  return !!expected && sig.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && exp >= Date.now() / 1000;
}

async function canUseBucket(req, bucket) {
  const caps = SENSITIVE[bucket];
  if (!caps) return true;
  try {
    const { rows } = await req.db.query(`SELECT is_super_admin, role FROM app_users WHERE id = $1`, [req.user.id]);
    const role = rows[0]?.role ?? req.user.role;
    if (rows[0]?.is_super_admin) return true;
    const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
    if (adminRoles.has(role)) return true;
    if (grants === null) return true; // tryb legacy (przed migracją uprawnień) — jak reszta API
    const resolver = makeResolver(grants, { role, userId: req.user.id, isAdmin: false });
    return caps.some((c) => resolver.can(c));
  } catch {
    return false;
  }
}

const signFor = (tenant, bucket, filePath, exp) =>
  crypto.createHmac('sha256', config.JWT_SECRET).update(`${tenant}|${bucket}|${filePath}|${exp}`).digest('hex');

// Ścieżka MUSI zostać w katalogu bucketu tego tenanta. Parametr „*” trasy jest dekodowany
// (`..%2f` → `../`), więc wcześniejsze sprawdzenie samego katalogu głównego STORAGE_DIR
// przepuszczało odczyt z innego bucketu (np. deklaracji bez podpisu) albo innego kościoła.
export function safeJoin(tenant, bucket, rel = '', baseDir = config.STORAGE_DIR) {
  const root = path.resolve(baseDir, String(tenant), String(bucket));
  const target = path.resolve(root, String(rel ?? ''));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Nieprawidłowa ścieżka'), { status: 400, statusCode: 400 });
  }
  return target;
}

function assertBucket(bucket) {
  if (!BUCKET_RE.test(bucket) || !BUCKETS.has(bucket)) {
    throw Object.assign(new Error(`Nieznany bucket: ${bucket}`), { status: 404 });
  }
}

// Stare nazwy bucketów z aplikacji mobilnej (do 2026-10 mobilka wysyłała zdjęcia czatu do
// „messenger_attachments” — serwer odrzucał je jako nieznany bucket). Starsze wersje apki
// bez aktualizacji OTA dalej tak wysyłają, więc mapujemy nazwę na właściwą.
const BUCKET_ALIASES = { messenger_attachments: 'messenger-attachments' };

export default async function storageRoutes(app) {
  app.addHook('preHandler', async (req) => {
    const b = req.params?.bucket;
    if (b && BUCKET_ALIASES[b]) req.params.bucket = BUCKET_ALIASES[b];
  });

  // Upload: multipart (pole "file") lub surowe body. Ścieżka w wildcard.
  app.post(
    '/api/storage/:bucket/*',
    { preHandler: app.requireUser, bodyLimit: 50 * 1024 * 1024 },
    async (req, reply) => {
      const { bucket } = req.params;
      const filePath = req.params['*'];
      assertBucket(bucket);
      if (!filePath) return reply.code(400).send({ error: 'Brak ścieżki pliku' });

      const target = safeJoin(req.tenant.slug, bucket, filePath);
      const upsert = String(req.headers['x-upsert'] || 'false') === 'true';
      if (!upsert && fs.existsSync(target)) {
        return reply.code(409).send({ error: 'Plik już istnieje', code: 'Duplicate' });
      }
      await fsp.mkdir(path.dirname(target), { recursive: true });

      if (req.isMultipart?.()) {
        const file = await req.file();
        if (!file) return reply.code(400).send({ error: 'Brak pliku' });
        await pipeline(file.file, fs.createWriteStream(target));
      } else {
        // surowe body (Buffer z addContentTypeParser w server.js)
        await fsp.writeFile(target, req.body);
      }
      await shrinkImage(bucket, target);
      return reply.send({ path: filePath, fullPath: `${bucket}/${filePath}`, id: filePath });
    }
  );

  // Usuwanie: body { paths: ["a/b.png", ...] }
  app.delete('/api/storage/:bucket', { preHandler: app.requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    assertBucket(bucket);
    if (!(await canUseBucket(req, bucket))) return reply.code(403).send({ error: 'Brak uprawnień do usuwania tych plików' });
    const paths = req.body?.paths || [];
    const removed = [];
    for (const p of paths) {
      const target = safeJoin(req.tenant.slug, bucket, String(p));
      try {
        await fsp.unlink(target);
        removed.push(p);
      } catch {
        // brak pliku — ignoruj (semantyka supabase remove)
      }
    }
    return reply.send({ data: removed.map((name) => ({ name })) });
  });

  // Listowanie (używane rzadko; wspieramy prefix)
  app.post('/api/storage/:bucket/list', { preHandler: app.requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    assertBucket(bucket);
    if (!(await canUseBucket(req, bucket))) return reply.code(403).send({ error: 'Brak uprawnień do przeglądania tych plików' });
    const prefix = String(req.body?.prefix || '');
    const dir = safeJoin(req.tenant.slug, bucket, prefix);
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const data = await Promise.all(
        entries.map(async (e) => {
          const stat = e.isFile() ? await fsp.stat(path.join(dir, e.name)) : null;
          return {
            name: e.name,
            id: path.posix.join(prefix, e.name),
            metadata: stat ? { size: stat.size, lastModified: stat.mtime.toISOString() } : null,
          };
        })
      );
      return reply.send({ data });
    } catch {
      return reply.send({ data: [] });
    }
  });

  // Podpisany link do pliku z bucketu wrażliwego (ważny domyślnie 5 min).
  app.post('/api/storage/:bucket/sign', { preHandler: app.requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    assertBucket(bucket);
    const filePath = bucket === MESSENGER_BUCKET
      ? normalizeSignPath(req.body?.path)
      : cleanRelPath(req.body?.path);
    if (!filePath) return reply.code(400).send({ error: 'Brak ścieżki pliku' });
    const allowed = bucket === MESSENGER_BUCKET
      ? await canSignMessengerFile(req, filePath)
      : await canUseBucket(req, bucket);
    if (!allowed) return reply.code(403).send({ error: 'Brak uprawnień do tego pliku' });
    const ttl = Math.min(Math.max(Number(req.body?.expiresIn) || 300, 30), 3600);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sig = signFor(req.tenant.slug, bucket, filePath, exp);
    const urlPath = filePath.split('/').map((s) => encodeURIComponent(s)).join('/');
    return reply.send({ signedPath: `/storage/${bucket}/${urlPath}?exp=${exp}&sig=${sig}` });
  });

  // Publiczny odczyt: GET /storage/<bucket>/<ścieżka> na subdomenie tenanta.
  // (Caddy może to serwować bezpośrednio z dysku — ta trasa to fallback/dev.)
  app.get('/storage/:bucket/*', async (req, reply) => {
    const { bucket } = req.params;
    const filePath = cleanRelPath(req.params['*']);
    try {
      assertBucket(bucket);
    } catch (err) {
      return reply.code(err.status || 404).send({ error: err.message });
    }
    if (!req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
    if (!filePath) return reply.code(400).send({ error: 'Nieprawidłowa ścieżka' });
    const signedOnly = SIGNED_READ.has(bucket)
      || (bucket === MESSENGER_BUCKET && !isPublicMessengerPath(filePath) && (await chatPrivateFiles(req)));
    if (signedOnly && !validSignature(req, bucket, filePath)) {
      return reply.code(403).send({ error: 'Link do pliku wygasł albo jest nieprawidłowy' });
    }
    // Podpisany link do prywatnego pliku nie powinien trafiać do cache pośredników.
    if (req.query?.sig) reply.header('Cache-Control', 'private, max-age=300');
    const target = safeJoin(req.tenant.slug, bucket, filePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return reply.code(404).send({ error: 'Nie znaleziono pliku' });
    }
    const width = Number(req.query?.w);
    if (width && !signedOnly) {
      const thumb = await thumbnailFor(req.tenant.slug, bucket, filePath, target, width);
      if (thumb) {
        // Nazwy awatarów zawierają znacznik czasu (nowe zdjęcie = nowy adres), a miniatura
        // odświeża się po zmianie oryginału — tydzień w cache przeglądarki jest bezpieczny.
        reply.header('Cache-Control', 'public, max-age=604800');
        return reply.type('image/webp').send(fs.createReadStream(thumb));
      }
    }
    return reply.sendFile
      ? reply.sendFile(target) // jeśli zarejestrowano @fastify/static
      : reply.type(mimeFor(target)).send(fs.createReadStream(target));
  });
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain', '.csv': 'text/csv',
    '.zip': 'application/zip', '.pro6': 'application/octet-stream', '.pro7': 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}
