import React, { useState } from 'react';
import { Send, Copy, Check, Globe, FormInput } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import FormField, { FormFieldLabel, FORM_LABEL, FORM_INPUT } from '../components/FormField';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { Toggle } from '../../Settings/components/SettingsUI';
import { toast } from '../../../lib/toast';
import { uid } from '../lib/constants';
import { tr } from '../../../i18n';

// Typy pól, które obsługuje publiczny formularz (packages/api/src/fn/board-form-get.js, ALLOWED_TYPES) —
// podgląd pokazuje dokładnie to, co zobaczy osoba z linku, i niczego więcej nie przyjmie serwer.
const PUBLIC_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);

const SECTION = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase';

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

  const row = 'flex items-center justify-between gap-3 py-3 text-sm';
  return (
    <section aria-labelledby="board-form-share" className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
      <h3 id="board-form-share" className={SECTION}>{tr('Udostępnianie')}</h3>
      <div className={`${row} ${enabled ? 'border-b border-gray-100 dark:border-gray-800' : 'pb-1'}`}>
        <div className="min-w-0">
          <div className="font-semibold text-gray-800 dark:text-gray-100">{tr('Publiczny formularz')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tr('Każdy z linkiem może wysłać zgłoszenie bez logowania.')}</div>
        </div>
        <Toggle checked={enabled} onChange={toggleEnabled} disabled={busy} label={tr('Publiczny formularz')} />
      </div>
      {enabled && (
        <>
          <div className="py-3 border-b border-gray-100 dark:border-gray-800">
            <label htmlFor="board-form-link" className={FORM_LABEL}>{tr('Link do formularza')}</label>
            <div className="relative">
              <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input id="board-form-link" readOnly value={link} onFocus={(e) => e.target.select()} className={`${FORM_INPUT} pl-9 pr-3 text-xs`} />
            </div>
            <Button variant="outline" size="sm" icon={copied ? Check : Copy} onClick={copy} className="mt-2 w-full">{copied ? tr('Skopiowano') : tr('Kopiuj link')}</Button>
          </div>
          <div className={`${row} border-b border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200`}>
            <span>{tr('Anonimowe odpowiedzi')}</span>
            <Toggle checked={!!settings.anonymous} onChange={(v) => setSetting('anonymous', v)} disabled={busy} label={tr('Anonimowe odpowiedzi')} />
          </div>
          <div className={`${row} ${settings.anonymous ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
            <span>{tr('Zbieraj e-mail wysyłającego')}</span>
            <Toggle checked={!!settings.collectEmail && !settings.anonymous} onChange={(v) => setSetting('collectEmail', v)} disabled={busy || !!settings.anonymous} label={tr('Zbieraj e-mail wysyłającego')} />
          </div>
        </>
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

  const form = (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.board?.form_settings?.title || data.board?.name}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{tr(terms?.kind === 'item' ? 'Wypełnij formularz — zostanie dodany nowy element do tablicy.' : 'Wypełnij formularz — powstanie nowe zadanie.')}</p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="board-form-name" className={FORM_LABEL}>{tr('Nazwa')}<span className="text-red-600 ml-0.5" aria-hidden="true">*</span></label>
          <input id="board-form-name" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} disabled={!can.createItems}
            placeholder={tr(terms?.placeholder || 'Nazwa elementu')} className={FORM_INPUT} />
        </div>
        {fields.map(col => (
          <div key={col.id}>
            <FormFieldLabel column={col} id={`board-form-${col.id}`} />
            <FormField column={col} id={`board-form-${col.id}`} value={cells[col.id]} onChange={(v) => setCell(col.id, v)} disabled={!can.createItems} />
          </div>
        ))}
      </div>

      {can.createItems && (
        <Button icon={Send} onClick={submit} loading={busy} disabled={!name.trim()} className="mt-7 w-full">
          {tr(terms?.addRow || 'Dodaj element')}
        </Button>
      )}
    </section>
  );

  // Szeroko: formularz + ustawienia udostępniania obok (przyklejone); wąsko: ustawienia nad formularzem.
  if (!can.updateBoard) return <div className="max-w-xl mx-auto">{form}</div>;
  return (
    <div className="max-w-5xl mx-auto grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="lg:order-2 lg:sticky lg:top-4"><SharePanel data={data} /></div>
      <div className="lg:order-1 min-w-0">{form}</div>
    </div>
  );
}
