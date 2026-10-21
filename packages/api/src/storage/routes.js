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
import { financeTeamTypes } from '../dataapi/financeScope.js';
import { isSignedMaterialsPath, materialsPathTeam } from '@avenit/shared/src/lib/materialsAccess.js';

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
export const THUMB_WIDTHS = new Set([48, 64, 96, 128, 192, 256, 384, 512, 768]); // do 768 — karty zdjęć (Wyposażenie)
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
// finance: faktury/paragony (audyt 2026-10-11) — wcześniej czytelne bez logowania po samym linku.
const SIGNED_READ = new Set(['membership-declarations', 'finance']);
// Bucket „materials” (Pliki modułów) zostaje czytelny zwykłym adresem — miniatury, <img src> i
// podgląd PDF w Plikach, materiałach wydarzeń i grupach domowych oraz pobieranie w mobilce
// nie wysyłają tokenu. Wyjątek (audyt 2026-10, runda 5): przestrzenie wrażliwe
// (materials/finance/…, members/…, care/…, giving/… — SENSITIVE_MATERIAL_TEAMS) tylko podpisanym
// linkiem, który wydajemy osobie z dostępem do modułu tej przestrzeni (canSignMaterialsFile).
const MATERIALS_BUCKET = 'materials';
const isSignedReadPath = (bucket, filePath) => bucket === MATERIALS_BUCKET && isSignedMaterialsPath(filePath);

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
    // Starsza ścieżka — plik musi występować WYŁĄCZNIE w wiadomościach moich rozmów. Samo „jest
    // w mojej rozmowie” nie wystarcza (runda 4): treści attachments nikt nie waliduje, więc
    // wklejenie cudzej ścieżki do własnej rozmowy dawało podpis cudzego pliku.
    const like = `%/${MESSENGER_BUCKET}/${filePath.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await req.db.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM conversation_participants cp
                 WHERE cp.conversation_id = m.conversation_id AND lower(cp.user_email) = $2))::int AS mine
         FROM messages m
        WHERE m.attachments::text LIKE $1`,
      [like, email]);
    return rows[0]?.n > 0 && rows[0].n === rows[0].mine;
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

// Podpis pliku z przestrzeni wrażliwej bucketu materials: dostęp do modułu tej przestrzeni
// (admin i tryb legacy — zawsze). Pozostałe ścieżki są publiczne — podpis niczego nie zmienia.
async function canSignMaterialsFile(req, filePath) {
  if (!isSignedMaterialsPath(filePath)) return true;
  try {
    const me = await callerAccess(req);
    return me.isAdmin || me.can(`module:${materialsPathTeam(filePath)}`);
  } catch {
    return false;
  }
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

// Uprawnienia wołającego: admin aplikacji albo resolver capability (null = legacy → jak admin).
async function callerAccess(req) {
  const { rows } = await req.db.query(`SELECT is_super_admin, role FROM app_users WHERE id = $1`, [req.user.id]);
  const role = rows[0]?.role ?? req.user.role;
  const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
  if (rows[0]?.is_super_admin || adminRoles.has(role) || grants === null) return { isAdmin: true, can: () => true };
  const resolver = makeResolver(grants, { role, userId: req.user.id, isAdmin: false });
  return { isAdmin: false, can: (c) => resolver.can(c) };
}

// Obsługa bucketu niewrażliwego (audyt 2026-10, runda 4): kto poza administratorem i autorem pliku
// może pliki nadpisywać, usuwać i listować. Brak wpisu / pusta lista = tylko administrator (i autor).
const BUCKET_STAFF = {
  materials: ['res:materials_files:delete'],
  'kids-materials': ['module:kids'],
  equipment: ['res:equipment:delete'],
  programs: ['res:programs:update'],
  'form-uploads': ['module:forms'],
  'public-assets': [],
};

async function isBucketStaff(req, bucket) {
  try {
    const me = await callerAccess(req);
    if (me.isAdmin) return true;
    if (bucket === MESSENGER_BUCKET) return false; // cudze załączniki czatu — tylko administrator
    const caps = SENSITIVE[bucket] || BUCKET_STAFF[bucket] || [];
    return caps.some((c) => me.can(c));
  } catch {
    return false;
  }
}

// Kto wgrał plik (rejestr storage_objects, migracja 105) — e-mail małymi literami albo null.
async function uploaderOf(req, bucket, filePath) {
  try {
    const { rows } = await req.db.query(
      `SELECT lower(uploaded_by) AS u FROM storage_objects WHERE bucket = $1 AND path = $2`, [bucket, filePath]);
    return rows[0]?.u ?? null;
  } catch {
    return null;
  }
}

async function isUploader(req, bucket, filePath) {
  const me = String(req.user?.email || '').toLowerCase();
  return !!me && (await uploaderOf(req, bucket, filePath)) === me;
}

async function recordUpload(req, bucket, filePath) {
  try {
    await req.db.query(
      `INSERT INTO storage_objects (bucket, path, uploaded_by) VALUES ($1, $2, $3)
       ON CONFLICT (bucket, path) DO UPDATE SET uploaded_by = EXCLUDED.uploaded_by, updated_at = now()`,
      [bucket, filePath, String(req.user?.email || '').toLowerCase()]);
  } catch (err) {
    req.log?.warn?.({ err }, 'storage_objects: zapis autora pliku nie powiódł się');
  }
}

// Czy wolno wgrać plik (nowy albo nadpisać istniejący). Zwraca komunikat odmowy albo null.
export async function uploadDenied(req, bucket, filePath, { overwrite }) {
  if (bucket === 'finance') {
    return (await canUploadFinance(req, { overwrite })) ? null : 'Brak uprawnień do dodawania dokumentów finansowych';
  }
  if (bucket === MESSENGER_BUCKET) {
    const me = await callerAccess(req).catch(() => null);
    if (!me) return 'Brak uprawnień';
    if (!me.isAdmin) {
      if (isPublicMessengerPath(filePath)) {
        if (!me.can('module:mailing')) return 'Grafiki mailingu dodaje obsługa mailingu';
      } else {
        if (!me.can('module:komunikator')) return 'Brak dostępu do Komunikatora';
        const convId = conversationIdFromPath(filePath);
        if (convId) {
          const email = String(req.user?.email || '').toLowerCase();
          const { rows } = await req.db.query(
            `SELECT 1 FROM conversation_participants WHERE conversation_id::text = $1 AND lower(user_email) = $2 LIMIT 1`,
            [convId, email]);
          if (!rows.length) return 'Załącznik dodajesz tylko w swojej rozmowie';
        }
      }
      if (overwrite && !(await isUploader(req, bucket, filePath))) return 'Nie możesz podmienić cudzego pliku';
    }
    return null;
  }
  if (SENSITIVE[bucket]) return (await canUseBucket(req, bucket)) ? null : 'Brak uprawnień do tego bucketu';
  // Pliki przestrzeni wrażliwej (materials/finance/… itd.) wgrywa tylko osoba z dostępem do jej modułu.
  if (isSignedReadPath(bucket, filePath) && !(await canSignMaterialsFile(req, filePath))) {
    return 'Pliki tej przestrzeni dodaje osoba z dostępem do jej modułu';
  }
  if (overwrite && !(await isBucketStaff(req, bucket)) && !(await isUploader(req, bucket, filePath))) {
    return 'Nie możesz podmienić cudzego pliku';
  }
  return null;
}

// Wrzucanie do bucketu finance: pełne Finanse albo lider służby (zakładka Finanse swojej
// służby — wniosek o wydatek z załącznikiem). Nadpisanie istniejącego pliku — tylko pełne Finanse.
async function canUploadFinance(req, { overwrite }) {
  if (await canUseBucket(req, 'finance')) return true;
  if (overwrite) return false;
  try {
    const { rows } = await req.db.query(`SELECT role FROM app_users WHERE id = $1`, [req.user.id]);
    const { grants } = await loadGrants(req.db, req.tenant.db_name);
    if (grants === null) return false;
    const resolver = makeResolver(grants, { role: rows[0]?.role ?? req.user.role, userId: req.user.id, isAdmin: false });
    return (await financeTeamTypes(req.db, resolver)).length > 0;
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

      const rel = cleanRelPath(filePath);
      if (!rel) return reply.code(400).send({ error: 'Nieprawidłowa ścieżka' });
      const target = safeJoin(req.tenant.slug, bucket, rel);
      const upsert = String(req.headers['x-upsert'] || 'false') === 'true';
      const exists = fs.existsSync(target);
      if (!upsert && exists) {
        return reply.code(409).send({ error: 'Plik już istnieje', code: 'Duplicate' });
      }
      // finance: jak dotąd sam nagłówek upsert = nadpisanie; reszta — faktyczne nadpisanie pliku.
      const denied = await uploadDenied(req, bucket, rel, { overwrite: bucket === 'finance' ? upsert : exists });
      if (denied) return reply.code(403).send({ error: denied });
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
      await recordUpload(req, bucket, rel);
      return reply.send({ path: filePath, fullPath: `${bucket}/${filePath}`, id: filePath });
    }
  );

  // Usuwanie: body { paths: ["a/b.png", ...] }
  app.delete('/api/storage/:bucket', { preHandler: app.requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    assertBucket(bucket);
    // Usuwa administrator / obsługa bucketu, a pozostali — tylko pliki, które sami wgrali
    // (rejestr storage_objects). Załączniki czatu: administrator albo autor (runda 4).
    const staff = SENSITIVE[bucket] && bucket !== MESSENGER_BUCKET
      ? await canUseBucket(req, bucket)
      : await isBucketStaff(req, bucket);
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    if (!staff && SENSITIVE[bucket] && bucket !== MESSENGER_BUCKET) {
      return reply.code(403).send({ error: 'Brak uprawnień do usuwania tych plików' });
    }
    const removed = [];
    for (const p of paths) {
      const rel = cleanRelPath(p);
      if (!rel) continue;
      if (!staff && !(await isUploader(req, bucket, rel))) {
        return reply.code(403).send({ error: 'Możesz usuwać tylko pliki, które sam dodałeś' });
      }
    }
    for (const p of paths) {
      const rel = cleanRelPath(p);
      if (!rel) continue;
      const target = safeJoin(req.tenant.slug, bucket, rel);
      try {
        await fsp.unlink(target);
        removed.push(p);
        await req.db.query(`DELETE FROM storage_objects WHERE bucket = $1 AND path = $2`, [bucket, rel]).catch(() => {});
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
    // Listowanie zdradza nazwy cudzych plików (także z odpowiedzi formularzy, czatów) — tylko
    // administrator i obsługa bucketu (żaden ekran aplikacji nie listuje bucketów).
    if (!(await isBucketStaff(req, bucket))) return reply.code(403).send({ error: 'Brak uprawnień do przeglądania tych plików' });
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
      : bucket === MATERIALS_BUCKET
        ? await canSignMaterialsFile(req, filePath)
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
    const signedOnly = SIGNED_READ.has(bucket) || isSignedReadPath(bucket, filePath)
      || (bucket === MESSENGER_BUCKET && !isPublicMessengerPath(filePath) && (await chatPrivateFiles(req)));
    if (signedOnly && !validSignature(req, bucket, filePath)) {
      return reply.code(403).send({ error: 'Link do pliku wygasł albo jest nieprawidłowy' });
    }
    // Podpisany link do prywatnego pliku nie powinien trafiać do cache pośredników.
    if (req.query?.sig) reply.header('Cache-Control', 'private, max-age=300');
    // Pliki użytkowników na domenie aplikacji (audyt 2026-10, runda 4): SVG z <script> otwarty
    // wprost wykonywał JS w originie aplikacji (przejęcie sesji). Bez zgadywania typu i z
    // piaskownicą CSP — obrazki w <img> działają jak dotąd, skrypty w plikach nie. PDF bez CSP
    // (przeglądarkowy podgląd PDF nie działa w piaskownicy).
    reply.header('X-Content-Type-Options', 'nosniff');
    if (mimeFor(filePath) !== 'application/pdf') reply.header('Content-Security-Policy', STORAGE_CSP);
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
    return sendFileWithRanges(req, reply, target);
  });
}

// Zakres bajtów z nagłówka Range (jeden przedział) → { start, end } | null (całość) | 'invalid' (416).
// Obsługujemy „bytes=a-b”, „bytes=a-” i „bytes=-n” (ostatnie n bajtów); kilka przedziałów — całość.
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start;
  let end;
  if (a === '') {
    const n = Number(b);
    if (!n) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

// Plik z dysku z typem, długością i zakresami (Range → 206). AVPlayer (iOS: głosówki w aplikacji,
// audio/wideo w Safari) gra plik z sieci tylko, gdy serwer obsługuje zakresy — wcześniej szła
// całość strumieniem (200, bez Content-Length, .m4a jako application/octet-stream) i nagrań
// głosowych nie dało się odsłuchać na iPhonie.
function sendFileWithRanges(req, reply, target) {
  const size = fs.statSync(target).size;
  reply.header('Accept-Ranges', 'bytes');
  reply.type(mimeFor(target));
  const range = parseRange(req.headers?.range, size);
  if (range === 'invalid') {
    reply.header('Content-Range', `bytes */${size}`);
    return reply.code(416).send();
  }
  if (range) {
    reply.code(206);
    reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    reply.header('Content-Length', String(range.end - range.start + 1));
    return reply.send(fs.createReadStream(target, { start: range.start, end: range.end }));
  }
  reply.header('Content-Length', String(size));
  return reply.send(fs.createReadStream(target));
}

export const STORAGE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

export function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain', '.csv': 'text/csv',
    // Nagrania głosowe i multimedia z telefonów / przeglądarek (głosówki: .m4a z iPhone'a,
    // .mp4/.webm z webu, .3gp/.aac z Androida) — z typem audio odtwarzacze je grają.
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.3gp': 'audio/3gpp', '.webm': 'audio/webm',
    '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.caf': 'audio/x-caf',
    '.mov': 'video/quicktime', '.heic': 'image/heic',
    '.zip': 'application/zip', '.pro6': 'application/octet-stream', '.pro7': 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}
