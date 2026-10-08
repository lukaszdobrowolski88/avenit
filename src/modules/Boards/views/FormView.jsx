import React, { useState } from 'react';
import { Send, Share2, Copy, Check, Globe, FormInput } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BoardCell from '../components/BoardCell';
import ColumnIcon from '../components/ColumnIcon';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { Toggle } from '../../Settings/components/SettingsUI';
import { toast } from '../../../lib/toast';
import { getColumnType, defaultCellValue } from '../lib/columnTypes';
import { uid } from '../lib/constants';
import { tr } from '../../../i18n';

// Typy pól, które obsługuje publiczny formularz (packages/api/src/fn/board-form-get.js, ALLOWED_TYPES) —
// podgląd pokazuje dokładnie to, co zobaczy osoba z linku, i niczego więcej nie przyjmie serwer.
const PUBLIC_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);

const LABEL = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1';
const INPUT = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm';
const FIELD = 'ui-field min-h-[42px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-stretch overflow-hidden';

// Panel „Publikuj / udostępnij” — włącza publiczny formularz i pokazuje link. Tylko dla osób
// z prawem zmiany tablicy; przełącznik zmienia stan dopiero po udanym zapisie.
function SharePanel({ data }) {
  const board = data.board || {};
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = board.form_token;
  const enabled = !!board.form_enabled;
  const settings = board.form_settings || {};
  const link = token ? `${window.location.origin}/formularz/${token}` : '';

  const save = async (patch) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('boards').update(patch).eq('id', board.id);
      if (error) { toast.error(error, { fallback: tr('Nie udało się zapisać ustawień formularza') }); return false; }
      data.setBoard({ ...board, ...patch });
      return true;
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się zapisać ustawień formularza') });
      return false;
    } finally { setBusy(false); }
  };
  const toggleEnabled = (on) => (on ? save({ form_enabled: true, form_token: token || uid('frm') + uid('') }) : save({ form_enabled: false }));
  const setSetting = (k, v) => save({ form_settings: { ...settings, [k]: v } });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { toast.error(tr('Nie udało się skopiować linku.')); }
  };

  return (
    <section className="max-w-xl mx-auto mb-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-3">
        <Share2 size={16} className="text-gray-500 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{tr('Publiczny formularz')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{tr('Każdy z linkiem może wysłać zgłoszenie bez logowania.')}</div>
        </div>
        <Toggle checked={enabled} onChange={toggleEnabled} disabled={busy} label={tr('Publiczny formularz')} />
      </div>
      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input readOnly value={link} aria-label={tr('Link do formularza')} onFocus={(e) => e.target.select()} className={`${INPUT} pl-9`} />
            </div>
            <Button variant="outline" size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? tr('Skopiowano') : tr('Kopiuj')}</Button>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-200">
            <span>{tr('Anonimowe odpowiedzi')}</span>
            <Toggle checked={!!settings.anonymous} onChange={(v) => setSetting('anonymous', v)} disabled={busy} label={tr('Anonimowe odpowiedzi')} />
          </div>
          <div className={`flex items-center justify-between gap-3 text-sm ${settings.anonymous ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
            <span>{tr('Zbieraj e-mail wysyłającego')}</span>
            <Toggle checked={!!settings.collectEmail && !settings.anonymous} onChange={(v) => setSetting('collectEmail', v)} disabled={busy || !!settings.anonymous} label={tr('Zbieraj e-mail wysyłającego')} />
          </div>
        </div>
      )}
    </section>
  );
}

// Widok Formularz — wewnętrzny intake (wypełnij pola → nowe zadanie) i zarazem podgląd
// publicznego formularza: te same pola, które zobaczy osoba z linku.
export default function FormView({ data, terms }) {
  const can = data.can || {};
  const firstGroup = [...data.groups].sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0];
  const pick = Array.isArray(data.board?.form_settings?.fields) && data.board.form_settings.fields.length ? new Set(data.board.form_settings.fields) : null;
  const fields = data.columns.filter(c => PUBLIC_TYPES.has(c.type) && (!pick || pick.has(c.id)));
  const [name, setName] = useState('');
  const [cells, setCells] = useState({});
  const [busy, setBusy] = useState(false);

  const setCell = (colId, v) => setCells(prev => ({ ...prev, [colId]: v }));

  const submit = async () => {
    const n = name.trim();
    if (!n || !firstGroup || busy) return;
    setBusy(true);
    try {
      const it = await data.addItem(firstGroup.id, n, cells);
      // null = zapis się nie udał (useBoardData pokazał już błąd) — formularz zostaje wypełniony.
      if (!it) return;
      setName(''); setCells({});
      toast.success(tr('Dodano „{name}”', { name: n }));
    } finally { setBusy(false); }
  };

  if (!firstGroup) return <EmptyState icon={FormInput} title={tr('Dodaj grupę na tablicy, aby zbierać zgłoszenia formularzem.')} />;

  return (
    <div>
      {can.updateBoard && <SharePanel data={data} />}
      <section className="max-w-xl mx-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{data.board?.form_settings?.title || data.board?.name}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{tr(terms?.kind === 'item' ? 'Wypełnij formularz — zostanie dodany nowy element do tablicy.' : 'Wypełnij formularz — powstanie nowe zadanie.')}</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="board-form-name" className={LABEL}>{tr('Nazwa')} <span className="text-red-600" aria-hidden="true">*</span></label>
            <input id="board-form-name" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={tr(terms?.placeholder || 'Nazwa elementu')} className={INPUT} />
          </div>

          {fields.map(col => {
            const t = getColumnType(col.type);
            return (
              <div key={col.id}>
                <span className={`${LABEL} flex items-center gap-1.5`}>
                  <ColumnIcon name={t.icon} size={12} className="text-gray-400" /> {col.name}
                </span>
                <div className={`${FIELD} group/row`}>
                  <BoardCell column={col} value={cells[col.id] ?? defaultCellValue(col)} people={data.people}
                    onChange={(v) => setCell(col.id, v)} readOnly={!can.createItems} />
                </div>
              </div>
            );
          })}
        </div>

        {can.createItems && (
          <Button icon={Send} onClick={submit} loading={busy} disabled={!name.trim()} className="mt-6 w-full">
            {tr(terms?.addRow || 'Dodaj element')}
          </Button>
        )}
      </section>
    </div>
  );
}
