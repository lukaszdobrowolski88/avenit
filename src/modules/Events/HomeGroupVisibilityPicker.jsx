// Wspólny selektor widoczności wydarzenia dla grup domowych (używany w module Wydarzenia
// i w zakładce Wydarzenia modułu Grupy domowe). Zbiór kluczy → segmenty visibility_segments.
//   klucze: 'all_members' | 'all_leaders' | 'all_coords' | `mem:<groupId>` | `lead:<groupId>`
import React from 'react';
import { useT } from '../../i18n';

// Segmenty widoczności z zestawu zaznaczonych kluczy.
export function buildHgSegments(keys, nameOf = () => null) {
  const segs = [];
  const memGroups = keys.filter((k) => k.startsWith('mem:')).map((k) => k.slice(4));
  const leadGroups = keys.filter((k) => k.startsWith('lead:')).map((k) => k.slice(5));
  if (keys.includes('all_members')) segs.push({ type: 'home_group_member', label: 'Członkowie grup domowych' });
  if (keys.includes('all_leaders')) segs.push({ type: 'home_group_leader', label: 'Liderzy grup domowych' });
  if (keys.includes('all_coords')) segs.push({ type: 'home_group_coordinator', label: 'Koordynatorzy grup domowych' });
  if (memGroups.length) segs.push({ type: 'home_group', values: memGroups, label: memGroups.map(nameOf).filter(Boolean).join(', ') || undefined });
  if (leadGroups.length) segs.push({ type: 'home_group_leader', values: leadGroups, label: 'Liderzy: ' + (leadGroups.map(nameOf).filter(Boolean).join(', ') || '') });
  return segs;
}

// Klucze zaznaczeń z istniejących segmentów (do edycji). homeGroupId = legacy fallback.
export function segmentsToVisKeys(segments, homeGroupId) {
  const segs = Array.isArray(segments) ? segments : [];
  const keys = [];
  segs.forEach((s) => {
    if (s?.type === 'home_group_member') keys.push('all_members');
    else if (s?.type === 'home_group_coordinator') keys.push('all_coords');
    else if (s?.type === 'home_group_leader') {
      if (Array.isArray(s.values) && s.values.length) s.values.forEach((v) => keys.push(`lead:${v}`));
      else keys.push('all_leaders');
    } else if (s?.type === 'home_group' && Array.isArray(s.values)) s.values.forEach((v) => keys.push(`mem:${v}`));
  });
  if (!keys.length && homeGroupId) keys.push(`mem:${homeGroupId}`);
  return keys;
}

// Pierwsza konkretna grupa z zaznaczeń (do badge/filtra/kampusu).
export function firstGroupFromKeys(keys) {
  const mem = keys.filter((k) => k.startsWith('mem:')).map((k) => k.slice(4));
  const lead = keys.filter((k) => k.startsWith('lead:')).map((k) => k.slice(5));
  return mem[0] || lead[0] || null;
}

export default function HomeGroupVisibilityPicker({ homeGroups = [], visKeys = [], onToggle }) {
  const t = useT();
  const has = (k) => visKeys.includes(k);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
        <input type="checkbox" checked={has('all_members')} onChange={() => onToggle('all_members')} className="w-4 h-4 rounded accent-accent-primary" />
        <span className="text-gray-700 dark:text-gray-200">{t('Wszyscy członkowie grup domowych')}</span>
      </label>
      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
        <input type="checkbox" checked={has('all_leaders')} onChange={() => onToggle('all_leaders')} className="w-4 h-4 rounded accent-accent-primary" />
        <span className="text-gray-700 dark:text-gray-200">{t('Liderzy grup domowych')}</span>
      </label>
      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
        <input type="checkbox" checked={has('all_coords')} onChange={() => onToggle('all_coords')} className="w-4 h-4 rounded accent-accent-primary" />
        <span className="text-gray-700 dark:text-gray-200">{t('Koordynatorzy grup domowych')}</span>
      </label>
      <div className="max-h-44 overflow-y-auto custom-scrollbar">
        {homeGroups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{g.name}</span>
            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-1 text-xs cursor-pointer text-gray-500 dark:text-gray-400">
                <input type="checkbox" checked={has(`mem:${g.id}`)} onChange={() => onToggle(`mem:${g.id}`)} className="w-3.5 h-3.5 rounded accent-accent-primary" /> {t('członkowie')}
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer text-gray-500 dark:text-gray-400">
                <input type="checkbox" checked={has(`lead:${g.id}`)} onChange={() => onToggle(`lead:${g.id}`)} className="w-3.5 h-3.5 rounded accent-accent-primary" /> {t('liderzy')}
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
