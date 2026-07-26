import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, X, Search, CalendarOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { memberName, formatDate, todayIso, isUpcoming } from '../lib/serveApi';

const emptyForm = { member_id: '', start_date: todayIso(), end_date: todayIso(), reason: '' };

export default function AvailabilityTab({ members, membersById, campusIdForInsert, withCampusFilter }) {
  const [blockouts, setBlockouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('volunteer_blockouts').select('*').order('start_date', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setBlockouts(data || []);
    } catch (err) {
      console.error('Load blockouts error:', err);
      setBlockouts([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const upcomingCount = useMemo(() => blockouts.filter(isUpcoming).length, [blockouts]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return blockouts.filter(b => {
      if (onlyUpcoming && !isUpcoming(b)) return false;
      if (!s) return true;
      const name = memberName(membersById[b.member_id]).toLowerCase();
      return name.includes(s) || (b.reason || '').toLowerCase().includes(s);
    });
  }, [blockouts, search, onlyUpcoming, membersById]);

  const memberOptions = useMemo(() => [
    { value: '', label: '— wybierz wolontariusza —' },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);

  const openCreate = () => { setForm(emptyForm); setModalOpen(true); };

  const save = async () => {
    if (!form.member_id) { alert('Wskaż wolontariusza.'); return; }
    if (!form.start_date || !form.end_date) { alert('Podaj zakres dat (od–do).'); return; }
    if (form.end_date < form.start_date) { alert('Data „do" nie może być wcześniejsza niż data „od".'); return; }
    setSaving(true);
    try {
      const payload = {
        member_id: form.member_id,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
        campus_id: campusIdForInsert,
      };
      const { error } = await supabase.from('volunteer_blockouts').insert(payload);
      if (error) throw error;
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save blockout error:', err);
      alert('Nie udało się zapisać niedostępności: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    if (!confirm('Usunąć tę niedostępność?')) return;
    try {
      const { error } = await supabase.from('volunteer_blockouts').delete().eq('id', b.id);
      if (error) throw error;
      load();
    } catch (err) {
      alert('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj wolontariusza lub powodu..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <button
          onClick={() => setOnlyUpcoming(v => !v)}
          className={`px-3 py-2.5 rounded-xl border text-sm flex items-center gap-2 transition ${
            onlyUpcoming
              ? 'border-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <CalendarOff size={16} /> {onlyUpcoming ? 'Tylko nadchodzące' : 'Wszystkie'}
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Dodaj niedostępność
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Pozycji: <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Nadchodzące: <b className="text-accent-primary dark:text-accent-primary-light">{upcomingCount}</b></span>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarOff size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {onlyUpcoming ? 'Brak nadchodzących niedostępności.' : 'Brak zgłoszonych niedostępności.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Wolontariusz</th>
                  <th className="px-4 py-3 font-semibold">Od</th>
                  <th className="px-4 py-3 font-semibold">Do</th>
                  <th className="px-4 py-3 font-semibold">Powód</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{memberName(membersById[b.member_id])}</div>
                      {isUpcoming(b) && <span className="text-xs text-accent-primary dark:text-accent-primary-light">nadchodząca</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(b.start_date)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(b.end_date)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.reason || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => remove(b)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Nowa niedostępność</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <CustomSelect label="Wolontariusz" value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} options={memberOptions} placeholder="Wybierz wolontariusza..." />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Od</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Do</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Powód (opcjonalnie)</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="np. urlop, wyjazd, choroba" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
