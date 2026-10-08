import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BoardCell from '../components/BoardCell';
import ColumnIcon from '../components/ColumnIcon';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { getColumnType, defaultCellValue } from '../lib/columnTypes';
import { tr } from '../../../i18n';

const LABEL = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1';
const INPUT = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm';
const FIELD = 'ui-field min-h-[42px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-stretch overflow-hidden';

// Publiczna, anonimowa strona formularza tablicy (odpowiednik form.monday.com).
// Renderowana bez logowania; dane przez publiczne fn (board-form-get/submit).
// Wygląd jak reszta aplikacji: główny przycisk w kolorze marki (nie kolor tablicy), bez paska.
export default function PublicBoardForm() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | error | sent
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [settings, setSettings] = useState({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cells, setCells] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke('board-form-get', { body: { token } });
        if (e || !data?.board) { setState('error'); return; }
        setBoard(data.board); setColumns(data.columns || []); setSettings(data.board.settings || {});
        setState('ready');
      } catch { setState('error'); }
    })();
  }, [token]);

  const setCell = (id, v) => setCells(prev => ({ ...prev, [id]: v }));

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      // Bez „name” w respondent — to był tytuł zgłoszenia, a trafiał do dziennika jako autor.
      const respondent = settings.anonymous ? {} : (email.trim() ? { email: email.trim() } : {});
      const { data, error: e } = await supabase.functions.invoke('board-form-submit', {
        body: { token, name: name.trim(), cells, respondent },
      });
      if (e || !data?.ok) throw new Error(data?.error || tr('Błąd wysyłania'));
      setThanks(data.message || tr('Dziękujemy! Zgłoszenie zostało wysłane.'));
      setState('sent');
    } catch (err) {
      setError(err?.message || tr('Wystąpił błąd. Spróbuj ponownie.'));
    } finally { setBusy(false); }
  };

  const again = () => { setName(''); setEmail(''); setCells({}); setError(''); setThanks(''); setState('ready'); };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-start justify-center p-4 py-10">
      <main className="w-full max-w-xl">
        {state === 'loading' && <Spinner center size={30} />}

        {state === 'error' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <AlertCircle size={40} className="mx-auto text-gray-400 mb-3" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{tr('Formularz niedostępny')}</h1>
            <p className="text-sm text-gray-500 mt-1">{tr('Link jest nieprawidłowy lub formularz został wyłączony.')}</p>
          </div>
        )}

        {state === 'sent' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center" role="status">
            <CheckCircle2 size={44} className="mx-auto text-green-600 mb-3" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{thanks}</h1>
            <Button variant="outline" onClick={again} className="mt-5">{tr('Wyślij kolejne zgłoszenie')}</Button>
          </div>
        )}

        {state === 'ready' && board && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{settings.title || board.name}</h1>
            {settings.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-line">{settings.description}</p>}
            {error && (
              <div className="mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 rounded-xl px-3 py-2 text-sm" role="alert">
                <AlertCircle size={15} className="shrink-0" aria-hidden="true" /> {error}
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="pbf-name" className={LABEL}>{tr('Nazwa / temat')} <span className="text-red-600" aria-hidden="true">*</span></label>
                <input id="pbf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Wpisz tytuł zgłoszenia')}
                  required aria-required="true" maxLength={500} className={INPUT} />
              </div>

              {!settings.anonymous && settings.collectEmail && (
                <div>
                  <label htmlFor="pbf-email" className={LABEL}>{tr('Twój e-mail')}</label>
                  <input id="pbf-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={tr('jan@przyklad.pl')} maxLength={200} className={INPUT} />
                </div>
              )}

              {columns.map(col => {
                const t = getColumnType(col.type);
                return (
                  <div key={col.id}>
                    <span className={`${LABEL} flex items-center gap-1.5`}>
                      <ColumnIcon name={t.icon} size={12} className="text-gray-400" /> {col.name}
                    </span>
                    <div className={`${FIELD} group/row`}>
                      <BoardCell column={col} value={cells[col.id] ?? defaultCellValue(col)} people={[]} onChange={(v) => setCell(col.id, v)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button size="lg" icon={Send} onClick={submit} loading={busy} disabled={!name.trim()} className="mt-7 w-full">
              {tr('Wyślij')}
            </Button>
            <p className="text-center text-[11px] text-gray-400 mt-4">{tr('Formularz utworzony w Avenit')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
