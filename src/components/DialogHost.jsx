import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, PencilLine, Trash2 } from 'lucide-react';
import { subscribeDialogs } from '../lib/dialog';
import { tr } from '../i18n';
import { useFocusTrap } from './ui/useFocusTrap';

// Wyświetla okna z src/lib/dialog.js (confirmDialog / promptDialog) — po jednym naraz, w kolejce.
// Montowany raz w App obok <Toaster/>.
export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => subscribeDialogs((d) => setQueue((q) => [...q, d])), []);
  const current = queue[0];
  if (!current || typeof document === 'undefined') return null;
  const done = (value) => {
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };
  return createPortal(<DialogCard key={current.id} d={current} done={done} />, document.body);
}

function DialogCard({ d, done }) {
  const isPrompt = d.kind === 'prompt';
  const isChoice = d.kind === 'choice';
  const [value, setValue] = useState(d.defaultValue ?? '');
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const cancel = () => done(isPrompt || isChoice ? null : false);
  const accept = () => done(isPrompt ? value : true);
  // Operacja niebezpieczna (usuwanie, nieodwracalna) albo wybór z niebezpieczną opcją →
  // fokus startowy na „Anuluj”: odruchowy Enter niczego nie usunie.
  const risky = d.danger || (isChoice && (d.choices || []).some((c) => c.danger));
  const startRef = isPrompt ? inputRef : (risky || isChoice) ? cancelRef : confirmRef;
  // Tab krąży w oknie; po zamknięciu fokus wraca tam, skąd okno otwarto (przed efektem
  // fokusu startowego, żeby zapamiętać element-wywołujący).
  useFocusTrap(panelRef, true, { initialRef: startRef });

  useEffect(() => {
    startRef.current?.focus();
    if (isPrompt) inputRef.current?.select();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bez tytułu: pierwsza linia komunikatu jest nagłówkiem, reszta opisem (jak w confirm()).
  const [firstLine, ...rest] = String(d.message || '').split('\n');
  const heading = (d.title || firstLine).replace(/:\s*$/, '');
  const body = d.title ? d.message : rest.join('\n').trim();

  const Icon = isPrompt ? PencilLine : d.danger ? (d.isDelete ? Trash2 : AlertTriangle) : HelpCircle;
  // Domyślny tekst przycisku zależy od rodzaju pytania (zamiast ogólnego „Potwierdź”):
  // usuwanie → „Usuń”, inna operacja niebezpieczna → „Tak, kontynuuj”, zwykłe pytanie → „Kontynuuj”.
  // Najlepiej i tak podać własny czasownik: confirmDialog({ …, confirmLabel: tr('Wyślij SMS') }).
  const confirmLabel = d.confirmLabel || (isPrompt ? tr('Zapisz') : d.isDelete ? tr('Usuń') : d.danger ? tr('Tak, kontynuuj') : tr('Kontynuuj'));

  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onMouseDown={cancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={`dlg-${d.id}-title`}
        aria-describedby={body ? `dlg-${d.id}-body` : undefined}
        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-6 outline-none animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-4">
          <div
            data-tone={d.danger ? undefined : 1}
            aria-hidden="true"
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${d.danger
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'}`}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 id={`dlg-${d.id}-title`} className="text-base font-bold text-gray-900 dark:text-white break-words">{heading}</h3>
            {body && <p id={`dlg-${d.id}-body`} className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line break-words max-h-[50vh] overflow-y-auto custom-scrollbar">{body}</p>}
          </div>
        </div>

        {isPrompt && (
          <input
            ref={inputRef}
            value={value}
            aria-labelledby={`dlg-${d.id}-title`}
            placeholder={d.placeholder || ''}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); accept(); } }}
            className="mt-5 w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-accent-primary-light"
          />
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            {d.cancelLabel || tr('Anuluj')}
          </button>
          {isChoice ? (d.choices || []).map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => done(c.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${c.danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {c.label}
            </button>
          )) : (
          <button
            ref={confirmRef}
            type="button"
            onClick={accept}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition inline-flex items-center gap-2 ${d.danger
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md hover:shadow-lg'}`}
          >
            {d.danger && d.isDelete && <Trash2 size={15} />}
            {confirmLabel}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
