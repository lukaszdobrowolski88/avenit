// Social Media — publikacja jednego celu (post × kanał) na Facebooku i Instagramie.
//
// publishTarget(ctx, { account, token, content, media, options, progress }) →
//   { status: 'published', external_id, permalink } — gotowe,
//   { status: 'processing', progress }             — Instagram jeszcze przetwarza plik (wideo,
//                                                     elementy karuzeli); worker wróci za minutę
//                                                     z zapisanym postępem (te same kontenery),
//   rzuca SocialError                              — błąd (retryable → ponowienie z przerwą).
//
// Pliki: Meta pobiera je sama z publicznego adresu storage (bucket social-media). Instagram
// przyjmuje tylko JPEG o proporcjach 4:5–1,91:1 — przed wysłaniem robimy kopię JPEG (sharp),
// przyciętą do środka, gdy proporcje wychodzą poza zakres. Facebook dostaje JPEG/PNG/GIF bez zmian.
import fsp from 'node:fs/promises';
import { graph, graphVideoBase, SocialError, classifyMetaError } from './meta.js';
import { config } from '../config.js';
import { storagePath, publicStorageUrl } from '../storage/files.js';
import {
  facebookShape, instagramFormat, instagramImageCrop, firstUrl, isVideo, SOCIAL_PROVIDERS,
} from '@avenit/shared/src/lib/social.js';

export const SOCIAL_BUCKET = 'social-media';
// Ścieżka pliku w buckecie: <katalog>/<nazwa> bez „..” i ukośnika na początku.
export const MEDIA_PATH_RE = /^[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9._-]{1,200}$/;

let sharpLib;
async function loadSharp() {
  if (sharpLib === undefined) sharpLib = (await import('sharp').catch(() => null))?.default ?? null;
  return sharpLib;
}

const FB_OK_MIME = new Set(['image/jpeg', 'image/png', 'image/gif']);

// Publiczny adres pliku; dla zdjęć w razie potrzeby kopia JPEG (i przycięcie dla Instagrama).
export async function mediaUrl(ctx, m, { provider, format } = {}) {
  if (!m?.path || !MEDIA_PATH_RE.test(m.path) || m.path.includes('..')) {
    throw new SocialError('Nieprawidłowy plik w poście.', { code: 'bad_media' });
  }
  const host = ctx.tenantSubdomain || ctx.tenantSlug;
  const direct = publicStorageUrl(host, SOCIAL_BUCKET, m.path.split('/').map(encodeURIComponent).join('/'));
  if (isVideo(m)) return direct;
  const mime = String(m.mime || '').toLowerCase();
  const crop = provider === 'instagram' && format === 'feed' ? instagramImageCrop(m.width, m.height) : null;
  const needsJpeg = provider === 'instagram' ? (mime !== 'image/jpeg' || crop) : !FB_OK_MIME.has(mime);
  if (!needsJpeg) return direct;
  const convert = ctx.deps?.convertImage || convertToJpeg;
  const outPath = await convert(ctx, m, { crop: crop?.target || null, suffix: provider === 'instagram' ? (crop ? 'ig' : 'jpg') : 'jpg' });
  return publicStorageUrl(host, SOCIAL_BUCKET, outPath.split('/').map(encodeURIComponent).join('/'));
}

// Kopia JPEG obok oryginału: <ścieżka>.<suffix>.jpg (raz — kolejne publikacje biorą istniejącą).
async function convertToJpeg(ctx, m, { crop, suffix }) {
  const outRel = `${m.path}.${suffix}.jpg`;
  const src = storagePath(ctx.tenantSlug, SOCIAL_BUCKET, m.path);
  const dst = storagePath(ctx.tenantSlug, SOCIAL_BUCKET, outRel);
  try { await fsp.access(dst); return outRel; } catch { /* brak — tworzymy */ }
  const sharp = await loadSharp();
  if (!sharp) throw new SocialError('Serwer nie może przygotować zdjęcia (brak konwertera).', { code: 'no_sharp', status: 500 });
  let img = sharp(src, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  let w = meta.width || 0, h = meta.height || 0;
  if ((meta.orientation || 1) >= 5) [w, h] = [h, w];
  if (crop && w && h) {
    const ratio = w / h;
    if (ratio > crop) {
      const nw = Math.round(h * crop);
      img = img.extract({ left: Math.round((w - nw) / 2), top: 0, width: nw, height: h });
      w = nw;
    } else {
      const nh = Math.round(w / crop);
      img = img.extract({ left: 0, top: Math.round((h - nh) / 2), width: w, height: nh });
      h = nh;
    }
  }
  if (w > 2048) img = img.resize({ width: 2048, withoutEnlargement: true });
  const buf = await img.flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  await fsp.writeFile(dst, buf);
  return outRel;
}

const absFacebookUrl = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `https://www.facebook.com${u.startsWith('/') ? '' : '/'}${u}`);

// ── Facebook: rolka (Reels API, 3 kroki: start → wgranie z adresu → finish, potem przetwarzanie) ──
async function publishFacebookReel(ctx, { account, token, content, media, progress }) {
  const page = account.external_id;
  const p = { ...(progress || {}) };
  const video = media.find(isVideo);
  if (!video) throw new SocialError('Rolka wymaga wideo.', { code: 'bad_media' });
  if (!p.reel_video_id) {
    const start = await graph('POST', `/${page}/video_reels`, { token, params: { upload_phase: 'start' } });
    if (!start?.video_id) throw new SocialError('Facebook nie rozpoczął wgrywania rolki.', { code: 'provider' });
    const fileUrl = await mediaUrl(ctx, video, { provider: 'facebook' });
    const uploadUrl = start.upload_url || `https://rupload.facebook.com/video-upload/${config.META_GRAPH_VERSION || 'v26.0'}/${start.video_id}`;
    let res;
    try {
      res = await globalThis.fetch(uploadUrl, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: fileUrl } });
    } catch {
      throw new SocialError('Brak połączenia z Meta — ponowimy publikację.', { code: 'network', status: 503, retryable: true });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error || body?.success === false) throw classifyMetaError(body, res.status);
    p.reel_video_id = String(start.video_id);
  }
  if (!p.finished) {
    await graph('POST', `/${page}/video_reels`, {
      token, params: { upload_phase: 'finish', video_id: p.reel_video_id, video_state: 'PUBLISHED', description: content || undefined },
    });
    p.finished = true;
  }
  const st = await graph('GET', `/${p.reel_video_id}`, { token, params: { fields: 'status' } });
  const vs = st?.status?.video_status;
  const phase = st?.status?.publishing_phase?.status;
  if (vs === 'error' || phase === 'error' || st?.status?.processing_phase?.status === 'error') {
    throw new SocialError('Facebook odrzucił rolkę: wideo nie spełnia wymagań (pionowe MP4/H.264, 3–90 s).', { code: 'remote_media' });
  }
  if (phase !== 'complete' && vs !== 'published') return { status: 'processing', progress: p };
  let permalink = null;
  try {
    const r = await graph('GET', `/${p.reel_video_id}`, { token, params: { fields: 'permalink_url' } });
    permalink = absFacebookUrl(r.permalink_url);
  } catch { /* link nie jest konieczny */ }
  return { status: 'published', external_id: p.reel_video_id, permalink };
}

// ── Facebook (strona) ─────────────────────────────────────────────────────────
async function publishFacebook(ctx, { account, token, content, media, options, progress }) {
  const page = account.external_id;
  const shape = facebookShape(media, options);
  if (shape === 'reel') return publishFacebookReel(ctx, { account, token, content, media, progress });
  const msg = content || undefined;
  let postId;
  if (shape === 'text') {
    const link = options.link || firstUrl(content) || undefined;
    const r = await graph('POST', `/${page}/feed`, { token, params: { message: msg, link } });
    postId = r.id;
  } else if (shape === 'photo') {
    const url = await mediaUrl(ctx, media[0], { provider: 'facebook' });
    const r = await graph('POST', `/${page}/photos`, { token, params: { url, message: msg } });
    postId = r.post_id || r.id;
  } else if (shape === 'album') {
    const params = { message: msg };
    let i = 0;
    for (const m of media) {
      const url = await mediaUrl(ctx, m, { provider: 'facebook' });
      const r = await graph('POST', `/${page}/photos`, { token, params: { url, published: false } });
      params[`attached_media[${i}]`] = { media_fbid: r.id };
      i += 1;
    }
    const r = await graph('POST', `/${page}/feed`, { token, params });
    postId = r.id;
  } else {
    const fileUrl = await mediaUrl(ctx, media.find(isVideo), { provider: 'facebook' });
    const r = await graph('POST', `/${page}/videos`, { token, base: graphVideoBase(), params: { file_url: fileUrl, description: msg } });
    postId = r.id;
  }
  if (!postId) throw new SocialError('Facebook nie zwrócił identyfikatora posta.', { code: 'provider' });
  let permalink = null;
  try {
    const r = await graph('GET', `/${postId}`, { token, params: { fields: 'permalink_url' } });
    permalink = absFacebookUrl(r.permalink_url);
  } catch { /* link nie jest konieczny */ }
  return { status: 'published', external_id: String(postId), permalink };
}

// ── Instagram (konto firmowe) ─────────────────────────────────────────────────
// Stan kontenera: FINISHED / IN_PROGRESS / ERROR / EXPIRED / PUBLISHED.
async function containerStatus(token, id) {
  const r = await graph('GET', `/${id}`, { token, params: { fields: 'status_code,status' } });
  return { code: String(r.status_code || 'IN_PROGRESS'), detail: r.status || '' };
}

function containerError(st) {
  const why = st.code === 'EXPIRED' ? 'plik wygasł przed publikacją' : (st.detail || 'plik nie spełnia wymagań');
  return new SocialError(`Instagram odrzucił plik: ${why}. Sprawdź format (MP4/H.264, JPEG) i długość wideo.`, { code: 'remote_media' });
}

// Czy wszystkie kontenery gotowe? Zdjęcia zwykle są od razu — krótkie dopytanie oszczędza minutę.
async function allReady(ctx, token, ids, { tries = 1 } = {}) {
  const sleep = ctx.deps?.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let t = 0; t < tries; t += 1) {
    let pending = false;
    for (const id of ids) {
      const st = await containerStatus(token, id);
      if (st.code === 'ERROR' || st.code === 'EXPIRED') throw containerError(st);
      if (st.code !== 'FINISHED' && st.code !== 'PUBLISHED') pending = true;
    }
    if (!pending) return true;
    if (t < tries - 1) await sleep(1500);
  }
  return false;
}

async function publishInstagram(ctx, { account, token, content, media, options, progress }) {
  const ig = account.external_id;
  const format = instagramFormat(media, options);
  const p = { ...(progress || {}) };
  const hasVideo = media.some(isVideo);
  const caption = format === 'story' ? undefined : (content || undefined);

  if (!p.container) {
    if (format === 'feed' && media.length > 1) {
      if (!Array.isArray(p.children) || !p.children.length) {
        p.children = [];
        for (const m of media) {
          const url = await mediaUrl(ctx, m, { provider: 'instagram', format: 'feed' });
          const params = isVideo(m)
            ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true }
            : { image_url: url, is_carousel_item: true, ...(m.alt ? { alt_text: String(m.alt).slice(0, 1000) } : {}) };
          const r = await graph('POST', `/${ig}/media`, { token, params });
          p.children.push(String(r.id));
        }
      }
      if (!(await allReady(ctx, token, p.children, { tries: hasVideo ? 1 : 3 }))) return { status: 'processing', progress: p };
      const r = await graph('POST', `/${ig}/media`, { token, params: { media_type: 'CAROUSEL', children: p.children.join(','), caption } });
      p.container = String(r.id);
    } else {
      const m = media[0];
      if (!m) throw new SocialError('Instagram wymaga zdjęcia albo wideo.', { code: 'bad_media' });
      const url = await mediaUrl(ctx, m, { provider: 'instagram', format });
      let params;
      if (format === 'story') params = { media_type: 'STORIES', ...(isVideo(m) ? { video_url: url } : { image_url: url }) };
      else if (format === 'reel') params = { media_type: 'REELS', video_url: url, caption, share_to_feed: options.share_to_feed !== false };
      else params = { image_url: url, caption, ...(m.alt ? { alt_text: String(m.alt).slice(0, 1000) } : {}) };
      const r = await graph('POST', `/${ig}/media`, { token, params });
      p.container = String(r.id);
    }
  }

  if (!(await allReady(ctx, token, [p.container], { tries: hasVideo ? 1 : 3 }))) return { status: 'processing', progress: p };

  const pub = await graph('POST', `/${ig}/media_publish`, { token, params: { creation_id: p.container } });
  if (!pub?.id) throw new SocialError('Instagram nie zwrócił identyfikatora posta.', { code: 'provider' });
  let permalink = null;
  try {
    const r = await graph('GET', `/${pub.id}`, { token, params: { fields: 'permalink' } });
    permalink = r.permalink || null;
  } catch { /* link nie jest konieczny */ }
  return { status: 'published', external_id: String(pub.id), permalink };
}

export async function publishTarget(ctx, args) {
  const provider = args.account?.provider;
  if (!SOCIAL_PROVIDERS[provider]) throw new SocialError('Nieobsługiwana sieć.', { code: 'provider' });
  if (provider === 'facebook') return publishFacebook(ctx, args);
  return publishInstagram(ctx, args);
}

// Pierwszy komentarz pod opublikowanym postem (jako strona / konto). Błąd nie cofa publikacji.
export async function postFirstComment({ account, token, externalId, message }) {
  if (!message || !externalId) return null;
  // Ten sam kształt dla obu sieci: /{id posta FB | id mediów IG}/comments.
  const r = await graph('POST', `/${externalId}/comments`, { token, params: { message: String(message).slice(0, 2200) } });
  return r?.id || null;
}
