import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Receipt, Filter, Download } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { formatMoney, formatDate, methodLabel, statusLabel, donorLabel, memberName, GIVING_METHODS, GIVING_STATUSES } from '../lib/givingApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';

const currentYear = new Date().getFullYear();

const emptyForm = {
  member_id: '', donor_name: '', donor_email: '', donor_address: '',
  fund_id: '', amount: '', donation_date: new Date().toISOString().slice(0, 10),
  method: 'transfer', status: 'completed', note: '', is_anonymous: false, receipt_number: '',
};

export default function DonationsTab({ funds, members, membersById, campusIdForInsert, withCampusFilter, refreshShared }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [fundFilter, setFundFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('donations').select('*').order('donation_date', { ascending: false });
      q = withCampusFilter(q);
      if (yearFilter) {
        q = q.gte('donation_date', `${yearFilter}-01-01`).lte('donation_date', `${yearFilter}-12-31`);
      }
      if (fundFilter) q = q.eq('fund_id', fundFilter);
      if (methodFilter) q = q.eq('method', methodFilter);
      const { data, error } = await q;
      if (error) throw error;
      setDonations(data || []);
    } catch (err) {
      console.error('Load donations error:', err);
      setDonations([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, yearFilter, fundFilter, methodFilter]);

  useEffect(() => { load(); }, [load]);

  const fundsById = useMemo(() => {
    const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m;
  }, [funds]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return donations;
    return donations.filter(d => {
      const name = donorLabel(d, membersById).toLowerCase();
      return name.includes(s) || (d.note || '').toLowerCase().includes(s) || (d.receipt_number || '').toLowerCase().includes(s);
    });
  }, [donations, search, membersById]);

  const total = useMemo(() => filtered.reduce((sum, d) => sum + (Number(d.amount) || 0), 0), [filtered]);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= currentYear - 6; y--) years.push({ value: y, label: String(y) });
    return years;
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({
      member_id: d.member_id || '', donor_name: d.donor_name || '', donor_email: d.donor_email || '',
      donor_address: d.donor_address || '', fund_id: d.fund_id || '', amount: String(d.amount ?? ''),
      donation_date: d.donation_date || new Date().toISOString().slice(0, 10), method: d.method || 'transfer',
      status: d.status || 'completed', note: d.note || '', is_anonymous: !!d.is_anonymous, receipt_number: d.receipt_number || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Podaj kwotę darowizny.'); return; }
    if (!form.member_id && !form.donor_name && !form.is_anonymous) {
      toast.error('Wskaż członka lub podaj imię i nazwisko darczyńcy (albo zaznacz „Anonimowo").'); return;
    }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const payload = {
        member_id: form.member_id || null,
        donor_name: form.donor_name || null,
        donor_email: form.donor_email || null,
        donor_address: form.donor_address || null,
        fund_id: form.fund_id || null,
        amount: Number(form.amount),
        donation_date: form.donation_date,
        method: form.method,
        status: form.status,
        note: form.note || null,
        is_anonymous: form.is_anonymous,
        receipt_number: form.receipt_number || null,
      };
      if (editing) {
        const { error } = await supabase.from('donations').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        payload.created_by = user?.email || null;
        const { error } = await supabase.from('donations').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save donation error:', err);
      toast.error('Nie udało się zapisać darowizny: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!await confirmDialog('Usunąć tę darowiznę?')) return;
    try {
      const { error } = await supabase.from('donations').delete().eq('id', d.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  const exportCsv = () => {
    const rows = [['Data', 'Darczyńca', 'Fundusz', 'Kwota', 'Metoda', 'Status', 'Notatka']];
    filtered.forEach(d => {
      rows.push([
        d.donation_date, donorLabel(d, membersById), fundsById[d.fund_id]?.name || '',
        String(d.amount), methodLabel(d.method), statusLabel(d.status), (d.note || '').replace(/[\n;]/g, ' '),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `darowizny_${yearFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const memberOptions = useMemo(() => [
    { value: '', label: '— darczyńca spoza bazy —' },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);

  const fundOptionsAll = useMemo(() => [
    { value: '', label: 'Wszystkie fundusze' },
    ...(funds || []).map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  const fundOptionsForm = useMemo(() => [
    { value: '', label: '— bez funduszu —' },
    ...(funds || []).map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj darczyńcy, notatki, nr pokwitowania..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-32"><CustomSelect value={yearFilter} onChange={setYearFilter} options={yearOptions} compact /></div>
        <div className="w-44"><CustomSelect value={fundFilter} onChange={setFundFilter} options={fundOptionsAll} compact icon={Filter} /></div>
        <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
          <Download size={16} /> CSV
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Dodaj darowiznę
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Pozycji: <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Suma: <b className="text-accent-primary dark:text-accent-primary-light">{formatMoney(total)}</b></span>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <Spinner center />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="Brak darowizn dla wybranych filtrów." />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>Data</TH>
                <TH>Darczyńca</TH>
                <TH>Fundusz</TH>
                <TH align="right">Kwota</TH>
                <TH>Metoda</TH>
                <TH>Status</TH>
                <TH align="right"><span className="sr-only">Akcje</span></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map(d => (
                <TR key={d.id}>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(d.donation_date)}</TD>
                  <TD>
                    <div className="font-medium text-gray-900 dark:text-white">{donorLabel(d, membersById)}</div>
                    {d.member_id && <span className="text-xs text-gray-400 dark:text-gray-500">członek</span>}
                  </TD>
                  <TD muted>
                    {d.fund_id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: fundsById[d.fund_id]?.color || '#94a3b8' }} />
                        {fundsById[d.fund_id]?.name || ''}
                      </span>
                    ) : null}
                  </TD>
                  <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(d.amount, d.currency)}</TD>
                  <TD muted>{methodLabel(d.method)}</TD>
                  <TD>
                    <StatusPill color={d.status === 'completed' ? STATUS_COLORS.success : d.status === 'pending' ? STATUS_COLORS.warning : STATUS_COLORS.danger}>
                      {statusLabel(d.status)}
                    </StatusPill>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(d)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                      <button onClick={() => remove(d)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edytuj darowiznę' : 'Nowa darowizna'}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Anuluj</Button>
          <Button onClick={save} loading={saving}>Zapisz</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <CustomSelect label="Darczyńca (członek)" value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} options={memberOptions} placeholder="Wybierz członka..." />

              {!form.member_id && (
                <div className="grid grid-cols-1 gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                  <input value={form.donor_name} onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} placeholder="Imię i nazwisko darczyńcy (spoza bazy)" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.donor_email} onChange={e => setForm(f => ({ ...f, donor_email: e.target.value }))} placeholder="E-mail" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                    <input value={form.donor_address} onChange={e => setForm(f => ({ ...f, donor_address: e.target.value }))} placeholder="Adres (do PIT)" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Kwota (PLN)</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
                  <DateInput value={form.donation_date} onChange={e => setForm(f => ({ ...f, donation_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <CustomSelect label="Fundusz / cel" value={form.fund_id} onChange={v => setForm(f => ({ ...f, fund_id: v }))} options={fundOptionsForm} />

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect label="Metoda" value={form.method} onChange={v => setForm(f => ({ ...f, method: v }))} options={GIVING_METHODS} />
                <CustomSelect label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={GIVING_STATUSES} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nr pokwitowania (opcjonalnie)</label>
                <input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatka</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))} className="rounded accent-emerald-500" />
                Darowizna anonimowa
              </label>
            </div>
      </Modal>
    </div>
  );
}
