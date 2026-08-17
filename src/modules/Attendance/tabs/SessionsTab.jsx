import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, ClipboardList, Filter, ChevronRight, ArrowLeft, Users, UserPlus, Check } from 'lucide-react';
import { supabase, getCachedUser } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import Modal from '../../../components/Modal';
import { SESSION_TYPES, sessionTypeLabel, sessionTypeColor, sessionAttendance, memberName, formatDate } from '../lib/attendanceApi';
import { toast } from '../../../lib/toast';

const emptyForm = {
  title: '',
  session_date: new Date().toISOString().slice(0, 10),
  session_type: 'service',
  headcount: '',
  note: '',
};

export default function SessionsTab({ members, membersById, campusIdForInsert, withCampusFilter }) {
  const [sessions, setSessions] = useState([]);
  const [presentCounts, setPresentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // aktywna sesja w widoku obecności

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('attendance_sessions').select('*').order('session_date', { ascending: false });
      q = withCampusFilter(q);
      if (typeFilter) q = q.eq('session_type', typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      const list = data || [];
      setSessions(list);

      // Liczba odznaczonych obecnych na sesję (jednym zapytaniem)
      const ids = list.map(s => s.id);
      const counts = {};
      if (ids.length) {
        const { data: recs } = await supabase
          .from('attendance_records')
          .select('session_id')
          .in('session_id', ids)
          .eq('present', true);
        (recs || []).forEach(r => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
      }
      setPresentCounts(counts);
    } catch (err) {
      console.error('Load attendance sessions error:', err);
      setSessions([]);
      setPresentCounts({});
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return sessions;
    return sessions.filter(x =>
      (x.title || '').toLowerCase().includes(s) ||
      (x.note || '').toLowerCase().includes(s) ||
      sessionTypeLabel(x.session_type).toLowerCase().includes(s)
    );
  }, [sessions, search]);

  const totalAttendance = useMemo(
    () => filtered.reduce((sum, s) => sum + sessionAttendance(s, presentCounts[s.id]), 0),
    [filtered, presentCounts]
  );

  const typeOptionsAll = useMemo(() => [
    { value: '', label: 'Wszystkie typy' },
    ...SESSION_TYPES.map(t => ({ value: t.value, label: t.label })),
  ], []);

  const typeOptionsForm = useMemo(() => SESSION_TYPES.map(t => ({ value: t.value, label: t.label })), []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      title: s.title || '',
      session_date: s.session_date || new Date().toISOString().slice(0, 10),
      session_type: s.session_type || 'service',
      headcount: s.headcount == null ? '' : String(s.headcount),
      note: s.note || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.session_date) { toast.error('Podaj datę sesji.'); return; }
    setSaving(true);
    try {
      const user = await getCachedUser();
      const payload = {
        title: form.title || null,
        session_date: form.session_date,
        session_type: form.session_type,
        headcount: form.headcount === '' ? null : Number(form.headcount),
        note: form.note || null,
      };
      if (editing) {
        const { error } = await supabase.from('attendance_sessions').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        payload.created_by = user?.email || null;
        const { error } = await supabase.from('attendance_sessions').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('Save attendance session error:', err);
      toast.error('Nie udało się zapisać sesji: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!confirm('Usunąć tę sesję wraz z listą obecności?')) return;
    try {
      const { error } = await supabase.from('attendance_sessions').delete().eq('id', s.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  // Aktualizacja licznika obecnych po zmianach w detalu
  const handleDetailChange = (sessionId, count) => {
    setPresentCounts(prev => ({ ...prev, [sessionId]: count }));
  };

  if (detail) {
    return (
      <SessionDetail
        session={detail}
        members={members}
        membersById={membersById}
        onBack={() => setDetail(null)}
        onCountChange={handleDetailChange}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj sesji, typu, notatki..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
          />
        </div>
        <div className="w-48"><CustomSelect value={typeFilter} onChange={setTypeFilter} options={typeOptionsAll} compact icon={Filter} /></div>
        <button data-tour="att-add-session" onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Dodaj sesję
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Sesji: <b className="text-gray-900 dark:text-white">{filtered.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Łączna frekwencja: <b className="text-accent-primary dark:text-accent-primary-light">{totalAttendance}</b></span>
      </div>

      {/* Lista */}
      <div data-tour="att-session-list" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak sesji dla wybranych filtrów.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Sesja</th>
                  <th className="px-4 py-3 font-semibold">Typ</th>
                  <th className="px-4 py-3 font-semibold text-right">Frekwencja</th>
                  <th className="px-4 py-3 font-semibold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const count = sessionAttendance(s, presentCounts[s.id]);
                  const usesRecords = (presentCounts[s.id] || 0) > 0;
                  return (
                    <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setDetail(s)}>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(s.session_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{s.title || sessionTypeLabel(s.session_type)}</div>
                        {s.note && <div className="text-xs text-gray-400 truncate max-w-[280px]">{s.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                          <span className="w-2 h-2 rounded-full" style={{ background: sessionTypeColor(s.session_type) }} />
                          {sessionTypeLabel(s.session_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{count}</span>
                        <span className="ml-1 text-xs text-gray-400">{usesRecords ? 'obecnych' : 'szacunkowo'}</span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDetail(s)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700" title="Lista obecności"><ChevronRight size={16} /></button>
                          <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                          <button onClick={() => remove(s)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
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

      {/* Modal dodaj/edytuj */}
      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj sesję' : 'Nowa sesja'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Tytuł (opcjonalnie)</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="np. Nabożeństwo niedzielne" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Data</label>
                  <input data-tour="att-session-date" type="date" value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
                <CustomSelect label="Typ" value={form.session_type} onChange={v => setForm(f => ({ ...f, session_type: v }))} options={typeOptionsForm} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Szybka liczba obecnych (headcount)</label>
                <input type="number" min="0" step="1" value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))} placeholder="np. 120" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                <p className="text-xs text-gray-400 mt-1 ml-1">Użyj tego pola dla szybkiego zliczenia. Imienną listę obecnych odznaczysz w szczegółach sesji.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Notatka</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button data-tour="att-session-save" onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Szczegóły sesji — imienna lista obecności + goście
// ============================================================
function SessionDetail({ session, members, membersById, onBack, onCountChange }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('session_id', session.id);
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Load attendance records error:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const memberRecordByMember = useMemo(() => {
    const m = {};
    records.forEach(r => { if (r.member_id) m[r.member_id] = r; });
    return m;
  }, [records]);

  const guestRecords = useMemo(() => records.filter(r => !r.member_id && r.guest_name), [records]);
  const presentCount = useMemo(() => records.filter(r => r.present).length, [records]);

  useEffect(() => { if (!loading) onCountChange?.(session.id, presentCount); }, [presentCount, loading, session.id, onCountChange]);

  const filteredMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return (members || []).filter(m => memberName(m).toLowerCase().includes(s));
  }, [members, search]);

  const toggleMember = async (member) => {
    setBusyId(member.id);
    try {
      const existing = memberRecordByMember[member.id];
      if (existing) {
        const { error } = await supabase.from('attendance_records').delete().eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('attendance_records').insert({ session_id: session.id, member_id: member.id, present: true });
        if (error) throw error;
      }
      await loadRecords();
    } catch (err) {
      toast.error('Nie udało się zapisać obecności: ' + (err.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    setAddingGuest(true);
    try {
      const { error } = await supabase.from('attendance_records').insert({ session_id: session.id, guest_name: name, present: true });
      if (error) throw error;
      setGuestName('');
      await loadRecords();
    } catch (err) {
      toast.error('Nie udało się dodać gościa: ' + (err.message || err));
    } finally {
      setAddingGuest(false);
    }
  };

  const removeGuest = async (rec) => {
    try {
      const { error } = await supabase.from('attendance_records').delete().eq('id', rec.id);
      if (error) throw error;
      await loadRecords();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Nagłówek detalu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"><ArrowLeft size={18} /></button>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{session.title || sessionTypeLabel(session.session_type)}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: sessionTypeColor(session.session_type) }} />
                {sessionTypeLabel(session.session_type)}
              </span>
              · {formatDate(session.session_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center px-3">
            <div className="text-xl font-bold text-accent-primary dark:text-accent-primary-light tabular-nums">{presentCount}</div>
            <div className="text-xs text-gray-400">obecnych imiennie</div>
          </div>
          <div className="text-center px-3 border-l border-gray-200 dark:border-gray-700">
            <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{session.headcount ?? '—'}</div>
            <div className="text-xs text-gray-400">szybka liczba</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista członków */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-gray-400" />
              <h4 className="font-semibold text-gray-900 dark:text-white">Odznacz obecnych członków</h4>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Szukaj członka..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
              />
            </div>
          </div>
          <div data-tour="att-mark" className="max-h-[420px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-10 text-center text-gray-400">Ładowanie...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Brak członków w bazie dla tego kampusu.</div>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {filteredMembers.map(m => {
                  const present = !!memberRecordByMember[m.id];
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => toggleMember(m)}
                        disabled={busyId === m.id}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-60"
                      >
                        <span className={`text-sm ${present ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{memberName(m)}</span>
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center border ${present ? 'bg-gradient-to-br from-accent-primary to-accent-secondary border-transparent text-white' : 'border-gray-300 dark:border-gray-600 text-transparent'}`}>
                          <Check size={14} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Goście */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 h-fit">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={16} className="text-gray-400" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Goście</h4>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGuest(); }}
              placeholder="Imię i nazwisko gościa"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
            <button onClick={addGuest} disabled={addingGuest || !guestName.trim()} className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md disabled:opacity-60"><Plus size={16} /></button>
          </div>
          {guestRecords.length === 0 ? (
            <p className="text-sm text-gray-400">Brak gości.</p>
          ) : (
            <ul className="space-y-2">
              {guestRecords.map(g => (
                <li key={g.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{g.guest_name}</span>
                  <button onClick={() => removeGuest(g)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
