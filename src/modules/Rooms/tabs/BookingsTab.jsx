import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, CalendarClock, Repeat, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import Modal from '../../../components/Modal';
import CustomSelect from '../../../components/CustomSelect';
import { toast } from '../../../lib/toast';
import {
  toLocalInputValue, localInputToIso, formatDateTime, formatTime, formatDuration,
  addWeeks, newUuid, startOfDay,
} from '../lib/roomsApi';

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
}

function makeEmptyForm() {
  const t = defaultTimes();
  return {
    resource_id: '', title: '', start_at: t.start, end_at: t.end,
    booked_by: '', note: '', recurring: false, weeks: 4,
  };
}

export default function BookingsTab({ resources, campusIdForInsert, withCampusFilter, onNavigate }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(makeEmptyForm());
  const [saving, setSaving] = useState(false);
  const [conflictReport, setConflictReport] = useState(null);

  const resourceById = useMemo(() => {
    const m = {}; (resources || []).forEach(r => { m[r.id] = r; }); return m;
  }, [resources]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('resource_bookings').select('*').order('start_at', { ascending: true });
      q = withCampusFilter(q);
      if (resourceFilter) q = q.eq('resource_id', resourceFilter);
      if (!showPast) q = q.gte('start_at', startOfDay(new Date()).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      console.error('Load bookings error:', err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, resourceFilter, showPast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return bookings;
    return bookings.filter(b =>
      (b.title || '').toLowerCase().includes(s) ||
      (b.booked_by || '').toLowerCase().includes(s) ||
      (b.note || '').toLowerCase().includes(s) ||
      (resourceById[b.resource_id]?.name || '').toLowerCase().includes(s)
    );
  }, [bookings, search, resourceById]);

  const resourceFilterOptions = useMemo(() => [
    { value: '', label: 'Wszystkie zasoby' },
    ...(resources || []).map(r => ({ value: r.id, label: r.name })),
  ], [resources]);

  const resourceFormOptions = useMemo(() =>
    (resources || []).filter(r => r.is_active !== false || r.id === form.resource_id)
      .map(r => ({ value: r.id, label: r.name })),
  [resources, form.resource_id]);

  const closeModal = () => { setModalOpen(false); setConflictReport(null); };

  const openCreate = () => {
    setEditing(null);
    const base = makeEmptyForm();
    if (resourceFilter) base.resource_id = resourceFilter;
    setForm(base);
    setConflictReport(null);
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      resource_id: b.resource_id || '', title: b.title || '',
      start_at: toLocalInputValue(b.start_at), end_at: toLocalInputValue(b.end_at),
      booked_by: b.booked_by || '', note: b.note || '', recurring: false, weeks: 4,
    });
    setConflictReport(null);
    setModalOpen(true);
  };

  // Zwraca istniejące rezerwacje kolidujące z danym przedziałem dla zasobu
  const findConflicts = async (resourceId, startIso, endIso, excludeId) => {
    let q = supabase.from('resource_bookings')
      .select('id, title, start_at, end_at, resource_id')
      .eq('resource_id', resourceId)
      .lt('start_at', endIso)   // istniejący.start < nowy koniec
      .gt('end_at', startIso);  // istniejący.koniec > nowy start
    q = withCampusFilter(q);
    if (excludeId) q = q.neq('id', excludeId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  };

  const buildOccurrences = () => {
    const startIso = localInputToIso(form.start_at);
    const endIso = localInputToIso(form.end_at);
    const list = [];
    const count = form.recurring && !editing ? Math.max(1, Math.min(52, Number(form.weeks) || 1)) : 1;
    for (let i = 0; i < count; i++) {
      list.push({
        start_at: addWeeks(new Date(startIso), i).toISOString(),
        end_at: addWeeks(new Date(endIso), i).toISOString(),
      });
    }
    return list;
  };

  // mode: 'auto' (blokuj przy kolizji), 'skip' (pomiń kolidujące), 'force' (zapisz mimo kolizji)
  const doSave = async (mode = 'auto') => {
    if (!form.resource_id) { toast.info('Wybierz zasób.'); return; }
    if (!form.title.trim()) { toast.error('Podaj tytuł rezerwacji.'); return; }
    const startIso = localInputToIso(form.start_at);
    const endIso = localInputToIso(form.end_at);
    if (!startIso || !endIso) { toast.error('Podaj poprawny początek i koniec.'); return; }
    if (new Date(endIso) <= new Date(startIso)) { toast.error('Koniec musi być późniejszy niż początek.'); return; }

    setSaving(true);
    try {
      const occ = buildOccurrences();
      for (const o of occ) {
        o.conflicts = await findConflicts(form.resource_id, o.start_at, o.end_at, editing?.id);
      }
      const conflicting = occ.filter(o => o.conflicts.length > 0);
      const free = occ.filter(o => o.conflicts.length === 0);

      if (mode === 'auto' && conflicting.length > 0) {
        setConflictReport({ occ, conflicting, free });
        setSaving(false);
        return;
      }

      const toInsert = mode === 'skip' ? free : occ;
      if (toInsert.length === 0) {
        toast.success('Wszystkie terminy kolidują z istniejącymi rezerwacjami — nie zapisano nic.');
        setSaving(false);
        return;
      }

      const user = await getCachedUser();
      const bookedBy = form.booked_by.trim() || user?.email || null;

      if (editing) {
        const o = toInsert[0];
        const { error } = await supabase.from('resource_bookings').update({
          resource_id: form.resource_id,
          title: form.title.trim(),
          start_at: o.start_at,
          end_at: o.end_at,
          booked_by: bookedBy,
          note: form.note || null,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const recurrenceGroup = toInsert.length > 1 ? newUuid() : null;
        const rows = toInsert.map(o => ({
          resource_id: form.resource_id,
          title: form.title.trim(),
          start_at: o.start_at,
          end_at: o.end_at,
          booked_by: bookedBy,
          note: form.note || null,
          recurrence_group: recurrenceGroup,
          campus_id: campusIdForInsert,
        }));
        const { error } = await supabase.from('resource_bookings').insert(rows);
        if (error) throw error;
      }

      const skipped = occ.length - toInsert.length;
      closeModal();
      load();
      if (skipped > 0) {
        toast.success(`Zapisano ${toInsert.length} rezerwacji. Pominięto ${skipped} z powodu kolizji.`);
      }
    } catch (err) {
      console.error('Save booking error:', err);
      toast.error('Nie udało się zapisać rezerwacji: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    try {
      if (b.recurrence_group) {
        const whole = confirm('Ta rezerwacja jest częścią serii cyklicznej.\n\nOK = usuń CAŁĄ serię\nAnuluj = usuń tylko tę jedną');
        if (whole) {
          const { error } = await supabase.from('resource_bookings').delete().eq('recurrence_group', b.recurrence_group);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('resource_bookings').delete().eq('id', b.id);
          if (error) throw error;
        }
      } else {
        if (!confirm('Usunąć tę rezerwację?')) return;
        const { error } = await supabase.from('resource_bookings').delete().eq('id', b.id);
        if (error) throw error;
      }
      load();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  const noResources = (resources || []).length === 0;

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj tytułu, zasobu, osoby..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-52"><CustomSelect value={resourceFilter} onChange={setResourceFilter} options={resourceFilterOptions} compact /></div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer px-2">
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="rounded accent-emerald-500" />
          Pokaż też przeszłe
        </label>
        <button data-tour="rooms-booking-new" onClick={openCreate} disabled={noResources} title={noResources ? 'Najpierw dodaj zasób' : ''} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition disabled:opacity-50">
          <Plus size={16} /> Nowa rezerwacja
        </button>
      </div>

      {noResources && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          Brak zasobów. Dodaj salę lub sprzęt w zakładce „Zasoby", aby móc tworzyć rezerwacje.
        </div>
      )}

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarClock size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak rezerwacji dla wybranych filtrów.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Zasób</th>
                  <th className="px-4 py-3 font-semibold">Tytuł</th>
                  <th className="px-4 py-3 font-semibold">Początek</th>
                  <th className="px-4 py-3 font-semibold">Koniec</th>
                  <th className="px-4 py-3 font-semibold">Zarezerwował</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const r = resourceById[b.resource_id];
                  return (
                    <tr key={b.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r?.color || '#94a3b8' }} />
                          {r?.name || <span className="text-gray-400">— usunięty —</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                          {b.title || <span className="text-gray-400">bez tytułu</span>}
                          {b.recurrence_group && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/30 dark:text-accent-primary-light">
                              <Repeat size={10} /> cykl
                            </span>
                          )}
                        </div>
                        {b.note && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{b.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(b.start_at)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatTime(b.end_at)}
                        <span className="block text-xs text-gray-400">{formatDuration(b.start_at, b.end_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{b.booked_by || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(b)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                          <button onClick={() => remove(b)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && closeModal()}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj rezerwację' : 'Nowa rezerwacja'}</h3>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <CustomSelect
                label="Zasób" value={form.resource_id}
                onChange={v => { setForm(f => ({ ...f, resource_id: v })); setConflictReport(null); }}
                options={resourceFormOptions} placeholder="Wybierz salę lub sprzęt..."
              />

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł</label>
                <input data-tour="rooms-booking-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="np. Próba zespołu, Spotkanie grupy" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Początek</label>
                  <input type="datetime-local" value={form.start_at} onChange={e => { setForm(f => ({ ...f, start_at: e.target.value })); setConflictReport(null); }} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Koniec</label>
                  <input type="datetime-local" value={form.end_at} onChange={e => { setForm(f => ({ ...f, end_at: e.target.value })); setConflictReport(null); }} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Zarezerwował (opcjonalnie)</label>
                  <input value={form.booked_by} onChange={e => setForm(f => ({ ...f, booked_by: e.target.value }))} placeholder="Domyślnie: Twój e-mail" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatka</label>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
                </div>
              </div>

              {/* Rezerwacja cykliczna — tylko przy tworzeniu */}
              {!editing && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                    <input type="checkbox" checked={form.recurring} onChange={e => { setForm(f => ({ ...f, recurring: e.target.checked })); setConflictReport(null); }} className="rounded accent-emerald-500" />
                    <Repeat size={15} /> Powtarzaj co tydzień
                  </label>
                  {form.recurring && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pl-6">
                      przez
                      <input type="number" min="1" max="52" value={form.weeks} onChange={e => { setForm(f => ({ ...f, weeks: e.target.value })); setConflictReport(null); }} className="w-20 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                      tygodni (łącznie {Math.max(1, Math.min(52, Number(form.weeks) || 1))} terminów)
                    </div>
                  )}
                </div>
              )}

              {/* Raport kolizji */}
              {conflictReport && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    <AlertTriangle size={16} /> Wykryto kolizje ({conflictReport.conflicting.length} z {conflictReport.occ.length} terminów)
                  </div>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                    {conflictReport.conflicting.map((o, idx) => (
                      <li key={idx} className="text-xs text-red-700 dark:text-red-300">
                        <span className="font-medium">{formatDateTime(o.start_at)} – {formatTime(o.end_at)}</span>
                        <span className="text-red-500 dark:text-red-400"> koliduje z: </span>
                        {o.conflicts.map(c => `${c.title || 'rezerwacja'} (${formatTime(c.start_at)}–${formatTime(c.end_at)})`).join(', ')}
                      </li>
                    ))}
                  </ul>
                  {conflictReport.free.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={14} /> {conflictReport.free.length} termin(ów) bez kolizji.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              {conflictReport ? (
                <>
                  {conflictReport.free.length > 0 && (
                    <button onClick={() => doSave('skip')} disabled={saving} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium disabled:opacity-60">
                      Pomiń kolidujące ({conflictReport.free.length})
                    </button>
                  )}
                  <button onClick={() => doSave('force')} disabled={saving} className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm shadow-md disabled:opacity-60">
                    {saving ? 'Zapisywanie...' : 'Zapisz mimo kolizji'}
                  </button>
                </>
              ) : (
                <button data-tour="rooms-booking-save" onClick={() => doSave('auto')} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60 inline-flex items-center gap-2">
                  {saving ? <><Clock size={15} className="animate-spin" /> Sprawdzam...</> : 'Zapisz'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
