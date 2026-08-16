import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BoardCell from '../components/BoardCell';
import ColumnIcon from '../components/ColumnIcon';
import { getColumnType, defaultCellValue } from '../lib/columnTypes';

// Publiczna, anonimowa strona formularza tablicy (odpowiednik form.monday.com).
// Renderowana bez logowania; dane przez publiczne fn (board-form-get/submit).
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
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('board-form-get', { body: { token } });
        if (error || !data?.board) { setState('error'); return; }
        setBoard(data.board); setColumns(data.columns || []); setSettings(data.board.settings || {});
        setState('ready');
      } catch { setState('error'); }
    })();
  }, [token]);

  const color = board?.color || '#6366f1';
  const setCell = (id, v) => setCells(prev => ({ ...prev, [id]: v }));

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('board-form-submit', {
        body: { token, name: name.trim(), cells, respondent: settings.anonymous ? {} : { name, email } },
      });
      if (error || !data?.ok) throw new Error(data?.error || 'Błąd wysyłania');
      setMessage(data.message || 'Dziękujemy! Zgłoszenie zostało wysłane.');
      setState('sent');
    } catch (e) {
      setMessage(e.message || 'Wystąpił błąd. Spróbuj ponownie.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center p-4 py-10">
      <div className="w-full max-w-xl">
        {state === 'loading' && <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>}

        {state === 'error' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
            <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Formularz niedostępny</h1>
            <p className="text-sm text-gray-500 mt-1">Link jest nieprawidłowy lub formularz został wyłączony.</p>
          </div>
        )}

        {state === 'sent' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-green-500 mb-3" />
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{message}</h1>
            <button onClick={() => { setName(''); setEmail(''); setCells({}); setState('ready'); }}
              className="mt-5 text-sm text-white px-4 py-2 rounded-lg" style={{ backgroundColor: color }}>
              Wyślij kolejne zgłoszenie
            </button>
          </div>
        )}

        {state === 'ready' && board && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="h-2.5" style={{ backgroundColor: color }} />
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{settings.title || board.name}</h1>
              {settings.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{settings.description}</p>}
              {message && <div className="mt-3 flex items-center gap-2 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm"><AlertCircle size={15} /> {message}</div>}

              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Nazwa / temat <span className="text-red-500">*</span></span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wpisz tytuł zgłoszenia"
                    className="mt-1 w-full bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2.5 outline-none focus:ring-2 text-gray-800 dark:text-gray-100"
                    style={{ '--tw-ring-color': color }} />
                </label>

                {!settings.anonymous && settings.collectEmail && (
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Twój e-mail</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@przyklad.pl"
                      className="mt-1 w-full bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2.5 outline-none text-gray-800 dark:text-gray-100" />
                  </label>
                )}

                {columns.map(col => {
                  const t = getColumnType(col.type);
                  return (
                    <div key={col.id}>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                        <ColumnIcon name={t.icon} size={13} className="text-gray-400" /> {col.name}
                      </span>
                      <div className="min-h-[42px] border border-gray-200 dark:border-gray-700 rounded-lg flex items-stretch overflow-hidden">
                        <BoardCell column={col} value={cells[col.id] ?? defaultCellValue(col)} people={[]} onChange={(v) => setCell(col.id, v)} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={submit} disabled={!name.trim() || busy}
                className="mt-7 w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-medium disabled:opacity-40"
                style={{ backgroundColor: color }}>
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />} Wyślij
              </button>
              <p className="text-center text-[11px] text-gray-400 mt-4">Formularz utworzony w Avenit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
