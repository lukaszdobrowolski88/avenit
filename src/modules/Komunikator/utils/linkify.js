// Linki w treści wiadomości (K2): http://, https:// i www. — klikalne, a pierwszy z nich dostaje
// kartę podglądu. Czysta logika (testy: linkify.test.js).

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_CHAR = /[.,;:!?'"»”’\]}]/;

// Obetnij interpunkcję z końca („zobacz https://x.pl.”), ale zostaw domknięte nawiasy
// (https://pl.wikipedia.org/wiki/Foo_(bar)).
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

export const hrefOf = (url) => (/^www\./i.test(url) ? `https://${url}` : url);

// Czy to bezpieczny adres do otwarcia (tylko http/https).
export function isSafeHttpUrl(url) {
  try {
    const u = new URL(hrefOf(String(url || '')));
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch { return false; }
}

// Tekst → kawałki: { type: 'text', value } | { type: 'link', value, href }.
export function splitLinks(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const out = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(s))) {
    const start = m.index;
    // Adres w środku słowa (np. e-mail „jan@www.x.pl”) — nie linkuj.
    if (start > 0 && /[\w@.-]/.test(s[start - 1])) continue;
    const url = trimUrl(m[0]);
    if (!url || !isSafeHttpUrl(url) || /^www\.$/i.test(url)) continue;
    if (start > last) out.push({ type: 'text', value: s.slice(last, start) });
    out.push({ type: 'link', value: url, href: hrefOf(url) });
    last = start + url.length;
    URL_RE.lastIndex = last;
  }
  if (last < s.length) out.push({ type: 'text', value: s.slice(last) });
  return out;
}

// Adres pierwszego linku w wiadomości (do karty podglądu) albo null.
export function firstLink(text) {
  const hit = splitLinks(text).find((p) => p.type === 'link');
  return hit ? hit.href : null;
}

// Domena do podpisu karty („youtube.com”).
export function domainOf(url) {
  try { return new URL(hrefOf(url)).hostname.replace(/^www\./i, ''); } catch { return ''; }
}
