import React from 'react';
import { MousePointerSquareDashed } from 'lucide-react';
import { tr } from '../../../../i18n';
import IconPicker from '../IconPicker';
import { ELEMENT_TYPES, WIDGET_META } from './builderElements';
import { useBuilder, useBuilderActions } from './BuilderContext';
import CollectionEditor from './CollectionEditor';
import StyleSection from './StyleSection';
import SimpleRichEditor from '../../../../components/SimpleRichEditor';

// ── Drobne kontrolki ────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{children}</label>
);
const inputCls =
  'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light';

function Text({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <Label>{tr(label)}</Label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} className={inputCls} />
    </div>
  );
}
function Area({ label, value, onChange, rows = 4 }) {
  return (
    <div>
      <Label>{tr(label)}</Label>
      <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <div>
      <Label>{tr(label)}</Label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
      </select>
    </div>
  );
}

const ALIGN_OPTS = [{ value: 'left', label: 'Do lewej' }, { value: 'center', label: 'Wyśrodkuj' }, { value: 'right', label: 'Do prawej' }];
const GAP_OPTS = [{ value: 'sm', label: 'Mały' }, { value: 'md', label: 'Średni' }, { value: 'lg', label: 'Duży' }, { value: 'xl', label: 'Bardzo duży' }];
const SIZE_OPTS = GAP_OPTS;

export default function Inspector() {
  const { selected } = useBuilder();
  const { update } = useBuilderActions();

  if (!selected) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 py-10 px-4">
        <MousePointerSquareDashed size={40} className="mx-auto mb-3 opacity-60" />
        <p className="text-sm">{tr('Zaznacz element na płótnie, aby edytować jego właściwości.')}</p>
      </div>
    );
  }

  const p = selected.props || {};
  const setProp = (key, val) => update(selected.id, (el) => ({ ...el, props: { ...el.props, [key]: val } }));
  const def = ELEMENT_TYPES[selected.type];

  return (
    <div className="space-y-4">
      <div className="pb-2 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{tr(def?.label || selected.type)}</span>
      </div>

      {selected.type === 'heading' && (
        <>
          <Text label="Tekst" value={p.text} onChange={(v) => setProp('text', v)} />
          <Select label="Poziom" value={String(p.level)} onChange={(v) => setProp('level', Number(v))}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `H${n}` }))} />
          <Select label="Wyrównanie" value={p.align} onChange={(v) => setProp('align', v)} options={ALIGN_OPTS} />
        </>
      )}

      {selected.type === 'text' && (
        <div>
          <Label>{tr('Treść')}</Label>
          <SimpleRichEditor content={p.html} onChange={(html) => setProp('html', html)} minHeight={160} />
        </div>
      )}

      {selected.type === 'image' && (
        <>
          <Text label="Adres URL obrazu" value={p.src} onChange={(v) => setProp('src', v)} />
          <Text label="Opis alternatywny" value={p.alt} onChange={(v) => setProp('alt', v)} />
          <Select label="Zaokrąglenie" value={p.rounded} onChange={(v) => setProp('rounded', v)}
            options={[{ value: 'none', label: 'Brak' }, { value: 'lg', label: 'Średnie' }, { value: 'xl', label: 'Duże' }, { value: '2xl', label: 'Bardzo duże' }]} />
        </>
      )}

      {selected.type === 'button' && (
        <>
          <Text label="Etykieta" value={p.label} onChange={(v) => setProp('label', v)} />
          <Text label="Adres (URL)" value={p.href} onChange={(v) => setProp('href', v)} />
          <Select label="Styl" value={p.variant} onChange={(v) => setProp('variant', v)}
            options={[{ value: 'primary', label: 'Główny' }, { value: 'secondary', label: 'Drugorzędny' }, { value: 'outline', label: 'Obrys' }]} />
          <Select label="Wyrównanie" value={p.align} onChange={(v) => setProp('align', v)} options={ALIGN_OPTS} />
        </>
      )}

      {selected.type === 'list' && (
        <>
          <Area label="Punkty (jeden na linię)" rows={6} value={(p.items || []).join('\n')} onChange={(v) => setProp('items', v.split('\n'))} />
          <Select label="Styl listy" value={p.style} onChange={(v) => setProp('style', v)}
            options={[{ value: 'disc', label: 'Punktowana' }, { value: 'decimal', label: 'Numerowana' }, { value: 'none', label: 'Bez znaczników' }]} />
        </>
      )}

      {selected.type === 'quote' && (
        <>
          <Area label="Treść cytatu" value={p.text} onChange={(v) => setProp('text', v)} />
          <Text label="Autor" value={p.author} onChange={(v) => setProp('author', v)} />
        </>
      )}

      {selected.type === 'alert' && (
        <>
          <Text label="Treść" value={p.text} onChange={(v) => setProp('text', v)} />
          <Select label="Rodzaj" value={p.variant} onChange={(v) => setProp('variant', v)}
            options={[{ value: 'info', label: 'Informacja' }, { value: 'success', label: 'Sukces' }, { value: 'warning', label: 'Ostrzeżenie' }, { value: 'error', label: 'Błąd' }]} />
        </>
      )}

      {selected.type === 'icon' && (
        <>
          <div>
            <Label>{tr('Ikona')}</Label>
            <IconPicker value={p.name} onChange={(v) => setProp('name', v)} />
          </div>
          <Text label="Rozmiar (px)" type="number" value={p.size} onChange={(v) => setProp('size', v)} />
        </>
      )}

      {selected.type === 'video' && (
        <Text label="Link do wideo (YouTube/Vimeo/mp4)" value={p.url} onChange={(v) => setProp('url', v)} />
      )}

      {selected.type === 'map' && (
        <Text label="Adres / miejsce" value={p.query} onChange={(v) => setProp('query', v)} />
      )}

      {selected.type === 'embed' && (
        <>
          <Text label="Adres URL (iframe)" value={p.url} onChange={(v) => setProp('url', v)} />
          <Text label="Wysokość (px)" type="number" value={p.height} onChange={(v) => setProp('height', v)} />
        </>
      )}

      {selected.type === 'countdown' && (
        <>
          <Text label="Etykieta" value={p.label} onChange={(v) => setProp('label', v)} />
          <div>
            <Label>{tr('Data i godzina')}</Label>
            <input type="datetime-local" value={p.target || ''} onChange={(e) => setProp('target', e.target.value)} className={inputCls} />
          </div>
        </>
      )}

      {selected.type === 'gallery' && (
        <>
          <Area label="Adresy zdjęć (jeden na linię)" rows={5} value={(p.images || []).join('\n')} onChange={(v) => setProp('images', v.split('\n'))} />
          <Text label="Kolumny" type="number" value={p.columns} onChange={(v) => setProp('columns', Math.min(Math.max(v || 1, 1), 6))} />
        </>
      )}

      {selected.type === 'divider' && (
        <Select label="Styl linii" value={p.lineStyle} onChange={(v) => setProp('lineStyle', v)}
          options={[{ value: 'solid', label: 'Ciągła' }, { value: 'dashed', label: 'Przerywana' }, { value: 'dotted', label: 'Kropkowana' }]} />
      )}

      {selected.type === 'spacer' && (
        <Select label="Wysokość" value={p.size} onChange={(v) => setProp('size', v)} options={SIZE_OPTS} />
      )}

      {(selected.type === 'columns' || selected.type === 'grid') && (
        <>
          <Text label="Liczba kolumn" type="number" value={p.columns} onChange={(v) => setProp('columns', Math.min(Math.max(v || 1, 1), 6))} />
          <Select label="Odstęp" value={p.gap} onChange={(v) => setProp('gap', v)} options={GAP_OPTS} />
        </>
      )}

      {selected.type === 'card' && (
        <Text label="Tytuł karty (opcjonalnie)" value={p.title} onChange={(v) => setProp('title', v)} />
      )}

      {selected.type === 'widget' && (
        <Select label="Rodzaj widgetu" value={p.widgetType} onChange={(v) => setProp('widgetType', v)}
          options={Object.entries(WIDGET_META).map(([k, m]) => ({ value: k, label: m.label }))} />
      )}

      {selected.type === 'collection' && (
        <CollectionEditor element={selected} update={update} />
      )}

      {selected.type === 'section' && (
        <p className="text-sm text-gray-400">{tr('Sekcja grupuje elementy. Przeciągnij elementy do jej wnętrza.')}</p>
      )}

      <StyleSection element={selected} update={update} />
    </div>
  );
}
