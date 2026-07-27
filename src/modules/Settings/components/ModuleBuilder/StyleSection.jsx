import React, { useState } from 'react';
import { Palette, Eye, Smartphone, ChevronDown, ChevronRight } from 'lucide-react';
import { tr } from '../../../../i18n';
import { BUILTIN_ROLES } from '@avenit/shared/src/permissions/presets.js';
import { SPACE_OPTIONS, RADIUS_OPTIONS, SHADOW_OPTIONS } from './styleToCSS';

const inputCls =
  'w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20';
const lbl = 'block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1';

function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className={lbl}>{tr(label)}</label>
      <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        {options.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
      </select>
    </div>
  );
}

function Color({ label, value, onChange }) {
  return (
    <div>
      <label className={lbl}>{tr(label)}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="w-9 h-8 rounded border border-gray-200 dark:border-gray-700 bg-transparent" />
        {value ? <button onClick={() => onChange(undefined)} className="text-xs text-gray-400 hover:underline">{tr('wyczyść')}</button> : <span className="text-xs text-gray-400">{tr('brak')}</span>}
      </div>
    </div>
  );
}

function Group({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between mb-2">
        <span className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase"><Icon size={13} /> {tr(title)}</span>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}

// Sekcje wspólne dla każdego elementu: Styl, Widoczność (rola), Responsywność.
export default function StyleSection({ element, update }) {
  const style = element.style || {};
  const responsive = element.responsive || {};
  const roles = element.visibleForRoles || [];

  const setStyle = (key, val) => update(element.id, (el) => ({ ...el, style: { ...el.style, [key]: val } }));
  const setResp = (key, val) => update(element.id, (el) => ({ ...el, responsive: { ...el.responsive, [key]: val } }));
  const toggleRole = (roleKey) => update(element.id, (el) => {
    const cur = el.visibleForRoles || [];
    const next = cur.includes(roleKey) ? cur.filter((r) => r !== roleKey) : [...cur, roleKey];
    return { ...el, visibleForRoles: next.length ? next : null };
  });

  return (
    <div className="space-y-3">
      <Group title="Styl" icon={Palette}>
        <Color label="Tło" value={style.bg} onChange={(v) => setStyle('bg', v)} />
        <Color label="Kolor tekstu" value={style.color} onChange={(v) => setStyle('color', v)} />
        <Sel label="Padding" value={style.padding} onChange={(v) => setStyle('padding', v)} options={SPACE_OPTIONS} />
        <div className="grid grid-cols-2 gap-2">
          <Sel label="Margines góra" value={style.marginTop} onChange={(v) => setStyle('marginTop', v)} options={SPACE_OPTIONS} />
          <Sel label="Margines dół" value={style.marginBottom} onChange={(v) => setStyle('marginBottom', v)} options={SPACE_OPTIONS} />
        </div>
        <Sel label="Zaokrąglenie" value={style.radius} onChange={(v) => setStyle('radius', v)} options={RADIUS_OPTIONS} />
        <Sel label="Cień" value={style.shadow} onChange={(v) => setStyle('shadow', v)} options={SHADOW_OPTIONS} />
        <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          {tr('Obramowanie')}
          <input type="checkbox" checked={!!style.border} onChange={(e) => setStyle('border', e.target.checked || undefined)} />
        </label>
      </Group>

      <Group title="Widoczność (rola)" icon={Eye}>
        <p className="text-xs text-gray-400">{roles.length ? tr('Widoczne tylko dla zaznaczonych ról (administratorzy zawsze).') : tr('Widoczne dla wszystkich.')}</p>
        {BUILTIN_ROLES.filter((r) => !r.is_admin).map((r) => (
          <label key={r.key} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            {r.label}
            <input type="checkbox" checked={roles.includes(r.key)} onChange={() => toggleRole(r.key)} />
          </label>
        ))}
      </Group>

      <Group title="Responsywność" icon={Smartphone}>
        <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          {tr('Ukryj na telefonie')}
          <input type="checkbox" checked={!!responsive.hiddenMobile} onChange={(e) => setResp('hiddenMobile', e.target.checked || undefined)} />
        </label>
      </Group>
    </div>
  );
}
