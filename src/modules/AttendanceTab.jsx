import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check, Search, Loader2, CalendarCheck, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import CustomDatePicker from '../components/CustomDatePicker';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { tr, appLocale } from '../i18n';

const KINDS = ['nabożeństwo', 'spotkanie', 'grupa domowa', 'wydarzenie'];

// Dzień LOKALNY (toISOString dawał dzień UTC — między 00:00 a 02:00 „wczoraj”).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDay = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};
const fullName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim();

export default function AttendanceTab({ members = [] }) {
  const [date, setDate] = useState(todayStr());
  const [kind, setKind] = useState('nabożeństwo');
  const [presentIds, setPresentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(new Set());
  const [bulk, setBulk] = useState(null); // 'mark' | 'clear' — trwa operacja zbiorcza
  const [search, setSearch] = useState('');
  const loadSeq = useRef(0); // szybka zmiana daty: wynik starszego zapytania nie nadpisuje nowszego

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('attendance')
      .select('member_id')
      .eq('date', date)
      .eq('kind', kind)
      .eq('present', true);
    if (seq !== loadSeq.current) return;
    if (error) {
      setLoadError(true);
      setPresentIds(new Set());
    } else {
      setPresentIds(new Set((data || []).map((r) => r.member_id)));
    }
    setLoading(false);
  }, [date, kind]);

  useEffect(() => { load(); }, [load]);

  // Zaznaczenie jednej osoby. Stan zmieniamy DOPIERO po udanym zapisie — bez fałszywego „obecny”.
  const toggle = async (member) => {
    const memberId = member.id;
    if (pending.has(memberId) || bulk || loading) return;
    setPending((p) => new Set(p).add(memberId));
    const isPresent = presentIds.has(memberId);
    try {
      const { error } = isPresent
        ? await supabase.from('attendance').delete().eq('member_id', memberId).eq('date', date).eq('kind', kind)
        : await supabase.from('attendance').insert([{ member_id: memberId, date, kind, present: true }]);
      if (error) {
        toast.error(isPresent
          ? tr('Nie udało się odznaczyć obecności: {name}. Spróbuj ponownie.', { name: fullName(member) })
          : tr('Nie udało się zapisać obecności: {name}. Spróbuj ponownie.', { name: fullName(member) }));
        return;
      }
      setPresentIds((s) => {
        const n = new Set(s);
        if (isPresent) n.delete(memberId); else n.add(memberId);
        return n;
      });
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(memberId); return n; });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => !q || fullName(m).toLowerCase().includes(q))
      .sort((a, b) => `${a.last_name}`.localeCompare(`${b.last_name}`, 'pl'));
  }, [members, search]);

  // Zbiorczo jednym zapytaniem (dawniej 56 zapytań po kolei).
  const markAll = async () => {
    const targets = filtered.filter((m) => !presentIds.has(m.id));
    if (!targets.length) return;
    setBulk('mark');
    try {
      const { error } = await supabase.from('attendance')
        .insert(targets.map((m) => ({ member_id: m.id, date, kind, present: true })));
      if (error) toast.error(tr('Nie udało się zaznaczyć obecności. Spróbuj ponownie.'));
      else toast.success(tr('Zaznaczono obecność: {n}', { n: targets.length }));
    } finally {
      setBulk(null);
      await load();
    }
  };

  // „Wyczyść” kasuje obecności — zawsze z potwierdzeniem (dawniej bez pytania i bez cofnięcia).
  const clearAll = async () => {
    const targets = filtered.filter((m) => presentIds.has(m.id));
    if (!targets.length) return;
    const ok = await confirmDialog({
      title: tr('Wyczyścić obecność?'),
      message: tr('Usuniemy zaznaczoną obecność z dnia {date} ({kind}). Liczba osób: {n}. Tej operacji nie można cofnąć.', { n: targets.length, date: fmtDay(date), kind: tr(kind) }),
      confirmLabel: tr('Wyczyść obecność'),
      danger: true,
    });
    if (!ok) return;
    setBulk('clear');
    try {
      const { error } = await supabase.from('attendance').delete()
        .eq('date', date).eq('kind', kind).in('member_id', targets.map((m) => m.id));
      if (error) toast.error(tr('Nie udało się wyczyścić obecności. Spróbuj ponownie.'));
      else toast.success(tr('Wyczyszczono obecność: {n}', { n: targets.length }));
    } finally {
      setBulk(null);
      await load();
    }
  };

  const anyPresentInView = filtered.some((m) => presentIds.has(m.id));
  const anyAbsentInView = filtered.some((m) => !presentIds.has(m.id));

  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-5">
        <div className="w-full md:w-48">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">{tr('Data')}</label>
          <CustomDatePicker value={date} onChange={(v) => { if (v) setDate(v); }} />
        </div>
        <div className="w-full md:w-56">
          <label htmlFor="attendance-kind" className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">{tr('Typ')}</label>
          <select id="attendance-kind" value={kind} onChange={(e) => setKind(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100">
            {KINDS.map((k) => <option key={k} value={k}>{tr(k)}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Szukaj osoby...')}
              aria-label={tr('Szukaj osoby...')}
              className="w-full pl-10 pr-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200" aria-live="polite">
          <CalendarCheck size={18} className="text-accent-primary" aria-hidden="true" />
          {tr('Obecni:')} {presentIds.size} / {members.length}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={Check} onClick={markAll} loading={bulk === 'mark'}
            disabled={!!bulk || loading || loadError || !anyAbsentInView}>
            {tr('Zaznacz wszystkich')}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll} loading={bulk === 'clear'}
            disabled={!!bulk || loading || loadError || !anyPresentInView}>
            {tr('Wyczyść')}
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner center label={tr('Ładowanie…')} />
      ) : loadError ? (
        <EmptyState icon={AlertTriangle} title={tr('Nie udało się wczytać obecności')} subtitle={tr('Sprawdź połączenie z internetem i spróbuj ponownie.')}
          action={<Button variant="outline" icon={RefreshCw} onClick={load}>{tr('Spróbuj ponownie')}</Button>} compact />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((m) => {
            const on = presentIds.has(m.id);
            const busy = pending.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m)}
                disabled={busy || !!bulk}
                aria-pressed={on}
                className={`flex items-center gap-3 p-3 rounded-xl border transition text-left disabled:cursor-wait ${on ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-accent-primary-light'}`}
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-green-500 text-white' : 'border-2 border-gray-300 dark:border-gray-600'}`} aria-hidden="true">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : on ? <Check size={15} /> : null}
                </span>
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{m.first_name} {m.last_name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="col-span-full"><EmptyState icon={Users} title={tr('Brak osób')} compact /></div>}
        </div>
      )}
    </section>
  );
}
