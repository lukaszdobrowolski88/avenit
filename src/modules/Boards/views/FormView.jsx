import React, { useState } from 'react';
import { Send, CheckCircle2, Share2, Copy, Check, Globe } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BoardCell from '../components/BoardCell';
import ColumnIcon from '../components/ColumnIcon';
import { getColumnType, defaultCellValue } from '../lib/columnTypes';
import { uid } from '../lib/constants';

// Panel „Publikuj / udostępnij" — włącza publiczny formularz i pokazuje link.
function SharePanel({ data }) {
  const board = data.board || {};
  const [copied, setCopied] = useState(false);
  const token = board.form_token;
  const enabled = !!board.form_enabled;
  const settings = board.form_settings || {};
  const link = token ? `${window.location.origin}/formularz/${token}` : '';

  const save = async (patch) => {
    await supabase.from('boards').update(patch).eq('id', board.id);
    data.setBoard({ ...board, ...patch });
  };
  const toggleEnabled = () => {
    if (!enabled) save({ form_enabled: true, form_token: token || uid('frm') + uid('') });
    else save({ form_enabled: false });
  };
  const setSetting = (k, v) => save({ form_settings: { ...settings, [k]: v } });
  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="max-w-xl mx-auto mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2">
        <Share2 size={16} className="text-accent-primary" />
        <span className="flex-1 font-medium text-gray-800 dark:text-gray-100 text-sm">Publiczny formularz</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={toggleEnabled} className="sr-only peer" />
          <div className="w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-checked:bg-accent-primary rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>
      {enabled && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2">
            <Globe size={14} className="text-gray-400 shrink-0" />
            <input readOnly value={link} className="flex-1 bg-transparent text-sm text-gray-600 dark:text-gray-300 outline-none" />
            <button onClick={copy} className="flex items-center gap-1 text-xs text-accent-primary shrink-0">
              {copied ? <><Check size={13} /> Skopiowano</> : <><Copy size={13} /> Kopiuj</>}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={!!settings.anonymous} onChange={(e) => setSetting('anonymous', e.target.checked)} className="accent-accent-primary" />
            Anonimowe odpowiedzi
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={!!settings.collectEmail} onChange={(e) => setSetting('collectEmail', e.target.checked)} disabled={settings.anonymous} className="accent-accent-primary" />
            Zbieraj e-mail wysyłającego
          </label>
        </div>
      )}
    </div>
  );
}

// Widok Formularz — wewnętrzny intake: wypełnij pola → utwórz element tablicy.
// (Odpowiednik „Form view" z Monday; publiczny formularz można podłączyć później.)
export default function FormView({ data, config }) {
  const firstGroup = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
  const fields = data.columns.filter(c => c.type !== 'formula');
  const [name, setName] = useState('');
  const [cells, setCells] = useState({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const setCell = (colId, v) => setCells(prev => ({ ...prev, [colId]: v }));

  const submit = async () => {
    if (!name.trim() || !firstGroup) return;
    setBusy(true);
    await data.addItem(firstGroup.id, name.trim(), cells);
    setBusy(false);
    setName(''); setCells({}); setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  if (!firstGroup) return <div className="text-center py-16 text-gray-400 text-sm">Dodaj grupę na tablicy, aby zbierać zgłoszenia formularzem.</div>;

  return (
    <div>
      <SharePanel data={data} />
      <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="h-2" style={{ backgroundColor: data.board?.color || '#6366f1' }} />
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">{data.board?.name}</h2>
          <p className="text-sm text-gray-400 mb-5">Wypełnij formularz — zostanie dodany nowy element do tablicy.</p>

          {sent && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 text-green-600 rounded-xl px-3 py-2 mb-4 text-sm">
              <CheckCircle2 size={16} /> Dodano element do tablicy.
            </div>
          )}

          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Nazwa <span className="text-red-500">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tytuł elementu"
              className="mt-1 w-full bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-accent-primary/40 text-gray-800 dark:text-gray-100" />
          </label>

          <div className="space-y-3">
            {fields.map(col => {
              const t = getColumnType(col.type);
              return (
                <div key={col.id}>
                  <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 mb-1">
                    <ColumnIcon name={t.icon} size={13} className="text-gray-400" /> {col.name}
                  </span>
                  <div className="min-h-[38px] border border-gray-200 dark:border-gray-700 rounded-lg flex items-stretch overflow-hidden">
                    <BoardCell column={col} value={cells[col.id] ?? defaultCellValue(col)} people={data.people}
                      onChange={(v) => setCell(col.id, v)} />
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={submit} disabled={!name.trim() || busy}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-accent-primary text-white py-2.5 rounded-xl font-medium hover:opacity-90 disabled:opacity-40">
            <Send size={16} /> Dodaj element
          </button>
        </div>
      </div>
    </div>
  );
}
