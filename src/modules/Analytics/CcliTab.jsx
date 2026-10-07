import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, X, Download, Music, ListMusic } from 'lucide-react';
import { supabase, getCachedUser } from '../../lib/supabase';
import CustomSelect from '../../components/CustomSelect';
import Modal from '../../components/Modal';
import { songLabel, programLabel, formatDate, todayIso, startOfYearIso } from '../Serve/lib/serveApi';
import { toast } from '../../lib/toast';
import Spinner from '../../components/Spinner';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';
import { DateInput } from '../../components/pickers';
import { confirmDialog } from '../../lib/dialog';
import { tr } from '../../i18n';

const emptyForm = () => ({
  song_id: '', program_id: '', used_date: todayIso(), ccli_number: '', note: '',
});

export default function CcliTab({ songs, songsById, programs, programsById, campusIdForInsert, withCampusFilter }) {
  const [usages, setUsages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(startOfYearIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('song_usage').select('*').order('used_date', { ascending: false });
      q = withCampusFilter(q);
      if (dateFrom) q = q.gte('used_date', dateFrom);
      if (dateTo) q = q.lte('used_date', dateTo);
      const { data, error } = await q;
      if (error) throw error;
      setUsages(data || []);
    } catch (err) {
      console.error('Load song usage error:', err);
      setUsages([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Raport: zliczanie wykonań per pieśń
  const report = useMemo(() => {
    const map = {};
    usages.forEach(u => {
      const key = u.song_id || '__none';
      if (!map[key]) {
        map[key] = { id: key, count: 0, ccli: '', song: u.song_id ? songsById[u.song_id] : null };
      }
      map[key].count += 1;
      // Zachowaj pierwszy niepusty numer CCLI z wpisów
      if (!map[key].ccli && u.ccli_number) map[key].ccli = u.ccli_number;
    });
    return Object.values(map)
      .map(r => ({
        ...r,
        title: r.id === '__none' ? 'Pieśń spoza katalogu' : songLabel(r.song),
        author: r.song?.author || '',
      }))
      .sort((a, b) => b.count - a.count);
  }, [usages, songsById]);

  const totalUses = usages.length;

  const openCreate = () => { setForm(emptyForm()); setModalOpen(true); };

  const save = async () => {
    if (!form.song_id) { toast.info(tr('Wybierz pieśń.')); return; }
    if (!form.used_date) { toast.error(tr('Podaj datę wykonania.')); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const payload = {
        song_id: form.song_id,
        program_id: form.program_id || null,
        used_date: form.used_date,
        ccli_number: form.ccli_number || null,
        note: form.note || null,
        campus_id: campusIdForInsert,
        created_by: user?.email || null,
      };
      const { error } = await supabase.from('song_usage').insert(payload);
      if (error) throw error;
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save song usage error:', err);
      toast.error(tr('Nie udało się zapisać wykonania: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!await confirmDialog(tr('Usunąć ten wpis wykonania?'))) return;
    try {
      const { error } = await supabase.from('song_usage').delete().eq('id', u.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err }));
    }
  };

  const exportCsv = () => {
    const rows = [['Tytuł', 'Autor', 'Liczba wykonań', 'Nr CCLI']];
    report.forEach(r => {
      rows.push([
        r.title, r.author, String(r.count), r.ccli || '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `raport_ccli_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const songOptions = useMemo(() => [
    { value: '', label: tr('— wybierz pieśń —') },
    ...(songs || []).map(s => ({ value: s.id, label: s.author ? `${s.title} — ${s.author}` : s.title })),
  ], [songs]);

  const programOptions = useMemo(() => [
    { value: '', label: tr('— bez programu (wpisz datę) —') },
    ...(programs || []).map(p => ({ value: p.id, label: programLabel(p) })),
  ], [programs]);

  // Wybór programu podpowiada datę wykonania
  const onProgramChange = (v) => {
    setForm(f => {
      const next = { ...f, program_id: v };
      const p = programsById[v];
      if (p?.date) next.used_date = String(p.date).slice(0, 10);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{tr('Od')}</label>
          <DateInput value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{tr('Do')}</label>
          <DateInput value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex-1" />
        <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
          <Download size={16} /> CSV
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> {tr('Rejestruj wykonanie')}
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">{tr('Wykonań łącznie:')} <b className="text-gray-900 dark:text-white">{totalUses}</b></span>
        <span className="text-gray-500 dark:text-gray-400">{tr('Unikalnych pieśni:')} <b className="text-accent-primary dark:text-accent-primary-light">{report.length}</b></span>
      </div>

      {/* Raport zbiorczy */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Music size={16} className="text-accent-primary dark:text-accent-primary-light" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{tr('Raport wykonań')} ({formatDate(dateFrom)} – {formatDate(dateTo)})</h3>
        </div>
        {loading ? (
          <Spinner center />
        ) : report.length === 0 ? (
          <EmptyState icon={Music} title={tr('Brak wykonań w wybranym zakresie dat.')} />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Pieśń')}</TH>
                <TH>{tr('Autor')}</TH>
                <TH>{tr('Nr CCLI')}</TH>
                <TH align="right">{tr('Liczba wykonań')}</TH>
              </tr>
            </THead>
            <tbody>
              {report.map(r => (
                <TR key={r.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{r.id === '__none' ? tr(r.title) : r.title}</TD>
                  <TD muted>{r.author || null}</TD>
                  <TD muted numeric>{r.ccli || null}</TD>
                  <TD align="right" numeric className="font-semibold text-accent-primary dark:text-accent-primary-light">{r.count}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* Dziennik wykonań */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <ListMusic size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{tr('Dziennik wykonań')}</h3>
        </div>
        {loading ? (
          <Spinner center />
        ) : usages.length === 0 ? (
          <EmptyState compact icon={ListMusic} title={tr('Brak wpisów.')} />
        ) : (
          <DataTable flush>
            <THead>
              <tr>
                <TH>{tr('Data')}</TH>
                <TH>{tr('Pieśń')}</TH>
                <TH>{tr('Program')}</TH>
                <TH>{tr('Nr CCLI')}</TH>
                <TH>{tr('Notatka')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {usages.map(u => (
                <TR key={u.id}>
                  <TD muted numeric className="whitespace-nowrap">{formatDate(u.used_date)}</TD>
                  <TD className="font-medium text-gray-900 dark:text-white">{u.song_id ? songLabel(songsById[u.song_id]) : tr('Pieśń spoza katalogu')}</TD>
                  <TD muted>{u.program_id && programsById[u.program_id] ? programLabel(programsById[u.program_id]) : null}</TD>
                  <TD muted numeric>{u.ccli_number || null}</TD>
                  <TD muted>{u.note || null}</TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      <button onClick={() => remove(u)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={15} /></button>
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
        title={tr('Rejestruj wykonanie pieśni')}
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
            <div className="p-6 space-y-4">
              <CustomSelect label={tr('Pieśń')} value={form.song_id} onChange={v => setForm(f => ({ ...f, song_id: v }))} options={songOptions} placeholder={tr('Wybierz pieśń...')} />

              <CustomSelect label={tr('Program (opcjonalnie)')} value={form.program_id} onChange={onProgramChange} options={programOptions} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Data wykonania')}</label>
                  <DateInput value={form.used_date} onChange={e => setForm(f => ({ ...f, used_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Nr CCLI (opcjonalnie)')}</label>
                  <input value={form.ccli_number} onChange={e => setForm(f => ({ ...f, ccli_number: e.target.value }))} placeholder={tr('np. 1234567')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Notatka (opcjonalnie)')}</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
            </div>
      </Modal>
    </div>
  );
}
