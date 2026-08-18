import React from 'react';
import { useModuleLabel, useModuleColor, useModuleCover } from '../hooks/useModuleLabel';
import CoverPicker from './CoverPicker';

// Kanoniczny nagłówek modułu w stylu Monday: DOMYŚLNIE czysto — kafel ikony + tytuł + podtytuł
// na jasnym tle, dużo powietrza (bez wielkiego banera). Okładka jest OPCJONALNA: baner pojawia
// się tylko, gdy ktoś ją jawnie ustawi (CoverPicker) — i wtedy jest subtelny, niski pas.
//   <PageHeader icon={Gift} title={tr('Dawanie')} subtitle={tr('…')} actions={<button/>} />
// moduleKey: tytuł/kolor/okładka biorą się DYNAMICZNIE z bazy (app_modules/app_settings).
// cover=false → wariant kompaktowy (konteksty osadzone).
export default function PageHeader({ icon: Icon, title, subtitle, actions, iconColor, className = '', moduleKey, cover = true }) {
  const dynamicTitle = useModuleLabel(moduleKey, title);
  const moduleColor = useModuleColor(moduleKey);
  const coverCfg = useModuleCover(moduleKey);
  const chipColor = iconColor || moduleColor;
  const chipStyle = chipColor ? { background: chipColor } : undefined;

  // Baner tylko gdy okładka JAWNIE ustawiona (domyślnie czysto, jak Monday).
  const hasCover = cover && !!(coverCfg && coverCfg.value);
  const coverStyle = coverCfg?.type === 'image'
    ? { backgroundImage: `url("${coverCfg.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (coverCfg?.value ? { background: coverCfg.value } : undefined);

  if (!cover) {
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
      {/* Opcjonalna okładka — subtelny, niski pas (overflow-hidden clipuje obraz do rogów) */}
      {hasCover && (
        <div className="h-20 sm:h-24 rounded-2xl overflow-hidden relative" style={coverStyle}>
          {coverCfg?.type !== 'image' && <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />}
        </div>
      )}
      {/* Wiersz nagłówka: kafel ikony + tytuł/podtytuł + akcje. Gdy jest okładka — kafel nachodzi na pas. */}
      <div className={`flex gap-3.5 ${hasCover ? 'items-end -mt-9 px-0.5 relative' : 'items-center'}`}>
        <div
          className={`rounded-2xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary ${hasCover ? 'w-16 h-16 ring-4 ring-white dark:ring-gray-900' : 'w-14 h-14'}`}
          style={chipStyle}
        >
          {Icon && <Icon className="text-white w-7 h-7" />}
        </div>
        <div className={`min-w-0 flex-1 ${hasCover ? 'pb-1' : ''}`}>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate leading-tight tracking-tight">{dynamicTitle}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>}
        </div>
        <div className={`flex items-center gap-2 flex-wrap justify-end shrink-0 ${hasCover ? 'pb-1' : ''}`}>
          {actions}
          {/* „Zmień/Dodaj okładkę" — dyskretnie, dopiero po najechaniu (na mobile: zawsze) */}
          <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-200 shrink-0">
            <CoverPicker moduleKey={moduleKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
