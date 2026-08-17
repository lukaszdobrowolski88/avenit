import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, X, Download, Music, ListMusic } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { songLabel, programLabel, formatDate, todayIso, startOfYearIso } from '../lib/serveApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';

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
    if (!form.song_id) { toast.info('Wybierz pieśń.'); return; }
    if (!form.used_date) { toast.error('Podaj datę wykonania.'); return; }
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
      toast.error('Nie udało się zapisać wykonania: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!confirm('Usunąć ten wpis wykonania?')) return;
    try {
      const { error } = await supabase.from('song_usage').delete().eq('id', u.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
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
    { value: '', label: '— wybierz pieśń —' },
    ...(songs || []).map(s => ({ value: s.id, label: s.author ? `${s.title} — ${s.author}` : s.title })),
  ], [songs]);

  const programOptions = useMemo(() => [
    { value: '', label: '— bez programu (wpisz datę) —' },
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
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Od</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Do</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex-1" />
        <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
          <Download size={16} /> CSV
        </button>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Rejestruj wykonanie
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Wykonań łącznie: <b className="text-gray-900 dark:text-white">{totalUses}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Unikalnych pieśni: <b className="text-accent-primary dark:text-accent-primary-light">{report.length}</b></span>
      </div>

      {/* Raport zbiorczy */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Music size={16} className="text-accent-primary dark:text-accent-primary-light" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Raport wykonań ({formatDate(dateFrom)} – {formatDate(dateTo)})</h3>
        </div>
        {loading ? (
          <Spinner center />
        ) : report.length === 0 ? (
          <div className="p-12 text-center">
            <Music size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak wykonań w wybranym zakresie dat.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Pieśń</th>
                  <th className="px-4 py-3 font-semibold">Autor</th>
                  <th className="px-4 py-3 font-semibold">Nr CCLI</th>
                  <th className="px-4 py-3 font-semibold text-right">Liczba wykonań</th>
                </tr>
              </thead>
              <tbody>
                {report.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.author || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.ccli || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold text-accent-primary dark:text-accent-primary-light tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dziennik wykonań */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <ListMusic size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Dziennik wykonań</h3>
        </div>
        {loading ? (
          <Spinner center />
        ) : usages.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">Brak wpisów.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Pieśń</th>
                  <th className="px-4 py-3 font-semibold">Program</th>
                  <th className="px-4 py-3 font-semibold">Nr CCLI</th>
                  <th className="px-4 py-3 font-semibold">Notatka</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {usages.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(u.used_date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.song_id ? songLabel(songsById[u.song_id]) : 'Pieśń spoza katalogu'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.program_id && programsById[u.program_id] ? programLabel(programsById[u.program_id]) : <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.ccli_number || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.note || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => remove(u)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={15} /></button>
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Rejestruj wykonanie pieśni</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <CustomSelect label="Pieśń" value={form.song_id} onChange={v => setForm(f => ({ ...f, song_id: v }))} options={songOptions} placeholder="Wybierz pieśń..." />

              <CustomSelect label="Program (opcjonalnie)" value={form.program_id} onChange={onProgramChange} options={programOptions} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data wykonania</label>
                  <input type="date" value={form.used_date} onChange={e => setForm(f => ({ ...f, used_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nr CCLI (opcjonalnie)</label>
                  <input value={form.ccli_number} onChange={e => setForm(f => ({ ...f, ccli_number: e.target.value }))} placeholder="np. 1234567" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatka (opcjonalnie)</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
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
