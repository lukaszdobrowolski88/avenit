// Social Media (migracja 121): wspólne reguły web ↔ serwer — sieci, limity, walidacja posta
// dla kanału, statusy i kolejka publikacji (sloty w czasie polskim).
//
// Te same funkcje liczą licznik znaków i błędy w kompozytorze oraz pilnują ich na serwerze
// przed zaplanowaniem — przeglądarka nie może „przepchnąć” posta, którego sieć nie przyjmie.
import { warsawParts, warsawToDate } from './chatSchedule.js';

export const SOCIAL_PROVIDERS = {
  facebook: {
    key: 'facebook', label: 'Facebook', color: '#1877F2',
    maxChars: 63206, maxImages: 10, maxVideos: 1,
    formats: ['post', 'reel'],
    // Rolka na Facebooku: pionowe wideo 3–90 s.
    reelMinSec: 3, reelMaxSec: 90,
  },
  instagram: {
    key: 'instagram', label: 'Instagram', color: '#E1306C',
    maxChars: 2200, maxHashtags: 30, maxMentions: 20, maxImages: 10, maxVideos: 10,
    formats: ['feed', 'reel', 'story'],
    // Proporcje zdjęcia w poście (szerokość / wysokość): od 4:5 do 1,91:1 — poza zakresem
    // serwer przycina środek przed wysłaniem (instagramImageCrop).
    minRatio: 4 / 5, maxRatio: 1.91,
  },
};

export const SOCIAL_PROVIDER_KEYS = Object.keys(SOCIAL_PROVIDERS);
export const IG_FORMAT_LABELS = { feed: 'Post', reel: 'Rolka', story: 'Relacja' };
export const FB_FORMAT_LABELS = { post: 'Post', reel: 'Rolka' };

// Statusy posta (całość) i publikacji w kanale.
export const POST_STATUSES = ['draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partial', 'failed'];
export const POST_STATUS_LABELS = {
  draft: 'Szkic',
  pending_approval: 'Do akceptacji',
  scheduled: 'Zaplanowany',
  publishing: 'Publikowanie',
  published: 'Opublikowany',
  partial: 'Częściowo opublikowany',
  failed: 'Błąd publikacji',
};
export const TARGET_STATUS_LABELS = {
  pending: 'Oczekuje',
  publishing: 'Publikowanie',
  processing: 'Przetwarzanie',
  published: 'Opublikowany',
  failed: 'Błąd',
};
// Posty, które jeszcze można edytować (opublikowanych i w trakcie — nie).
export const EDITABLE_STATUSES = new Set(['draft', 'pending_approval', 'scheduled', 'failed']);

export const MAX_MEDIA = 10;
export const MAX_TARGETS = 20;
export const MAX_CONTENT = 63206;

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;
// Hashtag: # + litery/cyfry/podkreślnik (także polskie znaki), wzmianka: @ + nazwa konta.
const HASHTAG_RE = /(^|[^\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_.@])@[A-Za-z0-9._]+/g;

export const countHashtags = (text) => (String(text || '').match(HASHTAG_RE) || []).length;
export const countMentions = (text) => (String(text || '').match(MENTION_RE) || []).length;
export const firstUrl = (text) => (String(text || '').match(URL_RE) || [null])[0];

// Długość jak liczą sieci (znaki Unicode, emoji = 1–2) — tu: punkty kodowe.
export const charCount = (text) => Array.from(String(text || '')).length;

export const isVideo = (m) => m?.kind === 'video' || /^video\//.test(String(m?.mime || ''));
export const isImage = (m) => !isVideo(m);

// Treść i media dla kanału: własna wersja kanału albo wspólna posta.
export function effectiveTarget(post, target) {
  const content = target?.content != null && target.content !== '' ? target.content : (post?.content || '');
  const media = Array.isArray(target?.media) && target.media.length ? target.media : (Array.isArray(post?.media) ? post.media : []);
  return { content, media, options: target?.options || {} };
}

// Format publikacji na Instagramie: jawny z opcji albo wywnioskowany z mediów
// (jedno wideo → rolka; API nie publikuje już wideo jako zwykłego posta).
export function instagramFormat(media, options = {}) {
  if (options.format === 'story') return 'story';
  if (options.format === 'reel') return 'reel';
  const list = media || [];
  if (list.length === 1 && isVideo(list[0])) return 'reel';
  return 'feed';
}

// Kształt publikacji na Facebooku: tekst/link, zdjęcie, wiele zdjęć, wideo albo rolka.
export function facebookShape(media, options = {}) {
  const list = media || [];
  if (options.format === 'reel') return 'reel';
  if (!list.length) return 'text';
  if (list.some(isVideo)) return 'video';
  return list.length === 1 ? 'photo' : 'album';
}

// Proporcje zdjęcia poza zakresem Instagrama → { ratio, target } (target = proporcja po przycięciu).
export function instagramImageCrop(width, height) {
  const w = Number(width), h = Number(height);
  if (!w || !h) return null;
  const ratio = w / h;
  const { minRatio, maxRatio } = SOCIAL_PROVIDERS.instagram;
  if (ratio < minRatio - 0.005) return { ratio, target: minRatio };
  if (ratio > maxRatio + 0.005) return { ratio, target: maxRatio };
  return null;
}

// Podstawienie {zmiennych} w polskim tekście (serwer). Web podaje tr — ten sam klucz + zmienne.
const fill = (key, vars) => String(key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));

// Walidacja publikacji w jednym kanale → { errors: [], warnings: [] }. t(klucz, zmienne) — tłumaczenie
// (web: tr); domyślnie polski tekst z podstawionymi zmiennymi.
export function validateTarget(provider, { content = '', media = [], options = {} } = {}, t = fill) {
  const P = SOCIAL_PROVIDERS[provider];
  const errors = [];
  const warnings = [];
  if (!P) return { errors: [t('Nieobsługiwana sieć.')], warnings };
  const len = charCount(content);
  const videos = media.filter(isVideo);
  const images = media.filter(isImage);
  if (len > P.maxChars) errors.push(t('Tekst jest za długi ({len}/{max} znaków).', { len, max: P.maxChars }));

  if (provider === 'facebook') {
    if (!len && !media.length) errors.push(t('Dodaj tekst albo zdjęcie.'));
    if (videos.length && images.length) errors.push(t('Facebook: opublikuj wideo albo zdjęcia — nie oba naraz.'));
    if (videos.length > P.maxVideos) errors.push(t('Facebook: jedno wideo na post.'));
    if (images.length > P.maxImages) errors.push(t('Facebook: najwyżej {n} zdjęć.', { n: P.maxImages }));
    if (options.format === 'reel') {
      if (videos.length !== 1 || media.length !== 1) errors.push(t('Rolka: dokładnie jedno wideo.'));
      const d = Number(videos[0]?.duration);
      if (d && (d < P.reelMinSec || d > P.reelMaxSec)) errors.push(t('Rolka na Facebooku: wideo od {min} do {max} s.', { min: P.reelMinSec, max: P.reelMaxSec }));
      const w = Number(videos[0]?.width), h = Number(videos[0]?.height);
      if (w && h && w >= h) warnings.push(t('Rolka wygląda najlepiej w pionie (9:16).'));
    }
  }

  if (provider === 'instagram') {
    const format = instagramFormat(media, options);
    if (!media.length) errors.push(t('Instagram wymaga zdjęcia albo wideo.'));
    if (countHashtags(content) > P.maxHashtags) errors.push(t('Instagram: najwyżej {n} hashtagów.', { n: P.maxHashtags }));
    if (countMentions(content) > P.maxMentions) errors.push(t('Instagram: najwyżej {n} oznaczeń @.', { n: P.maxMentions }));
    if (format === 'story') {
      if (media.length > 1) errors.push(t('Relacja: jedno zdjęcie albo wideo.'));
      if (len) warnings.push(t('Relacja nie ma podpisu — tekst nie zostanie opublikowany.'));
    } else if (format === 'reel') {
      if (videos.length !== 1 || media.length !== 1) errors.push(t('Rolka: dokładnie jedno wideo.'));
    } else if (media.length > P.maxImages) {
      errors.push(t('Instagram: najwyżej {n} elementów w karuzeli.', { n: P.maxImages }));
    }
    if (format !== 'story' && format !== 'reel') {
      for (const m of images) {
        if (instagramImageCrop(m.width, m.height)) {
          warnings.push(t('Zdjęcie ma proporcje spoza zakresu Instagrama (4:5–1,91:1) — zostanie przycięte do środka.'));
          break;
        }
      }
    }
    if (options.first_comment && charCount(options.first_comment) > P.maxChars) errors.push(t('Pierwszy komentarz jest za długi.'));
    if (firstUrl(content) && format === 'feed') warnings.push(t('Linki w podpisie na Instagramie nie są klikalne.'));
  }
  return { errors, warnings };
}

// ── Kolejka: sloty publikacji (dzień tygodnia + godzina w czasie polskim) ─────────────
// slot: { weekday: 1–7 (pon–nd, ISO), time: 'GG:MM', account_id?: uuid|null }
export const WEEKDAY_LABELS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
export const WEEKDAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isValidSlot = (s) => Number.isInteger(Number(s?.weekday)) && Number(s.weekday) >= 1 && Number(s.weekday) <= 7 && TIME_RE.test(String(s?.time || ''));

// Najbliższy wolny slot po `now` (z zapasem `leadMs`), którego nie zajmuje już inny post
// w żadnym z kanałów posta. taken: ISO/Date już zaplanowanych postów (w tych kanałach).
// Zwraca Date albo null (brak slotów). Szuka najwyżej `horizonDays` naprzód.
export function nextQueueSlot(slots, { now = new Date(), taken = [], leadMs = 5 * 60_000, horizonDays = 120 } = {}) {
  const valid = (slots || []).filter(isValidSlot);
  if (!valid.length) return null;
  const takenSet = new Set(taken.map((t) => Math.floor(new Date(t).getTime() / 60_000)));
  const start = now.getTime() + leadMs;
  const p = warsawParts(now);
  for (let d = 0; d <= horizonDays; d += 1) {
    const dayDate = warsawToDate(p.year, p.month, p.day + d, 12, 0);
    const wp = warsawParts(dayDate);
    const isoWeekday = wp.weekday === 0 ? 7 : wp.weekday;
    const times = valid
      .filter((s) => Number(s.weekday) === isoWeekday)
      .map((s) => s.time)
      .sort();
    for (const t of [...new Set(times)]) {
      const [hh, mm] = t.split(':').map(Number);
      const at = warsawToDate(wp.year, wp.month, wp.day, hh, mm);
      if (at.getTime() < start) continue;
      if (takenSet.has(Math.floor(at.getTime() / 60_000))) continue;
      return at;
    }
  }
  return null;
}

// Status całości z publikacji w kanałach (po każdej zmianie celu).
export function aggregatePostStatus(targetStatuses) {
  const list = targetStatuses || [];
  if (!list.length) return 'failed';
  if (list.some((s) => s === 'pending' || s === 'publishing' || s === 'processing')) return 'publishing';
  const ok = list.filter((s) => s === 'published').length;
  if (ok === list.length) return 'published';
  if (ok > 0) return 'partial';
  return 'failed';
}

// Co osoba może zrobić z postem (zgodnie z serwerem — social/service.js).
export function postPermissions(post, access = {}, myEmail = '') {
  const lower = (v) => String(v || '').toLowerCase();
  const own = lower(post?.created_by) === lower(myEmail);
  const s = post?.status;
  const editable = EDITABLE_STATUSES.has(s);
  const out = {
    edit: editable && (access.admin || access.update_all || access.publish || (own && access.create)),
    approve: s === 'pending_approval' && access.publish,
    reject: s === 'pending_approval' && access.publish,
    unschedule: (s === 'scheduled' && access.publish) || (s === 'pending_approval' && (access.publish || own)),
    publishNow: s === 'scheduled' && access.publish,
    retry: (s === 'failed' || s === 'partial') && access.publish,
    duplicate: access.create || access.publish,
    delete: s !== 'publishing' && (access.admin || access.delete_all || (own && ['draft', 'pending_approval', 'failed'].includes(s))
      || (own && s === 'scheduled' && access.publish)),
    move: (s === 'scheduled' && access.publish) || ((s === 'draft' || s === 'pending_approval') && (own || access.publish)),
  };
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Boolean(v)]));
}

