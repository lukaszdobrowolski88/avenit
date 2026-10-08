import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Check, Lock, AlertCircle } from 'lucide-react';
import SimpleRichEditor from '../../../components/SimpleRichEditor';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { tr } from '../../../i18n';

const SAVE_DELAY = 800;

// Widok Dokument (WorkDoc) — wspólne notatki tablicy w konfiguracji widoku (config.html).
// To TREŚĆ dla całego zespołu, nie osobisty układ widoku: kto może edytować widoki, zapisuje
// ją do wspólnego widoku (data.updateView); pozostali czytają. Gdy nie da się ustalić, który to
// widok (rodzic nie podał `view`, a dokumentów jest kilka), zapis idzie przez onUpdateConfig.
export default function DocView({ data, config, onUpdateConfig, view: viewProp }) {
  const canEdit = !!(data.can?.updateViews ?? data.can?.manageViews);

  // Id widoku ustalamy raz (przy wejściu): podany przez rodzica albo jedyny widok-dokument
  // tablicy, albo jedyny dokument z tą samą treścią. Później treść się zmienia, id — nie.
  const resolvedId = useRef(null);
  if (!resolvedId.current) {
    const docs = (data.views || []).filter(v => v.type === 'doc');
    const byHtml = docs.filter(v => (v.config?.html || '') === (config.html || ''));
    resolvedId.current = viewProp?.id || (docs.length === 1 ? docs[0].id : byHtml.length === 1 ? byHtml[0].id : null);
  }
  const viewId = resolvedId.current;
  const viewsRef = useRef(data.views);
  viewsRef.current = data.views;

  const [status, setStatus] = useState('idle'); // idle | dirty | saving | saved | error
  const pending = useRef(null); // HTML czekający na zapis (null = nic do zapisania)
  const timer = useRef(null);
  const mounted = useRef(true);
  const savedTimer = useRef(null);
  const set = (s) => { if (mounted.current) setStatus(s); };

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const html = pending.current;
    if (html == null) return;
    pending.current = null;
    if (!viewId || !data.updateView) { onUpdateConfig({ html }); set('saved'); return; }
    set('saving');
    const view = (viewsRef.current || []).find(v => v.id === viewId);
    // updateView zwraca false przy błędzie (toast zgłasza useBoardData) — wtedy zostaje „Nie zapisano”.
    const ok = await data.updateView(viewId, { config: { ...(view?.config || {}), html } });
    if (!ok) {
      if (pending.current == null) pending.current = html; // zostaw do ponownej próby
      set('error');
      return;
    }
    if (pending.current != null) { set('dirty'); return; } // w trakcie zapisu pisano dalej
    set('saved');
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => set('idle'), 2000);
  }, [viewId, data.updateView, onUpdateConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Najświeższa funkcja zapisu w refie — do zrzutu przy odmontowaniu (przełączenie widoku).
  const saveRef = useRef(save);
  saveRef.current = save;

  const handleChange = (html) => {
    if (!canEdit) return;
    pending.current = html;
    set('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(), SAVE_DELAY);
  };

  // Nigdy nie gub tekstu: przy wyjściu z widoku/zamknięciu karty zapisz to, co czeka.
  useEffect(() => {
    mounted.current = true;
    const flush = () => { if (pending.current != null) saveRef.current(); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      clearTimeout(timer.current);
      clearTimeout(savedTimer.current);
      mounted.current = false;
      flush();
    };
  }, []);

  const html = config.html || '';
  const statusEl = useMemo(() => {
    if (!canEdit) return <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Lock size={13} aria-hidden="true" /> {tr('Tylko do odczytu')}</span>;
    if (status === 'saving') return <Spinner size={13} label={tr('Zapisywanie…')} />;
    if (status === 'saved') return <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><Check size={13} aria-hidden="true" /> {tr('Zapisano')}</span>;
    if (status === 'error') {
      return (
        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
          <AlertCircle size={13} aria-hidden="true" /> {tr('Nie zapisano')}
          <button type="button" onClick={() => saveRef.current()} className="underline font-medium">{tr('Spróbuj ponownie')}</button>
        </span>
      );
    }
    return null;
  }, [canEdit, status]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-500 dark:text-gray-400 min-h-[20px]">
        <FileText size={15} aria-hidden="true" /> <span>{tr('Dokument tablicy')}</span>
        <span className="ml-auto" role="status" aria-live="polite">{statusEl}</span>
      </div>
      {!canEdit && !html.replace(/<[^>]*>/g, '').trim() ? (
        <EmptyState compact icon={FileText} title={tr('Dokument jest jeszcze pusty')} />
      ) : (
        <SimpleRichEditor content={html} onChange={handleChange} readOnly={!canEdit}
          placeholder={tr('Pisz notatki, dokumentację, ustalenia zespołu…')} minHeight={400} />
      )}
    </div>
  );
}
