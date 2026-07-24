import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { capabilityGroups } from '@avenit/shared/src/permissions/catalog.js';
import { ROLE_PRESETS, BUILTIN_ROLES } from '@avenit/shared/src/permissions/presets.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { ChevronDown, ChevronRight, Shield, Plus, Trash2, Users, Sliders } from 'lucide-react';

const KIND_STYLE = {
  module: 'font-semibold text-gray-800 dark:text-gray-100',
  tab: 'text-indigo-600 dark:text-indigo-300',
  crud: 'text-gray-600 dark:text-gray-300',
  action: 'text-amber-600 dark:text-amber-300',
  field: 'text-rose-600 dark:text-rose-300',
};

export default function PermissionsAdmin() {
  const [view, setView] = useState('matrix'); // matrix | roles | users
  const [roles, setRoles] = useState([]);
  const [grants, setGrants] = useState([]); // wszystkie granty (rola + user)
  const [users, setUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const groups = useMemo(() => capabilityGroups(), []);

  const load = async () => {
    const [r, g, u] = await Promise.all([
      supabase.from('app_roles').select('*').order('display_order'),
      supabase.from('permission_grants').select('*'),
      supabase.from('app_users').select('id, email, full_name, name, role').order('created_at'),
    ]);
    const rolesData = r.data || [];
    setRoles(rolesData);
    setGrants(g.data || []);
    setUsers(u.data || []);
    if (!selectedRole && rolesData.length) setSelectedRole(rolesData.find((x) => !x.is_admin)?.key || rolesData[0].key);
  };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2000); };
  const toggleModule = (k) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Granty roli / usera → resolver do pokazania efektywnej wartości.
  const roleGrants = (roleKey) => grants.filter((x) => x.role === roleKey && !x.user_id);
  const userGrants = (userId) => grants.filter((x) => x.user_id === userId && !x.role);

  // Ustaw jawny grant (exact) dla roli lub usera.
  const setGrant = async ({ role = null, userId = null, capability, allowed }) => {
    setErr('');
    try {
      const existing = grants.find((x) => x.capability === capability && (role ? x.role === role && !x.user_id : x.user_id === userId && !x.role));
      if (existing) {
        await supabase.from('permission_grants').update({ allowed }).eq('id', existing.id);
      } else {
        await supabase.from('permission_grants').insert({ role, user_id: userId, capability, allowed });
      }
      await load();
    } catch (e) { setErr(e.message); }
  };
  const clearGrant = async (grantRow) => {
    setErr('');
    try { await supabase.from('permission_grants').delete().eq('id', grantRow.id); await load(); }
    catch (e) { setErr(e.message); }
  };

  // ── Macierz roli ──
  const RoleMatrix = () => {
    const role = roles.find((r) => r.key === selectedRole);
    if (!role) return null;
    const resolver = makeResolver(roleGrants(role.key), { role: role.key, isAdmin: role.is_admin });
    return (
      <div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {roles.map((r) => (
            <button key={r.key} onClick={() => setSelectedRole(r.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${selectedRole === r.key ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {r.label}{r.is_admin && ' ★'}
            </button>
          ))}
        </div>
        {role.is_admin ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            {tr('Ta rola ma pełny, nieograniczony dostęp (administrator).')}
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((grp) => {
              const open = expanded.has(grp.key);
              return (
                <div key={grp.key} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button onClick={() => toggleModule(grp.key)} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-left">
                    <span className="font-semibold text-gray-800 dark:text-white">{tr(grp.label)}</span>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {open && (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {grp.rows.map((rowItem) => {
                        const val = resolver.can(rowItem.cap);
                        return (
                          <label key={rowItem.cap} className="flex items-center justify-between px-4 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <span className={`text-sm ${KIND_STYLE[rowItem.kind] || ''}`}>{tr(rowItem.label)}</span>
                            <input type="checkbox" checked={val} onChange={(e) => setGrant({ role: role.key, capability: rowItem.cap, allowed: e.target.checked })} />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Zarządzanie rolami ──
  const [showNewRole, setShowNewRole] = useState(false);
  const RolesManager = () => (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="font-semibold">{tr('Role')}</h3>
        <button onClick={() => setShowNewRole(true)} className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm inline-flex items-center gap-1"><Plus size={14} /> {tr('Nowa rola')}</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700"><th className="py-2">{tr('Rola')}</th><th>{tr('Opis')}</th><th>{tr('Systemowa')}</th><th></th></tr></thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.key} className="border-b border-gray-50 dark:border-gray-800">
              <td className="py-2 font-medium">{r.label}{r.is_admin && ' ★'}</td>
              <td className="text-gray-500">{r.description}</td>
              <td>{r.is_system ? '✓' : '—'}</td>
              <td className="text-right">
                {!r.is_system && (
                  <button className="text-rose-500" onClick={async () => {
                    if (!window.confirm(tr('Usunąć rolę?') + ` ${r.label}`)) return;
                    try { await supabase.from('app_roles').delete().eq('key', r.key); await load(); flash(tr('Usunięto')); } catch (e) { setErr(e.message); }
                  }}><Trash2 size={15} /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNewRole && <NewRole onClose={() => setShowNewRole(false)} onCreated={async () => { setShowNewRole(false); await load(); flash(tr('Rola utworzona')); }} roles={roles} />}
    </div>
  );

  // ── Nadpisania per-użytkownik ──
  const UserOverrides = () => {
    const user = users.find((u) => u.id === selectedUser);
    const uGrants = user ? userGrants(user.id) : [];
    const role = user ? roles.find((r) => r.key === user.role) : null;
    const roleRes = role ? makeResolver(roleGrants(role.key), { role: role.key, isAdmin: role.is_admin }) : null;
    return (
      <div>
        <label className="block text-sm text-gray-500 mb-1">{tr('Użytkownik')}</label>
        <select value={selectedUser || ''} onChange={(e) => setSelectedUser(e.target.value || null)} className="mb-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
          <option value="">{tr('— Wybierz osobę —')}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.name || u.email} ({u.role})</option>)}
        </select>
        {user && (
          <>
            <p className="text-xs text-gray-500 mb-2">{tr('Domyślnie użytkownik dziedziczy uprawnienia ze swojej roli. Zaznacz, aby nadpisać.')} {uGrants.length > 0 && <button className="text-rose-500 underline ml-2" onClick={async () => { for (const g of uGrants) await supabase.from('permission_grants').delete().eq('id', g.id); await load(); }}>{tr('Wyczyść nadpisania')}</button>}</p>
            <div className="space-y-2">
              {groups.map((grp) => {
                const open = expanded.has('u-' + grp.key);
                return (
                  <div key={grp.key} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button onClick={() => setExpanded((p) => { const n = new Set(p); const k = 'u-' + grp.key; n.has(k) ? n.delete(k) : n.add(k); return n; })} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-left">
                      <span className="font-semibold text-gray-800 dark:text-white">{tr(grp.label)}</span>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {open && (
                      <div className="divide-y divide-gray-50 dark:divide-gray-800">
                        {grp.rows.map((rowItem) => {
                          const override = uGrants.find((g) => g.capability === rowItem.cap);
                          const roleVal = roleRes ? roleRes.can(rowItem.cap) : false;
                          const eff = override ? override.allowed : roleVal;
                          return (
                            <div key={rowItem.cap} className="flex items-center justify-between px-4 py-1.5">
                              <span className={`text-sm ${KIND_STYLE[rowItem.kind] || ''}`}>{tr(rowItem.label)}<span className="text-[10px] text-gray-400 ml-2">{tr('rola')}: {roleVal ? '✓' : '—'}</span></span>
                              <div className="row" style={{ gap: 6 }}>
                                <input type="checkbox" checked={eff} onChange={(e) => setGrant({ userId: user.id, capability: rowItem.cap, allowed: e.target.checked })} />
                                {override && <button className="text-[10px] text-gray-400 underline" onClick={() => clearGrant(override)}>{tr('reset')}</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        {[['matrix', tr('Macierz ról'), Sliders], ['roles', tr('Role'), Shield], ['users', tr('Użytkownicy'), Users]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition ${view === k ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {msg && <div className="text-green-600 text-sm mb-2">{msg}</div>}
      {err && <div className="err mb-2">{err}</div>}
      {view === 'matrix' && <RoleMatrix />}
      {view === 'roles' && <RolesManager />}
      {view === 'users' && <UserOverrides />}
    </div>
  );
}

function NewRole({ onClose, onCreated, roles }) {
  const [f, setF] = useState({ label: '', key: '', description: '', preset: 'czlonek' });
  const [err, setErr] = useState('');
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const create = async () => {
    setErr('');
    const key = f.key || slug(f.label);
    if (!key || !/^[a-z][a-z0-9_]{1,40}$/.test(key)) { setErr(tr('Nieprawidłowy klucz roli')); return; }
    if (roles.some((r) => r.key === key)) { setErr(tr('Rola z takim kluczem już istnieje')); return; }
    try {
      const maxOrder = Math.max(0, ...roles.map((r) => r.display_order || 0));
      await supabase.from('app_roles').insert({ key, label: f.label, description: f.description || null, is_system: false, is_admin: false, display_order: maxOrder + 1 });
      // Seed grantów z presetu (kopiuje z wybranej roli wbudowanej).
      const preset = ROLE_PRESETS[f.preset] || [];
      if (preset.length) {
        await supabase.from('permission_grants').insert(preset.map((g) => ({ role: key, user_id: null, capability: g.capability, allowed: g.allowed })));
      }
      onCreated();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{tr('Nowa rola')}</h3>
        <label className="block text-sm text-gray-500 mb-1">{tr('Nazwa')}</label>
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value, key: f.key || slug(e.target.value) })} placeholder="Skarbnik" className="w-full mb-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
        <label className="block text-sm text-gray-500 mb-1">{tr('Klucz (identyfikator)')}</label>
        <input value={f.key} onChange={(e) => setF({ ...f, key: slug(e.target.value) })} placeholder="skarbnik" className="w-full mb-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-mono" />
        <label className="block text-sm text-gray-500 mb-1">{tr('Preset startowy (kopiuje uprawnienia)')}</label>
        <select value={f.preset} onChange={(e) => setF({ ...f, preset: e.target.value })} className="w-full mb-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
          {BUILTIN_ROLES.filter((r) => !r.is_admin).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {err && <div className="err mb-2">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="ghost" onClick={onClose}>{tr('Anuluj')}</button>
          <button onClick={create} disabled={!f.label}>{tr('Utwórz')}</button>
        </div>
      </div>
    </div>
  );
}
