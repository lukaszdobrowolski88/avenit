import { supabase, tenantWebBase } from './supabase';

// Adres zdjęcia z naszego magazynu plików do pokazania w apce (awatary).
// - pliki serwuje host kościoła (<slug>.avenit.pl), nie api.* — tam serwer nie zna tenanta (404);
//   starsze wgrania z mobilki zapisywały adres na api.*, więc go przepisujemy;
// - ścieżkę względną (/storage/…) uzupełniamy hostem kościoła;
// - miniatura ?w=<szerokość> jak na webie (src/lib/imageThumb.js): serwer zmniejsza zdjęcie raz
//   i oddaje WebP — awatar 44 px nie ciągnie oryginału z aparatu (2–4 MB).
// Inne adresy (Google, data:, Supabase) zostają bez zmian.
const WIDTHS = [48, 64, 96, 128, 192, 256, 384, 512, 768];
const OURS = /\/storage\/(?!v1\/)[a-z0-9-]+\/[^?#]+\.(?:jpe?g|png|webp)$/i;

export function storageImageUrl(url: string | null | undefined, sizePx?: number): string | null {
  if (!url || typeof url !== 'string') return null;
  let out = url;
  // Bez znanego kościoła tenantWebBase() daje sam apex — wtedy niczego nie przepisujemy.
  const base = supabase.getTenant() ? tenantWebBase() : '';
  if (out.startsWith('/storage/') && base) out = `${base}${out}`;
  else if (base && /^https?:\/\/api\.[^/]+\/storage\//.test(out)) out = out.replace(/^https?:\/\/api\.[^/]+/, base);
  if (sizePx && OURS.test(out)) {
    const need = Math.ceil(sizePx * 3); // ekrany @3x
    const w = WIDTHS.find((x) => x >= need) ?? WIDTHS[WIDTHS.length - 1];
    out = `${out}?w=${w}`;
  }
  return out;
}
