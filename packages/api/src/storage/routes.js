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

function safeJoin(...parts) {
  const base = path.resolve(config.STORAGE_DIR);
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw Object.assign(new Error('Nieprawidłowa ścieżka'), { status: 400 });
  }
  return target;
}

function assertBucket(bucket) {
  if (!BUCKET_RE.test(bucket) || !BUCKETS.has(bucket)) {
    throw Object.assign(new Error(`Nieznany bucket: ${bucket}`), { status: 404 });
  }
}

export default async function storageRoutes(app) {
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
    const filePath = String(req.body?.path || '').replace(/^\//, '');
    if (!filePath) return reply.code(400).send({ error: 'Brak ścieżki pliku' });
    if (!(await canUseBucket(req, bucket))) return reply.code(403).send({ error: 'Brak uprawnień do tego pliku' });
    const ttl = Math.min(Math.max(Number(req.body?.expiresIn) || 300, 30), 3600);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sig = signFor(req.tenant.slug, bucket, filePath, exp);
    return reply.send({ signedPath: `/storage/${bucket}/${filePath}?exp=${exp}&sig=${sig}` });
  });

  // Publiczny odczyt: GET /storage/<bucket>/<ścieżka> na subdomenie tenanta.
  // (Caddy może to serwować bezpośrednio z dysku — ta trasa to fallback/dev.)
  app.get('/storage/:bucket/*', async (req, reply) => {
    const { bucket } = req.params;
    const filePath = req.params['*'];
    try {
      assertBucket(bucket);
    } catch (err) {
      return reply.code(err.status || 404).send({ error: err.message });
    }
    if (!req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
    if (SIGNED_READ.has(bucket)) {
      const exp = Number(req.query?.exp);
      const sig = String(req.query?.sig || '');
      const expected = Number.isFinite(exp) ? signFor(req.tenant.slug, bucket, filePath, exp) : '';
      const valid = expected && sig.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && exp >= Date.now() / 1000;
      if (!valid) return reply.code(403).send({ error: 'Link do pliku wygasł albo jest nieprawidłowy' });
    }
    const target = safeJoin(req.tenant.slug, bucket, filePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return reply.code(404).send({ error: 'Nie znaleziono pliku' });
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
