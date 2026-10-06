import React, { useState } from 'react';
import { CalendarX, Plus, X, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';

// „Moje nieobecności” — JEDNA funkcja nieobecności, wspólna z aplikacją mobilną:
// volunteer_blockouts przez fn my-blockouts (member_id ustala serwer). Lider widzi
// wszystkie wpisy w Służba → Dostępność. Dawny model user_absences (nieobecność „na
// program” dopisywana do JSON-a programu) nie jest już używany — grafik żyje na
// wydarzeniach i tamtych wpisów nie czytał.

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
};

const rangeLabel = (b) =>
  b.start_date === b.end_date ? fmt(b.start_date) : `${fmt(b.start_date)} – ${fmt(b.end_date)}`;

export default function MyAbsencesWidget({ absences, onRefresh }) {
  const data = absences && !Array.isArray(absences) ? absences : { memberResolved: true, blockouts: [] };
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ start_date: todayYmd(), end_date: todayYmd(), reason: '' });
  const [saving, setSaving] = useState(false);

  const today = todayYmd();
  // Bieżące i przyszłe na górze; minione (do 3) przygaszone pod spodem.
  const current = (data.blockouts || []).filter((b) => b.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = (data.blockouts || []).filter((b) => b.end_date < today).slice(0, 3);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) return;
    if (form.end_date < form.start_date) {
      toast.error(tr('Data końca nie może być wcześniejsza niż początek'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'add', start_date: form.start_date, end_date: form.end_date, reason: form.reason.trim() || null },
      });
      if (error) throw error;
      setForm({ start_date: todayYmd(), end_date: todayYmd(), reason: '' });
      setIsAdding(false);
      onRefresh?.();
    } catch (err) {
      toast.error(err?.message || tr('Nie udało się zapisać nieobecności'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b) => {
    if (!await confirmDialog(tr('Czy na pewno chcesz usunąć tę nieobecność?'))) return;
    try {
      const { error } = await supabase.functions.invoke('my-blockouts', { body: { action: 'delete', id: b.id } });
      if (error) throw error;
      onRefresh?.();
    } catch (err) {
      toast.error(err?.message || tr('Nie udało się usunąć wpisu'));
    }
  };

  if (!data.memberResolved) {
    return (
      <div className="text-center py-4 px-2">
        <CalendarX size={22} className="mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 dark:text-gray-300">{tr('Twoje konto nie jest jeszcze powiązane z profilem członka.')}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{tr('Poproś administratora o powiązanie — wtedy zgłosisz nieobecność.')}</p>
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light';

  const row = (b, muted) => (
    <div
      key={b.id}
      className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border ${
        muted ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
        <CalendarX size={18} className="text-gray-500 dark:text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 dark:text-white truncate">{rangeLabel(b)}</p>
        {b.reason && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.reason}</p>}
      </div>
      {!muted && (
        <button
          onClick={() => handleDelete(b)}
          title={tr('Usuń')}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-accent-primary-light dark:hover:border-accent-primary hover:text-accent-primary-light dark:hover:text-accent-primary-light transition-colors"
        >
          <Plus size={18} />
          <span className="font-medium">{tr('Zgłoś nieobecność')}</span>
        </button>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-gray-800 dark:text-white">{tr('Zgłoś nieobecność')}</h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Od')}</label>
              <DateInput
                value={form.start_date}
                min={todayYmd()}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Do')}</label>
              <DateInput value={form.end_date} min={form.start_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Powód (opcjonalnie)')}</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={tr('np. urlop, wyjazd')}
              rows={2}
              maxLength={500}
              className={`${inputCls} placeholder-gray-400 dark:placeholder-gray-500 resize-none`}
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{tr('Lider zobaczy Twoją nieobecność przy układaniu grafiku.')}</p>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? tr('Zapisywanie...') : tr('Zgłoś nieobecność')}
          </button>
        </form>
      )}

      {current.length > 0 ? (
        <div className="space-y-2">{current.slice(0, 5).map((b) => row(b, false))}</div>
      ) : (
        !isAdding && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Brak zgłoszonych nieobecności')}</p>
          </div>
        )
      )}
      {current.length > 5 && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">+ {current.length - 5} {tr('więcej')}</p>
      )}
      {past.length > 0 && <div className="space-y-2">{past.map((b) => row(b, true))}</div>}
    </div>
  );
}
