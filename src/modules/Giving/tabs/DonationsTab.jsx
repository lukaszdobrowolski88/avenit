import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Receipt, Filter, Download } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { formatMoney, formatDate, methodLabel, statusLabel, donorLabel, memberName, GIVING_METHODS, GIVING_STATUSES, donationTotals, localDateStr } from '../lib/givingApi';
import MemberPicker, { foldText } from '../components/MemberPicker';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

const currentYear = new Date().getFullYear();

// Data liczona przy otwarciu formularza i w czasie lokalnym — wpłata wpisana 1 stycznia nocą
// nie trafia już do poprzedniego roku PIT.
const emptyForm = () => ({
  member_id: '', donor_name: '', donor_email: '', donor_address: '',
  fund_id: '', amount: '', donation_date: localDateStr(),
  method: 'transfer', status: 'completed', note: '', is_anonymous: false, receipt_number: '',
});

const STATUS_PILL = { completed: STATUS_COLORS.success, pending: STATUS_COLORS.warning, failed: STATUS_COLORS.danger, refunded: STATUS_COLORS.neutral };

export default function DonationsTab({ funds, members, membersById, campusIdForInsert, withCampusFilter, refreshShared }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [fundFilter, setFundFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
    } catch (err) {
      console.error('Load donations error:', err);
      setDonations([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, yearFilter, fundFilter, methodFilter]);

  useEffect(() => { load(); }, [load]);

  const fundsById = useMemo(() => {
    const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m;
  }, [funds]);

  const filtered = useMemo(() => {
    const s = foldText(search.trim());
    const byStatus = statusFilter ? donations.filter((d) => d.status === statusFilter) : donations;
    if (!s) return byStatus;
    return byStatus.filter(d => {
      const name = foldText(donorLabel(d, membersById));
      return name.includes(s) || foldText(d.note).includes(s) || foldText(d.receipt_number).includes(s);
    });
  }, [donations, search, membersById, statusFilter]);

  // „Suma” = tylko zaksięgowane (jak Pulpit i Darczyńcy); oczekujące osobno.
  const totals = useMemo(() => donationTotals(filtered), [filtered]);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y >= currentYear - 6; y--) years.push({ value: y, label: String(y) });
    return years;
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({
      member_id: d.member_id || '', donor_name: d.donor_name || '', donor_email: d.donor_email || '',
      donor_address: d.donor_address || '', fund_id: d.fund_id || '', amount: String(d.amount ?? ''),
      donation_date: d.donation_date || localDateStr(), method: d.method || 'transfer',
      status: d.status || 'completed', note: d.note || '', is_anonymous: !!d.is_anonymous, receipt_number: d.receipt_number || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error(tr('Podaj kwotę darowizny.')); return; }
    if (!form.member_id && !form.donor_name && !form.is_anonymous) {
      toast.error(tr('Wskaż członka lub podaj imię i nazwisko darczyńcy (albo zaznacz „Anonimowo").')); return;
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
      toast.success(editing ? tr('Zapisano zmiany darowizny') : tr('Dodano darowiznę {amount}', { amount: formatMoney(payload.amount) }));
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save donation error:', err);
      toast.error(tr('Nie udało się zapisać darowizny: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!await confirmDialog(tr('Usunąć darowiznę {amount} ({name}, {date})? Zniknie też z zestawień PIT.', { amount: formatMoney(d.amount, d.currency), name: d.is_anonymous ? tr('Anonimowo') : donorLabel(d, membersById), date: formatDate(d.donation_date) }))) return;
    try {
      const { error } = await supabase.from('donations').delete().eq('id', d.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err }));
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

  // Podpowiedź przy wpisywaniu osoby spoza bazy: „to chyba nasz członek” (unikamy duplikatów w PIT).
  const similarMember = useMemo(() => {
    const n = foldText(form.donor_name).trim();
    if (form.member_id || n.length < 3) return null;
    return (members || []).find((m) => foldText(memberName(m)) === n)
      || (members || []).find((m) => foldText(m.last_name).length > 2 && n.includes(foldText(m.last_name)) && n.includes(foldText(m.first_name))) || null;
  }, [form.donor_name, form.member_id, members]);

  const fundOptionsAll = useMemo(() => [
    { value: '', label: tr('Wszystkie fundusze') },
    ...(funds || []).map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  const fundOptionsForm = useMemo(() => [
    { value: '', label: tr('— bez funduszu —') },
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
            placeholder={tr('Szukaj darczyńcy, notatki, nr pokwitowania...')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-32"><CustomSelect value={yearFilter} onChange={setYearFilter} options={yearOptions} compact /></div>
        <div className="w-44"><CustomSelect value={fundFilter} onChange={setFundFilter} options={fundOptionsAll} compact icon={Filter} /></div>
        <div className="w-44"><CustomSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: tr('Wszystkie statusy') }, ...GIVING_STATUSES.map((o) => ({ ...o, label: tr(o.label) }))]} compact /></div>
        <button onClick={exportCsv} aria-label={tr('Eksport CSV')} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
          <Download size={16} /> CSV
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> {tr('Dodaj darowiznę')}
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-600 dark:text-gray-300">{tr('Liczba darowizn:')} <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-600 dark:text-gray-300">{tr('Zaksięgowano:')} <b className="text-gray-900 dark:text-white tabular-nums">{formatMoney(totals.completed)}</b></span>
        {totals.pendingCount > 0 && (
          <span className="text-gray-600 dark:text-gray-300">{tr('+ {amount} oczekuje na wpłatę ({n})', { amount: formatMoney(totals.pending), n: totals.pendingCount })}</span>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <Spinner center />
        ) : loadError ? (
          <EmptyState icon={Receipt} title={tr('Nie udało się wczytać darowizn.')} action={<Button variant="secondary" onClick={load}>{tr('Spróbuj ponownie')}</Button>} />
        ) : filtered.length === 0 ? (
          (search || statusFilter || fundFilter || methodFilter) ? (
            <EmptyState icon={Receipt} title={tr('Brak darowizn pasujących do filtrów.')} action={<Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter(''); setFundFilter(''); setMethodFilter(''); }}>{tr('Wyczyść filtry')}</Button>} />
          ) : (
            <EmptyState icon={Receipt} title={tr('Brak darowizn w roku {year}.', { year: yearFilter })} action={<Button onClick={openCreate}><Plus size={16} /> {tr('Dodaj darowiznę')}</Button>} />
          )
        ) : (
          <>
          {/* Telefon: kwota i status zawsze widoczne (tabela przewijała się poza ekran). */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700/60">
            {filtered.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.is_anonymous ? tr('Anonimowo') : donorLabel(d, membersById)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{formatDate(d.donation_date)} · {tr(methodLabel(d.method))}{d.fund_id && fundsById[d.fund_id] ? ` · ${fundsById[d.fund_id].name}` : ''}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatMoney(d.amount, d.currency)}</div>
                  <StatusPill color={STATUS_PILL[d.status] || STATUS_COLORS.neutral}>{tr(statusLabel(d.status))}</StatusPill>
                </div>
                <button onClick={() => openEdit(d)} className="p-2 rounded-lg text-gray-500 dark:text-gray-400" aria-label={tr('Edytuj darowiznę')}><Edit2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="hidden sm:block">
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Data')}</TH>
                <TH>{tr('Darczyńca')}</TH>
                <TH>{tr('Fundusz')}</TH>
                <TH align="right">{tr('Kwota')}</TH>
                <TH>{tr('Metoda')}</TH>
                <TH>{tr('Status')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map(d => (
                <TR key={d.id}>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(d.donation_date)}</TD>
                  <TD>
                    <div className="font-medium text-gray-900 dark:text-white">{d.is_anonymous ? tr('Anonimowo') : donorLabel(d, membersById)}</div>
                    {d.member_id && <span className="text-xs text-gray-400 dark:text-gray-500">{tr('członek')}</span>}
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
                  <TD muted>{tr(methodLabel(d.method))}</TD>
                  <TD>
                    <StatusPill color={STATUS_PILL[d.status] || STATUS_COLORS.neutral}>
                      {tr(statusLabel(d.status))}
                    </StatusPill>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(d)} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700" title={tr('Edytuj')} aria-label={tr('Edytuj darowiznę')}><Edit2 size={15} /></button>
                      <button onClick={() => remove(d)} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" title={tr('Usuń')} aria-label={tr('Usuń darowiznę')}><Trash2 size={15} /></button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
          </div>
          </>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? tr('Edytuj darowiznę') : tr('Nowa darowizna')}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{editing ? tr('Zapisz zmiany') : tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <MemberPicker label={tr('Darczyńca (członek)')} value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} members={members} />

              {!form.member_id && (
                <div className="grid grid-cols-1 gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                  <input value={form.donor_name} onChange={e => setForm(f => ({ ...f, donor_name: e.target.value }))} placeholder={tr('Imię i nazwisko darczyńcy (spoza bazy)')} aria-label={tr('Imię i nazwisko darczyńcy (spoza bazy)')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                  {similarMember && (
                    <div className="text-xs text-gray-700 dark:text-gray-200 flex flex-wrap items-center gap-2">
                      <span>{tr('W bazie jest osoba „{name}”.', { name: memberName(similarMember) })}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, member_id: similarMember.id, donor_name: '' }))} className="font-semibold underline underline-offset-2">{tr('Wybierz ją')}</button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={form.donor_email} onChange={e => setForm(f => ({ ...f, donor_email: e.target.value }))} placeholder={tr('E-mail')} aria-label={tr('E-mail')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                    <input value={form.donor_address} onChange={e => setForm(f => ({ ...f, donor_address: e.target.value }))} placeholder={tr('Adres (do PIT)')} aria-label={tr('Adres (do PIT)')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Kwota (zł)')}</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Data')}</label>
                  <DateInput value={form.donation_date} onChange={e => setForm(f => ({ ...f, donation_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <CustomSelect label={tr('Fundusz / cel')} value={form.fund_id} onChange={v => setForm(f => ({ ...f, fund_id: v }))} options={fundOptionsForm} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CustomSelect label={tr('Metoda')} value={form.method} onChange={v => setForm(f => ({ ...f, method: v }))} options={GIVING_METHODS.map((o) => ({ ...o, label: tr(o.label) }))} />
                <CustomSelect label={tr('Status')} value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={GIVING_STATUSES.map((o) => ({ ...o, label: tr(o.label) }))} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Nr pokwitowania (opcjonalnie)')}</label>
                <input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatka')}</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))} className="rounded accent-emerald-500" />
                {tr('Darowizna anonimowa')}
              </label>
            </div>
      </Modal>
    </div>
  );
}
