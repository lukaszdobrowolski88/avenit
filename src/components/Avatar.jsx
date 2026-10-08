import React from 'react';
import { getInitials, stringToColor } from '../utils/text';
import { brandTone } from '../lib/brandTone';
import { thumbUrl } from '../lib/imageThumb';

// Kanoniczny avatar (design system): zdjęcie (url) albo inicjały na deterministycznym kolorze
// z nazwy/e-maila. Zastępuje ~12 ad-hoc kółek-z-inicjałem rozsianych po modułach.
//   <Avatar name="Jan Kowalski" email="jan@x.pl" size={40} />
//   <Avatar url={photo} name={fullName} size={32} />
export default function Avatar({ name, email, url, size = 36, className = '', title }) {
  const px = typeof size === 'number' ? size : 36;
  const label = name || email || '';
  if (url) {
    // Miniatura z serwera (?w=) zamiast oryginału — zdjęcia z telefonu mają po kilka MB.
    return (
      <img src={thumbUrl(url, px)} alt={label} title={title || label} loading="lazy" decoding="async"
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px }} />
    );
  }
  return (
    <div title={title || label} data-tone={brandTone(email || name)}
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
      style={{ width: px, height: px, backgroundColor: stringToColor(email || name || '?'), fontSize: Math.max(10, Math.round(px * 0.4)) }}>
      {getInitials(name || email)}
    </div>
  );
}
