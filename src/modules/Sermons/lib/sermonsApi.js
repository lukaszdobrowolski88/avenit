// Helpery modułu Kazań (Sermons)

// Mapa polskich znaków diakrytycznych na łacińskie odpowiedniki.
const PL_MAP = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

/**
 * Generuje slug (identyfikator do URL) z tytułu kazania.
 * „Łaska Boża — J 3,16" -> „laska-boza-j-3-16"
 */
export function slugify(text) {
  if (!text) return '';
  return String(text)
    .split('').map(ch => PL_MAP[ch] ?? ch).join('')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // usuń pozostałe akcenty
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // wszystko poza [a-z0-9] -> myślnik
    .replace(/^-+|-+$/g, '')       // przytnij myślniki z brzegów
    .slice(0, 80);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Rozpoznaje typ i osadzalny URL wideo (YouTube / Vimeo).
 * @param {string} url
 * @returns {{ provider:'youtube'|'vimeo'|'other'|null, embedUrl:string|null, id:string|null }}
 */
export function parseVideo(url) {
  if (!url || !String(url).trim()) return { provider: null, embedUrl: null, id: null };
  const u = String(url).trim();

  // YouTube: watch?v=, youtu.be/, /embed/, /shorts/
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) {
    return { provider: 'youtube', id: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  }

  // Vimeo: vimeo.com/ID lub player.vimeo.com/video/ID
  const vim = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) {
    return { provider: 'vimeo', id: vim[1], embedUrl: `https://player.vimeo.com/video/${vim[1]}` };
  }

  return { provider: 'other', embedUrl: null, id: null };
}

// Czy URL da się osadzić w iframe (YouTube/Vimeo).
export function isEmbeddableVideo(url) {
  const { provider } = parseVideo(url);
  return provider === 'youtube' || provider === 'vimeo';
}
