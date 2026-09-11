import React from 'react';
import { useModuleLabel, useModuleColor, useModuleCover } from '../hooks/useModuleLabel';
import CoverPicker from './CoverPicker';

// Kanoniczny nagłówek modułu w stylu Monday: DOMYŚLNIE czysto — kafel ikony + tytuł + podtytuł
// na jasnym tle, dużo powietrza (bez wielkiego banera). Okładka jest OPCJONALNA: baner pojawia
// się tylko, gdy ktoś ją jawnie ustawi (CoverPicker) — i wtedy jest subtelny, niski pas.
//   <PageHeader icon={Gift} title={tr('Dawanie')} subtitle={tr('…')} actions={<button/>} />
// moduleKey: tytuł/kolor/okładka biorą się DYNAMICZNIE z bazy (app_modules/app_settings).
// cover=false → wariant kompaktowy (konteksty osadzone).
// Luminancja WZGLĘDNA sRGB (WCAG) — lepiej niż BT.601 dobiera kolor tytułu dla
// kolorów średnich/nasyconych. Kanał liniowy → suma z wagami percepcyjnymi.
function chan(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
function hexLuma(hex) {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (n.length < 6) return null;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
// Średnia luminancja okładki koloru/gradientu (dla obrazu = null → traktujemy jak ciemną).
function coverLuma(cfg) {
  if (!cfg || cfg.type === 'image') return null;
  const hexes = String(cfg.value || '').match(/#[0-9a-fA-F]{3,6}/g);
  if (!hexes || !hexes.length) return null;
  const lumas = hexes.map(hexLuma).filter((x) => x != null);
  return lumas.length ? lumas.reduce((a, b) => a + b, 0) / lumas.length : null;
}
// Rozmiary banera: wysokość pasa + skala ikony/tytułu (wariant gradient „g…” = glass).
const BANNER_SIZES = {
  sm: { band: 'h-20 sm:h-24', chip: 'w-10 h-10 sm:w-11 sm:h-11', icon: 'w-5 h-5 sm:w-6 sm:h-6', title: 'text-lg sm:text-xl',  gChip: 'w-9 h-9',   gIcon: 'w-5 h-5', gTitle: 'text-base sm:text-lg' },
  md: { band: 'h-28 sm:h-36', chip: 'w-12 h-12 sm:w-14 sm:h-14', icon: 'w-6 h-6 sm:w-7 sm:h-7', title: 'text-2xl sm:text-3xl', gChip: 'w-11 h-11', gIcon: 'w-6 h-6', gTitle: 'text-xl sm:text-2xl' },
  lg: { band: 'h-40 sm:h-52', chip: 'w-14 h-14 sm:w-16 sm:h-16', icon: 'w-7 h-7 sm:w-8 sm:h-8', title: 'text-3xl sm:text-4xl', gChip: 'w-12 h-12', gIcon: 'w-7 h-7', gTitle: 'text-2xl sm:text-3xl' },
};

export default function PageHeader({ icon: Icon, title, subtitle, actions, iconColor, className = '', moduleKey, cover = true }) {
  const dynamicTitle = useModuleLabel(moduleKey, title);
  const moduleColor = useModuleColor(moduleKey);
  const coverCfg = useModuleCover(moduleKey);
  const chipColor = iconColor || moduleColor;
  const chipStyle = chipColor ? { background: chipColor } : undefined;

  // Baner ZAWSZE obecny (tytuł na banerze — nigdy nie „wisi" sam na jasnym tle).
  // Tło banera wg priorytetu: 1) zdjęcie, 2) gradient/kolor okładki, 3) fallback =
  // gradient w kolorze modułu (a gdy brak koloru — gradient marki z klas Tailwind).
  const coverStyle = coverCfg?.type === 'image'
    ? { backgroundImage: `url("${coverCfg.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (coverCfg?.value ? { background: coverCfg.value }
      : (chipColor ? { background: `linear-gradient(120deg, ${chipColor}, rgba(15,23,42,0.65))` } : undefined));
  // Styl tytułu na banerze: 'gradient' (przyciemnienie u dołu) lub 'glass' (matowy pasek).
  const bannerStyle = coverCfg?.style === 'glass' ? 'glass' : 'gradient';
  // Jasny baner (pastel/jasny kolor) → ciemny tytuł BEZ ciemnego scrimu. Ciemny/zdjęcie
  // → biały tytuł z delikatnym, krótkim przyciemnieniem tylko u dołu. Glass ma własny pasek.
  const luma = coverLuma(coverCfg);
  const lightCover = luma != null && luma > 0.45;
  const onLight = lightCover && bannerStyle !== 'glass';
  const titleColor = onLight ? 'text-gray-900' : 'text-white';
  const subColor = onLight ? 'text-gray-600' : 'text-white/85';
  // Wysokość banera (konfigurowalna) + „off" = bez banera (kompaktowy nagłówek).
  const heightKey = ['sm', 'md', 'lg', 'off'].includes(coverCfg?.height) ? coverCfg.height : 'md';
  const bannerOff = !cover || heightKey === 'off';
  const S = BANNER_SIZES[heightKey] || BANNER_SIZES.md;

  if (bannerOff) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary" style={chipStyle}>
          {Icon && <Icon className="text-white w-6 h-6" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate tracking-tight">{dynamicTitle}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={`w-full relative group ${className}`}>
      {/* Baner (overflow-hidden clipuje obraz/scrim do zaokrąglonych rogów) */}
      <div
        className={`relative ${S.band} rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-accent-primary to-accent-secondary`}
        style={coverStyle}
      >
        {/* Scrim u góry (czytelność akcji) — tylko na ciemnym banerze/zdjęciu */}
        {!onLight && <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />}
        {/* GRADIENT na ciemnym/zdjęciu: łagodne, KRÓTKIE przyciemnienie tylko u dołu (nie na całości) */}
        {bannerStyle === 'gradient' && !onLight && (
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        )}

        {bannerStyle === 'glass' ? (
          /* MATOWY PASEK: półprzezroczysty, rozmyty pasek u dołu z ikoną + tytułem */
          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
            <div className="flex items-center gap-3 rounded-2xl bg-black/35 backdrop-blur-md ring-1 ring-white/15 px-3.5 py-2.5">
              <div className={`${S.gChip} rounded-xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary ring-1 ring-white/30`} style={chipStyle}>
                {Icon && <Icon className={`text-white ${S.gIcon}`} />}
              </div>
              <div className="min-w-0">
                <h1 className={`${S.gTitle} font-bold text-white truncate leading-tight tracking-tight`}>{dynamicTitle}</h1>
                {subtitle && <p className="text-xs sm:text-sm text-white/75 truncate">{subtitle}</p>}
              </div>
            </div>
          </div>
        ) : (
          /* GRADIENT: ikona + tytuł u dołu-lewej, biały tekst z lekkim cieniem */
          <div className="absolute left-4 right-4 bottom-3.5 flex items-end gap-3">
            <div className={`${S.chip} rounded-2xl flex items-center justify-center shadow-lg shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary ring-2 ${onLight ? 'ring-black/5' : 'ring-white/50'}`} style={chipStyle}>
              {Icon && <Icon className={`text-white ${S.icon}`} />}
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <h1 className={`${S.title} font-bold ${titleColor} truncate leading-tight tracking-tight ${onLight ? '' : 'drop-shadow-md'}`}>{dynamicTitle}</h1>
              {subtitle && <p className={`text-sm ${subColor} truncate ${onLight ? '' : 'drop-shadow'}`}>{subtitle}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Akcje + „Zmień okładkę" — SIBLING poza banerem (dropdown okładki nie ucina się o overflow) */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 flex-wrap justify-end max-w-[72%]">
        {actions}
        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-200 shrink-0">
          <CoverPicker moduleKey={moduleKey} />
        </div>
      </div>
    </div>
  );
}
