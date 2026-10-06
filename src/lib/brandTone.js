// Tony marki Avenit dla kółek (monogramy, ikony widżetów, kafelki dat) — różnorodność bez tęczy,
// jak `toneFor` w aplikacji mobilnej (packages/mobile/src/components/ui/brand.tsx).
// Komponent ustawia tylko atrybut data-tone; kolory nadaje src/styles/brand-avenit.css i tylko
// w motywie „Avenit” — w innych motywach atrybut nic nie zmienia.
//   0 = papier + słód   1 = jasna kurkuma + musztarda   2 = słód + kurkuma   3 = kurkuma + słód
export const TONE = { paper: 0, soft: 1, slod: 2, kurkuma: 3 };

// Stały ton dla tej samej nazwy (0–2; pełna kurkuma zostaje dla akcji i wyróżnień).
export function brandTone(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 3;
}
