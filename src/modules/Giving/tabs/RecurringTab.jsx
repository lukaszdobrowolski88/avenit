import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Repeat, Pause, Play } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { formatMoney, formatDate, frequencyLabel, memberName, GIVING_METHODS, GIVING_FREQUENCIES, computeNextRun } from '../lib/givingApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';

const emptyForm = {
  member_id: '', donor_name: '', fund_id: '', amount: '', frequency: 'monthly',
  day_of_month: '', method: 'transfer', start_date: new Date().toISOString().slice(0, 10), end_date: '',
};

export default function RecurringTab({ funds, members, membersById, campusIdForInsert, withCampusFilter }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('giving_recurring').select('*').order('created_at', { ascending: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      console.error('Load recurring error:', err);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  const fundsById = useMemo(() => { const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m; }, [funds]);

  const memberOptions = useMemo(() => [
    { value: '', label: '— darczyńca spoza bazy —' },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);
  const fundOptions = useMemo(() => [
    { value: '', label: '— bez funduszu —' },
    ...(funds || []).map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      member_id: p.member_id || '', donor_name: p.donor_name || '', fund_id: p.fund_id || '',
      amount: String(p.amount ?? ''), frequency: p.frequency || 'monthly', day_of_month: p.day_of_month || '',
      method: p.method || 'transfer', start_date: p.start_date || new Date().toISOString().slice(0, 10), end_date: p.end_date || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Podaj kwotę.'); return; }
    if (!form.member_id && !form.donor_name) { toast.error('Wskaż członka lub podaj darczyńcę.'); return; }
    setSaving(true);
    try {
      const payload = {
        member_id: form.member_id || null, donor_name: form.donor_name || null, fund_id: form.fund_id || null,
        amount: Number(form.amount), frequency: form.frequency, method: form.method,
        day_of_month: form.day_of_month ? Number(form.day_of_month) : null,
        start_date: form.start_date, end_date: form.end_date || null,
        next_run_date: computeNextRun(form.frequency, new Date(form.start_date), form.day_of_month ? Number(form.day_of_month) : null),
      };
      if (editing) {
        const { error } = await supabase.from('giving_recurring').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        payload.is_active = true;
        const { error } = await supabase.from('giving_recurring').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error('Nie udało się zapisać planu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      const { error } = await supabase.from('giving_recurring').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
      load();
    } catch (err) { toast.error('Błąd: ' + (err.message || err)); }
  };

  const remove = async (p) => {
    if (!confirm('Usunąć ten plan cykliczny?')) return;
    try {
      const { error } = await supabase.from('giving_recurring').delete().eq('id', p.id);
      if (error) throw error;
      load();
    } catch (err) { toast.error('Nie udało się usunąć: ' + (err.message || err)); }
  };

  const donorName = (p) => p.member_id && membersById?.[p.member_id] ? memberName(membersById[p.member_id]) : (p.donor_name || '—');
  const monthlyTotal = useMemo(() => plans.filter(p => p.is_active).reduce((s, p) => {
    const factor = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[p.frequency] || 1;
    return s + (Number(p.amount) || 0) * factor;
  }, 0), [plans]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="text-sm">
          <span className="text-gray-500 dark:text-gray-400">Aktywne plany: <b className="text-gray-900 dark:text-white">{plans.filter(p => p.is_active).length}</b></span>
          <span className="text-gray-500 dark:text-gray-400 ml-4">Szac. miesięcznie: <b className="text-accent-primary dark:text-accent-primary-light">{formatMoney(monthlyTotal)}</b></span>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md"><Plus size={16} /> Dodaj plan</button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? <Spinner center />
        : plans.length === 0 ? (
          <div className="p-12 text-center">
            <Repeat size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak planów cyklicznego dawania.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Darczyńca</th>
                  <th className="px-4 py-3 font-semibold">Kwota</th>
                  <th className="px-4 py-3 font-semibold">Częstotliwość</th>
                  <th className="px-4 py-3 font-semibold">Fundusz</th>
                  <th className="px-4 py-3 font-semibold">Nast. pobranie</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{donorName(p)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{frequencyLabel(p.frequency)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fundsById[p.fund_id]?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(p.next_run_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{p.is_active ? 'Aktywny' : 'Wstrzymany'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleActive(p)} title={p.is_active ? 'Wstrzymaj' : 'Wznów'} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700">{p.is_active ? <Pause size={15} /> : <Play size={15} />}</button>
                        <button onClick={() => openEdit(p)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                        <button onClick={() => remove(p)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj plan' : 'Nowy plan cykliczny'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <CustomSelect label="Darczyńca (członek)" value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} options={memberOptions} />
              {!form.member_id && (
                <input value={form.donor_name} onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} placeholder="Imię i nazwisko darczyńcy" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Kwota (PLN)</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <CustomSelect label="Częstotliwość" value={form.frequency} onChange={v => setForm(f => ({ ...f, frequency: v }))} options={GIVING_FREQUENCIES} />
              </div>
              <CustomSelect label="Fundusz" value={form.fund_id} onChange={v => setForm(f => ({ ...f, fund_id: v }))} options={fundOptions} />
              <div className="grid grid-cols-2 gap-3">
                <CustomSelect label="Metoda" value={form.method} onChange={v => setForm(f => ({ ...f, method: v }))} options={GIVING_METHODS} />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Dzień miesiąca</label>
                  <input type="number" min="1" max="28" value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))} placeholder="np. 10" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Początek</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Koniec (opcjonalnie)</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Plany są ewidencją zobowiązań. Automatyczne pobrania online podłączymy w kroku integracji Przelewy24/BLIK.</p>
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
