import React from 'react';
import { useModuleLabel, useModuleColor, useModuleCover } from '../hooks/useModuleLabel';
import CoverPicker from './CoverPicker';

// Kanoniczny nagłówek modułu w stylu Monday: OKŁADKA (kolorowy baner) + duża ikona z białą
// obwódką nachodząca na okładkę + tytuł + podtytuł + akcje. Jedno źródło prawdy dla całej apki.
//   <PageHeader icon={Gift} title={tr('Dawanie')} subtitle={tr('…')} actions={<button/>} />
// moduleKey: tytuł i kolor okładki/ikony biorą się DYNAMICZNIE z bazy (app_modules) — zmiana
//   nazwy/koloru modułu w Ustawieniach jest widoczna także tutaj. `title` = fallback.
// cover=false → wariant kompaktowy bez okładki (np. konteksty osadzone).
export default function PageHeader({ icon: Icon, title, subtitle, actions, iconColor, className = '', moduleKey, cover = true }) {
  const dynamicTitle = useModuleLabel(moduleKey, title);
  const moduleColor = useModuleColor(moduleKey);
  const coverCfg = useModuleCover(moduleKey);
  const chipColor = iconColor || moduleColor;
  const chipStyle = chipColor ? { background: chipColor } : undefined;
  // Tło okładki: wybrana okładka (obraz/gradient/kolor) > kolor modułu > gradient marki (z klasy).
  const coverStyle = coverCfg?.type === 'image'
    ? { backgroundImage: `url("${coverCfg.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (coverCfg?.value ? { background: coverCfg.value } : chipStyle);

  if (!cover) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary" style={chipStyle}>
          {Icon && <Icon className="text-white" size={24} />}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{dynamicTitle}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={`w-full relative ${className}`}>
      {/* Okładka — pełny, wyższy baner (nie cienki pasek). overflow-hidden clipuje obraz/gradient
          do zaokrąglonych rogów; DLATEGO CoverPicker jest PONIŻEJ, poza tym boxem. */}
      <div className="h-40 sm:h-52 rounded-2xl relative overflow-hidden bg-gradient-to-r from-accent-primary to-accent-secondary" style={coverStyle}>
        {coverCfg?.type !== 'image' && <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/15" />}
      </div>
      {/* „Zmień okładkę" POZA okładką (jej overflow-hidden obcinał panel wyboru gradientu) */}
      <div className="absolute top-3 right-3 z-30"><CoverPicker moduleKey={moduleKey} /></div>
      {/* Nagłówek nakładający się na okładkę — duża ikona jak w Monday */}
      <div className="flex items-end gap-4 -mt-12 sm:-mt-14 px-1 relative">
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ring-4 ring-white dark:ring-gray-900 bg-gradient-to-br from-accent-primary to-accent-secondary"
          style={chipStyle}
        >
          {Icon && <Icon className="text-white w-10 h-10 sm:w-12 sm:h-12" />}
        </div>
        <div className="min-w-0 flex-1 pb-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate leading-tight">{dynamicTitle}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
        </div>
        {actions && <div className="pb-1.5 flex items-center gap-2 flex-wrap justify-end shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
