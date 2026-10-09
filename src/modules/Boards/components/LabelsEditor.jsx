import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { uid } from '../lib/constants';
import { LABEL_COLORS, boardColor } from '../lib/palette';
import { STATUS_COLORS as APP } from '../../../components/ui/DataTable';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

// Nazwy kolorów palety (dla czytnika ekranu) — klucz = kolor z palety aplikacji.
const COLOR_NAMES = {
  [APP.success]: 'Zielony', [APP.warning]: 'Pomarańczowy', [APP.danger]: 'Czerwony',
  [APP.info]: 'Niebieski', [APP.accent]: 'Musztardowy', [APP.neutral]: 'Szary',
};

// Nazwa etykiety: wpisywanie w stanie lokalnym, zapis na blur/Enter i przy odmontowaniu
// (zamknięcie popovera) — wcześniej każdy znak był osobnym zapisem kolumny do bazy.
function TitleInput({ value, onCommit, autoFocus, label }) {
  const [v, setV] = useState(value || '');
  const focused = useRef(false);
  const skip = useRef(false);
  const cur = useRef(v);
  const saved = useRef(value || '');
  useEffect(() => {
    // Zmiana z zewnątrz (zapis, inny użytkownik) — nie nadpisuj tego, co właśnie wpisujesz.
    saved.current = value || '';
    if (!focused.current) { setV(value || ''); cur.current = value || ''; }
  }, [value]);
  const commit = () => {
    const t = cur.current.trim();
    // Pusta nazwa = cofnięcie zmiany (etykieta bez nazwy byłaby w komórce niewidoczna).
    if (!t) { setV(saved.current); cur.current = saved.current; return; }
    if (t !== saved.current) { saved.current = t; onCommit(t); }
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);
  return (
    <input
      value={v}
      autoFocus={autoFocus}
      onFocus={(e) => { focused.current = true; if (autoFocus) e.currentTarget.select(); }}
      onChange={(e) => { cur.current = e.target.value; setV(e.target.value); }}
      onBlur={() => {
        focused.current = false;
        if (skip.current) { skip.current = false; cur.current = saved.current; setV(saved.current); return; }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        // Esc w polu cofa wpis i nie zamyka całego okienka.
        if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.(); skip.current = true; e.currentTarget.blur(); }
      }}
      aria-label={label}
      className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-white/5 rounded-lg px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 text-gray-800 dark:text-gray-100"
    />
  );
}

// Edytor etykiet kolumny Status/Priorytet (field="labels") i opcji listy wyboru (field="options"):
// dodaj / zmień nazwę / kolor z palety aplikacji (6 kolorów) / usuń z potwierdzeniem.
// Status: etykietę można oznaczyć „Oznacza zakończenie” (done: true) — zadanie z nią jest zakończone
// (nie „po terminie”, „Oznacz jako gotowe”). Bez flagi decyduje nazwa (Gotowe, Zrobione…).
// Wspólny dla nagłówka kolumny, widoku Kanban i trybu edycji w komórkach Status i Lista wyboru.
export default function LabelsEditor({ column, onUpdateColumn, field = 'labels', onRemoved }) {
  const isOptions = field === 'options';
  const canMarkDone = !isOptions && column?.type === 'status';
  const serverItems = column?.settings?.[field] || [];
  // Zapis kolumny wraca z serwera dopiero po chwili — do tego czasu pokazujemy zmianę od razu.
  const [pending, setPending] = useState(null);
  const seq = useRef(0);
  const items = pending || serverItems;
  const [colorFor, setColorFor] = useState(null); // id etykiety z otwartą paletą
  const [focusId, setFocusId] = useState(null); // nowo dodana etykieta dostaje fokus

  const setItems = (next) => {
    if (!onUpdateColumn) return;
    const my = ++seq.current;
    setPending(next);
    Promise.resolve(onUpdateColumn(column.id, { settings: { ...(column.settings || {}), [field]: next } }))
      .catch(() => {})
      .finally(() => { if (seq.current === my) setPending(null); });
  };

  const add = () => {
    const used = items.map(l => boardColor(l.color));
    const color = LABEL_COLORS.find(c => !used.includes(c)) || LABEL_COLORS[items.length % LABEL_COLORS.length];
    const id = uid(isOptions ? 'opt' : 'lbl');
    setItems([...items, { id, title: isOptions ? tr('Nowa opcja') : tr('Nowa etykieta'), color }]);
    setFocusId(id);
  };
  const patch = (id, p) => setItems(items.map(l => (l.id === id ? { ...l, ...p } : l)));
  const remove = async (l) => {
    const ok = await confirmDialog({
      title: isOptions ? tr('Usunąć opcję „{name}”?', { name: l.title }) : tr('Usunąć etykietę „{name}”?', { name: l.title }),
      message: isOptions ? tr('Zadania z tą opcją stracą ten tag.') : tr('Zadania z tą etykietą stracą status.'),
      confirmLabel: tr('Usuń'),
      danger: true,
    });
    if (!ok) return;
    setItems(items.filter(x => x.id !== l.id));
    onRemoved?.(l.id);
  };

  return (
    <div className="space-y-1.5">
      {items.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{isOptions ? tr('Brak opcji — dodaj pierwszą.') : tr('Brak etykiet — dodaj pierwszą.')}</p>
      )}
      {items.map(l => {
        const color = boardColor(l.color);
        const open = colorFor === l.id;
        return (
          <div key={l.id}>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setColorFor(open ? null : l.id)} aria-expanded={open}
                aria-label={tr('Kolor: {name}', { name: l.title })}
                className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              </button>
              <TitleInput value={l.title} onCommit={(t) => patch(l.id, { title: t })} autoFocus={focusId === l.id}
                label={isOptions ? tr('Nazwa opcji') : tr('Nazwa etykiety')} />
              {canMarkDone && (() => {
                const done = isDoneLabel(l);
                return (
                  <button type="button" onClick={() => patch(l.id, { done: !done })} aria-pressed={done}
                    aria-label={tr('Oznacza zakończenie: {name}', { name: l.title })} title={tr('Oznacza zakończenie')}
                    className={`shrink-0 p-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 ${done
                      ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/10'}`}>
                    <CheckCircle2 size={14} aria-hidden="true" />
                  </button>
                );
              })()}
              <button type="button" onClick={() => remove(l)}
                aria-label={isOptions ? tr('Usuń opcję {name}', { name: l.title }) : tr('Usuń etykietę {name}', { name: l.title })}
                className="shrink-0 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            {open && (
              // Paleta tylko dla tej jednej etykiety — jasne, co zostanie przemalowane.
              <div role="radiogroup" aria-label={tr('Kolor: {name}', { name: l.title })} className="flex items-center gap-1.5 pl-9 pt-1.5 pb-1">
                {LABEL_COLORS.map(c => {
                  const sel = color === c;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={sel} aria-label={tr(COLOR_NAMES[c] || 'Kolor')}
                      onClick={() => { patch(l.id, { color: c }); setColorFor(null); }}
                      className={`w-5 h-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 ${sel ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white ring-offset-white dark:ring-offset-gray-800' : ''}`}
                      style={{ backgroundColor: c }} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {canMarkDone && items.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1 flex items-center gap-1">
          <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" /> {tr('Oznacza zakończenie — takie zadania nie są „po terminie”.')}
        </p>
      )}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-1.5 py-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
        <Plus size={15} aria-hidden="true" /> {isOptions ? tr('Dodaj opcję') : tr('Dodaj etykietę')}
      </button>
    </div>
  );
}
