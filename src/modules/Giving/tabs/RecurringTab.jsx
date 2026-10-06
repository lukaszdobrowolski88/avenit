import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, Repeat, Pause, Play } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { formatMoney, formatDate, frequencyLabel, memberName, GIVING_METHODS, GIVING_FREQUENCIES, computeNextRun } from '../lib/givingApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

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
    { value: '', label: tr('— darczyńca spoza bazy —') },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);
  const fundOptions = useMemo(() => [
    { value: '', label: tr('— bez funduszu —') },
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
    if (!form.amount || Number(form.amount) <= 0) { toast.error(tr('Podaj kwotę.')); return; }
    if (!form.member_id && !form.donor_name) { toast.error(tr('Wskaż członka lub podaj darczyńcę.')); return; }
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
      toast.error(tr('Nie udało się zapisać planu: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      const { error } = await supabase.from('giving_recurring').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
      load();
    } catch (err) { toast.error(tr('Błąd: {msg}', { msg: err.message || err })); }
  };

  const remove = async (p) => {
    if (!await confirmDialog(tr('Usunąć ten plan cykliczny?'))) return;
    try {
      const { error } = await supabase.from('giving_recurring').delete().eq('id', p.id);
      if (error) throw error;
      load();
    } catch (err) { toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err })); }
  };

  const donorName = (p) => p.member_id && membersById?.[p.member_id] ? memberName(membersById[p.member_id]) : (p.donor_name || '');
  const monthlyTotal = useMemo(() => plans.filter(p => p.is_active).reduce((s, p) => {
    const factor = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[p.frequency] || 1;
    return s + (Number(p.amount) || 0) * factor;
  }, 0), [plans]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="text-sm">
          <span className="text-gray-500 dark:text-gray-400">{tr('Aktywne plany:')} <b className="text-gray-900 dark:text-white">{plans.filter(p => p.is_active).length}</b></span>
          <span className="text-gray-500 dark:text-gray-400 ml-4">{tr('Szac. miesięcznie:')} <b className="text-accent-primary dark:text-accent-primary-light">{formatMoney(monthlyTotal)}</b></span>
        </div>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md"><Plus size={16} /> {tr('Dodaj plan')}</button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? <Spinner center />
        : plans.length === 0 ? (
          <EmptyState icon={Repeat} title={tr('Brak planów cyklicznego dawania.')} />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Darczyńca')}</TH>
                <TH>{tr('Kwota')}</TH>
                <TH>{tr('Częstotliwość')}</TH>
                <TH>{tr('Fundusz')}</TH>
                <TH>{tr('Nast. pobranie')}</TH>
                <TH>{tr('Status')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {plans.map(p => (
                <TR key={p.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{donorName(p)}</TD>
                  <TD numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(p.amount, p.currency)}</TD>
                  <TD muted>{tr(frequencyLabel(p.frequency))}</TD>
                  <TD muted>
                    {p.fund_id && fundsById[p.fund_id] ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: fundsById[p.fund_id].color || '#94a3b8' }} />
                        {fundsById[p.fund_id].name}
                      </span>
                    ) : null}
                  </TD>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(p.next_run_date)}</TD>
                  <TD>
                    <StatusPill color={p.is_active ? STATUS_COLORS.success : STATUS_COLORS.neutral}>{p.is_active ? tr('Aktywny') : tr('Wstrzymany')}</StatusPill>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => toggleActive(p)} title={p.is_active ? tr('Wstrzymaj') : tr('Wznów')} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700">{p.is_active ? <Pause size={15} /> : <Play size={15} />}</button>
                        <button onClick={() => openEdit(p)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                        <button onClick={() => remove(p)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? tr('Edytuj plan') : tr('Nowy plan cykliczny')}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <CustomSelect label={tr('Darczyńca (członek)')} value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} options={memberOptions} />
              {!form.member_id && (
                <input value={form.donor_name} onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} placeholder={tr('Imię i nazwisko darczyńcy')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Kwota (PLN)')}</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <CustomSelect label={tr('Częstotliwość')} value={form.frequency} onChange={v => setForm(f => ({ ...f, frequency: v }))} options={GIVING_FREQUENCIES.map((o) => ({ ...o, label: tr(o.label) }))} />
              </div>
              <CustomSelect label={tr('Fundusz')} value={form.fund_id} onChange={v => setForm(f => ({ ...f, fund_id: v }))} options={fundOptions} />
              <div className="grid grid-cols-2 gap-3">
                <CustomSelect label={tr('Metoda')} value={form.method} onChange={v => setForm(f => ({ ...f, method: v }))} options={GIVING_METHODS.map((o) => ({ ...o, label: tr(o.label) }))} />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Dzień miesiąca')}</label>
                  <input type="number" min="1" max="28" value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))} placeholder={tr('np. 10')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Początek')}</label>
                  <DateInput value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Koniec (opcjonalnie)')}</label>
                  <DateInput value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <p className="text-xs text-gray-400">{tr('Plany są ewidencją zobowiązań. Automatyczne pobrania online podłączymy w kroku integracji Przelewy24/BLIK.')}</p>
            </div>
      </Modal>
    </div>
  );
}
