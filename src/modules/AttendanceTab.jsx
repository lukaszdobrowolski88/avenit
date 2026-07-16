import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, Search, Loader2, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CustomDatePicker from '../components/CustomDatePicker';
import { tr } from '../i18n';

const KINDS = ['nabożeństwo', 'spotkanie', 'grupa domowa', 'wydarzenie'];

const todayStr = () => new Date().toISOString().split('T')[0];

export default function AttendanceTab({ members = [] }) {
  const [date, setDate] = useState(todayStr());
  const [kind, setKind] = useState('nabożeństwo');
  const [presentIds, setPresentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(new Set());
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('attendance')
        .select('member_id')
        .eq('date', date)
        .eq('kind', kind)
        .eq('present', true);
      setPresentIds(new Set((data || []).map((r) => r.member_id)));
    } catch (e) {
      console.error('Attendance load error:', e);
    } finally {
      setLoading(false);
    }
  }, [date, kind]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (memberId) => {
    if (pending.has(memberId)) return;
    setPending((p) => new Set(p).add(memberId));
    const isPresent = presentIds.has(memberId);
    try {
      if (isPresent) {
        await supabase.from('attendance').delete()
          .eq('member_id', memberId).eq('date', date).eq('kind', kind);
        setPresentIds((s) => { const n = new Set(s); n.delete(memberId); return n; });
      } else {
        await supabase.from('attendance').insert([{ member_id: memberId, date, kind, present: true }]);
        setPresentIds((s) => new Set(s).add(memberId));
      }
    } catch (e) {
      console.error('Attendance toggle error:', e);
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(memberId); return n; });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => !q || `${m.first_name} ${m.last_name}`.toLowerCase().includes(q))
      .sort((a, b) => `${a.last_name}`.localeCompare(`${b.last_name}`, 'pl'));
  }, [members, search]);

  const markAll = async (present) => {
    const targets = filtered.filter((m) => presentIds.has(m.id) !== present);
    for (const m of targets) { await toggle(m.id); }
  };

  return (
    <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-5">
        <div className="w-full md:w-48">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">{tr('Data')}</label>
          <CustomDatePicker value={date} onChange={setDate} />
        </div>
        <div className="w-full md:w-56">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Typ</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100">
            {KINDS.map((k) => <option key={k} value={k}>{tr(k)}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj osoby..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white/50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
          <CalendarCheck size={18} className="text-accent-primary" />
          Obecni: {presentIds.size} / {members.length}
        </div>
        <div className="flex gap-2">
          <button onClick={() => markAll(true)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 font-medium hover:bg-green-100 transition">Zaznacz wszystkich</button>
          <button onClick={() => markAll(false)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium hover:bg-gray-200 transition">{tr('Wyczyść')}</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 size={18} className="animate-spin" /> Ładowanie…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((m) => {
            const on = presentIds.has(m.id);
            const busy = pending.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                disabled={busy}
                className={`flex items-center gap-3 p-3 rounded-xl border transition text-left ${on ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-accent-primary-light'}`}
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-green-500 text-white' : 'border-2 border-gray-300 dark:border-gray-600'}`}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : on ? <Check size={15} /> : null}
                </span>
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{m.first_name} {m.last_name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="col-span-full text-center text-sm text-gray-400 py-6">{tr('Brak osób')}</div>}
        </div>
      )}
    </section>
  );
}
