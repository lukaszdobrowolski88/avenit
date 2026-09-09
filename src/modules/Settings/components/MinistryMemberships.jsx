import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { Plus, Trash2, Shield, UserRound } from 'lucide-react';

// Faza 1: przypisywanie osób do SŁUŻB. Jeden wiersz = osoba w danej służbie jako
// lider albo członek, na konkretnym kampusie albo globalnie (kampus pusty = wszystkie).
// Zapis idzie do ministry_memberships → backend wyprowadza z tego granty per-osoba.
export default function MinistryMemberships() {
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [userQ, setUserQ] = useState('');
  const [rows, setRows] = useState([]);
  const [addForm, setAddForm] = useState({ ministry_key: '', role: 'member', campus_id: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [u, m, c] = await Promise.all([
        supabase.from('app_users').select('id, email, full_name, name, role').order('created_at'),
        supabase.from('app_modules').select('key, label, is_enabled').order('display_order'),
        supabase.from('campuses').select('id, name').order('sort_order'),
      ]);
      setUsers(u.data || []);
      setModules((m.data || []).filter((x) => x.is_enabled !== false));
      setCampuses(c.data || []);
    })().catch((e) => setErr(e.message));
  }, []);

  const loadRows = async (userId) => {
    if (!userId) { setRows([]); return; }
    const { data } = await supabase.from('ministry_memberships').select('*').eq('user_id', userId);
    setRows((data || []).sort((a, b) => (a.ministry_key || '').localeCompare(b.ministry_key || '')));
  };
  useEffect(() => { loadRows(selectedUser).catch((e) => setErr(e.message)); }, [selectedUser]);

  const moduleLabel = (key) => modules.find((m) => m.key === key)?.label || key;
  const campusLabel = (id) => (id ? (campuses.find((c) => c.id === id)?.name || `#${id}`) : tr('Wszystkie kampusy'));

  const add = async () => {
    setErr('');
    if (!selectedUser || !addForm.ministry_key) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('ministry_memberships').insert({
        user_id: selectedUser,
        ministry_key: addForm.ministry_key,
        role: addForm.role,
        campus_id: addForm.campus_id ? Number(addForm.campus_id) : null,
      });
      if (error) throw error;
      setAddForm({ ministry_key: '', role: 'member', campus_id: '' });
      await loadRows(selectedUser);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const patchRow = async (id, patch) => {
    setErr('');
    try {
      const { error } = await supabase.from('ministry_memberships').update(patch).eq('id', id);
      if (error) throw error;
      await loadRows(selectedUser);
    } catch (e) { setErr(e.message); }
  };
  const removeRow = async (id) => {
    setErr('');
    try {
      const { error } = await supabase.from('ministry_memberships').delete().eq('id', id);
      if (error) throw error;
      await loadRows(selectedUser);
    } catch (e) { setErr(e.message); }
  };

  const selInput = 'px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm';
  const userName = (u) => u.full_name || u.name || u.email;

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {tr('Przypisz osobę do służb. Lider prowadzi służbę (pełny zakres), członek współpracuje. Kampus określa zasięg; „Wszystkie kampusy” = globalnie.')}
      </p>

      <label className="block text-sm text-gray-500 mb-1">{tr('Osoba')}</label>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder={tr('Szukaj osoby…')} className={`${selInput} min-w-[180px]`} />
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className={`${selInput} min-w-[240px]`}>
          <option value="">{tr('— Wybierz osobę —')}</option>
          {users.filter((u) => { const s = userQ.trim().toLowerCase(); return !s || (userName(u) || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s); })
            .map((u) => <option key={u.id} value={u.id}>{userName(u)} ({u.role})</option>)}
        </select>
      </div>

      {err && <div className="text-rose-500 text-sm mb-2">{err}</div>}

      {selectedUser && (
        <>
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden mb-4">
            <div className="grid grid-cols-[1fr_140px_180px_44px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
              <span>{tr('Służba')}</span><span>{tr('Rola')}</span><span>{tr('Kampus')}</span><span></span>
            </div>
            {rows.length === 0 && <div className="px-3 py-4 text-sm text-gray-400">{tr('Brak przypisań. Dodaj poniżej.')}</div>}
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_140px_180px_44px] gap-2 px-3 py-2 items-center border-t border-gray-50 dark:border-gray-800">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                  {r.role === 'leader' ? <Shield size={14} className="text-accent-primary" /> : <UserRound size={14} className="text-gray-400" />}
                  {moduleLabel(r.ministry_key)}
                </span>
                <select value={r.role} onChange={(e) => patchRow(r.id, { role: e.target.value })} className={selInput}>
                  <option value="member">{tr('Członek')}</option>
                  <option value="leader">{tr('Lider')}</option>
                </select>
                <select value={r.campus_id ?? ''} onChange={(e) => patchRow(r.id, { campus_id: e.target.value ? Number(e.target.value) : null })} className={selInput}>
                  <option value="">{tr('Wszystkie kampusy')}</option>
                  {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => removeRow(r.id)} className="text-gray-300 hover:text-rose-500 justify-self-center" title={tr('Usuń')}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{tr('Służba')}</label>
              <select value={addForm.ministry_key} onChange={(e) => setAddForm({ ...addForm, ministry_key: e.target.value })} className={`${selInput} min-w-[200px]`}>
                <option value="">{tr('— wybierz —')}</option>
                {modules.filter((m) => !rows.some((r) => r.ministry_key === m.key && (r.campus_id ?? '') === (addForm.campus_id ? Number(addForm.campus_id) : ''))).map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{tr('Rola')}</label>
              <select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} className={selInput}>
                <option value="member">{tr('Członek')}</option>
                <option value="leader">{tr('Lider')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{tr('Kampus')}</label>
              <select value={addForm.campus_id} onChange={(e) => setAddForm({ ...addForm, campus_id: e.target.value })} className={selInput}>
                <option value="">{tr('Wszystkie kampusy')}</option>
                {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={add} disabled={busy || !addForm.ministry_key}
              className="px-3 py-2 rounded-lg bg-accent-primary text-white text-sm inline-flex items-center gap-1 disabled:opacity-50">
              <Plus size={14} /> {tr('Dodaj')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
