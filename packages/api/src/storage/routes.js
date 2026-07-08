// Storage: pliki na dysku VPS — STORAGE_DIR/<tenant>/<bucket>/<ścieżka>.
// Odpowiednik supabase.storage: upload / remove / getPublicUrl / list.
// Buckety są publiczne do odczytu (tak jak dotąd w Supabase) — zapis wymaga logowania.
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const BUCKET_RE = /^[a-z0-9-]+$/;

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
]);

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
      return reply.send({ path: filePath, fullPath: `${bucket}/${filePath}`, id: filePath });
    }
  );

  // Usuwanie: body { paths: ["a/b.png", ...] }
  app.delete('/api/storage/:bucket', { preHandler: app.requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    assertBucket(bucket);
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
