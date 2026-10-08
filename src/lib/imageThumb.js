// Miniatura zdjęcia z naszego magazynu plików: /storage/<bucket>/<plik>.jpg → ?w=<szerokość>.
// Serwer (packages/api/src/storage/routes.js) zmniejsza zdjęcie raz i trzyma w cache; bez tego
// awatar 40 px pobierał oryginał z telefonu (3–4 MB). Inne adresy (Supabase, Google, data:)
// zostają bez zmian. Szerokości jak na serwerze; ×2 pod ekrany Retina.
const WIDTHS = [48, 64, 96, 128, 192, 256];
const OURS = /\/storage\/(?!v1\/)[a-z0-9-]+\/[^?#]+\.(?:jpe?g|png|webp)$/i;

export function thumbUrl(url, cssPx = 40) {
  if (!url || typeof url !== 'string' || !OURS.test(url)) return url;
  const need = Math.ceil(Number(cssPx) * 2) || 96;
  const w = WIDTHS.find((x) => x >= need) || WIDTHS[WIDTHS.length - 1];
  return `${url}?w=${w}`;
}
