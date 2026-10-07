import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Search, CalendarOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { memberName, formatDate, todayIso, isUpcoming } from '../lib/serveApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD } from '../../../components/ui/DataTable';
import { DateInput } from '../../../components/pickers';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

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
    { value: '', label: tr('— wybierz wolontariusza —') },
    ...(members || []).map(m => ({ value: m.id, label: memberName(m) })),
  ], [members]);

  const openCreate = () => { setForm(emptyForm); setModalOpen(true); };

  const save = async () => {
    if (!form.member_id) { toast.error(tr('Wskaż wolontariusza.')); return; }
    if (!form.start_date || !form.end_date) { toast.error(tr('Podaj zakres dat (od–do).')); return; }
    if (form.end_date < form.start_date) { toast.error(tr('Data „do" nie może być wcześniejsza niż data „od".')); return; }
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
      toast.error(tr('Nie udało się zapisać niedostępności: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    if (!await confirmDialog(tr('Usunąć tę niedostępność?'))) return;
    try {
      const { error } = await supabase.from('volunteer_blockouts').delete().eq('id', b.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err }));
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
            placeholder={tr('Szukaj wolontariusza lub powodu...')}
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
          <CalendarOff size={16} /> {onlyUpcoming ? tr('Tylko nadchodzące') : tr('Wszystkie')}
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> {tr('Dodaj niedostępność')}
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">{tr('Pozycji:')} <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">{tr('Nadchodzące:')} <b className="text-accent-primary dark:text-accent-primary-light">{upcomingCount}</b></span>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <Spinner center />
        ) : filtered.length === 0 ? (
          <EmptyState icon={CalendarOff} title={onlyUpcoming ? tr('Brak nadchodzących niedostępności.') : tr('Brak zgłoszonych niedostępności.')} />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Wolontariusz')}</TH>
                <TH>{tr('Od')}</TH>
                <TH>{tr('Do')}</TH>
                <TH>{tr('Powód')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map(b => (
                <TR key={b.id}>
                  <TD>
                    <div className="font-medium text-gray-900 dark:text-white">{memberName(membersById[b.member_id])}</div>
                    {isUpcoming(b) && <span className="text-xs text-accent-primary dark:text-accent-primary-light">{tr('nadchodząca')}</span>}
                  </TD>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(b.start_date)}</TD>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(b.end_date)}</TD>
                  <TD muted>{b.reason || null}</TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => remove(b)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
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
        title={tr('Nowa niedostępność')}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <CustomSelect label={tr('Wolontariusz')} value={form.member_id} onChange={v => setForm(f => ({ ...f, member_id: v }))} options={memberOptions} placeholder={tr('Wybierz wolontariusza...')} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Od')}</label>
                  <DateInput value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Do')}</label>
                  <DateInput value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Powód (opcjonalnie)')}</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder={tr('np. urlop, wyjazd, choroba')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
            </div>
      </Modal>
    </div>
  );
}
