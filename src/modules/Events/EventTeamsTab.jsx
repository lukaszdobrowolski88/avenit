// Zakładka „Służby" na wydarzeniu — przypisania służb (jak sekcje zespołów w programie),
// ale na events. Dla każdego team_type: role z team_roles, osoby z tabeli służby filtrowane
// przez team_member_roles; wybór zapisywany w events.assignments[team_type][field_key] (CSV),
// wysyłka zaproszeń + statusy przez silnik schedule_assignments (event_id, PR2).
import React, { useState, useEffect, useCallback } from 'react';
import { Send, Check, Clock, X as XIcon, Plus, Users, Settings2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { getCachedUser } from '../../lib/supabase';
import { useScheduleAssignments } from '../../hooks/useScheduleAssignments';
import Spinner from '../../components/Spinner';

const TEAM_MEMBER_TABLE = {
  worship: 'worship_team', media: 'media_team', atmosfera: 'atmosfera_members',
  kids: 'kids_teachers', mc: 'custom_mc_members',
};
const memberTableFor = (teamType) => TEAM_MEMBER_TABLE[teamType] || `custom_${teamType}_members`;
const TEAM_LABELS = {
  worship: 'Zespół Uwielbienia', media: 'Media Team', atmosfera: 'Atmosfera Team',
  kids: 'Małe Avenit', mc: 'Scena / MC',
};
// Bazowe (systemowe) służby zawsze dostępne w pickerze; custom moduły dochodzą z app_modules.
const SYSTEM_TEAM_OPTIONS = [
  { value: 'worship', label: 'Zespół Uwielbienia' }, { value: 'media', label: 'Media Team' },
  { value: 'atmosfera', label: 'Atmosfera Team' }, { value: 'kids', label: 'Małe Avenit' },
  { value: 'mc', label: 'Scena / MC' },
];
const teamLabel = (t, moduleLabelMap) => moduleLabelMap?.[t] || TEAM_LABELS[t] || t;
const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export default function EventTeamsTab({ event, teamTypes, defaultTeamTypes, canManage, onSaveAssignments, onSaveTeams, moduleLabelMap }) {
  const { createAssignment, removeEventAssignment, fetchAssignmentsForEvents, getEventAssignmentStatus, sendInvitesForEvent } = useScheduleAssignments();
  const [teams, setTeams] = useState(null); // [{ teamType, roles, members, eligible }]
  const [assign, setAssign] = useState(event.assignments && typeof event.assignments === 'object' ? event.assignments : {});
  const [openRole, setOpenRole] = useState(null); // `${teamType}:${field_key}`
  const [sending, setSending] = useState(null); // teamType w trakcie wysyłki
  const [, force] = useState(0);
  const [teamOptions, setTeamOptions] = useState(SYSTEM_TEAM_OPTIONS);
  const [showPicker, setShowPicker] = useState(false);

  // Opcje pickera: systemowe służby + moduły custom (z app_modules).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('app_modules').select('module_key, label, is_system');
        const custom = (data || []).filter((m) => m?.module_key && m.is_system === false)
          .map((m) => ({ value: m.module_key, label: m.label || m.module_key }));
        const seen = new Set();
        const merged = [...SYSTEM_TEAM_OPTIONS, ...custom].filter((o) => (seen.has(o.value) ? false : seen.add(o.value)));
        if (alive) setTeamOptions(merged);
      } catch { /* zostają systemowe */ }
    })();
    return () => { alive = false; };
  }, []);

  const toggleTeamType = (value) => {
    const cur = new Set(teamTypes);
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    onSaveTeams?.([...cur].join(', '));
  };
  const resetTeams = () => onSaveTeams?.(null); // wróć do domyślnych (reguła typu / moduł)

  // Załaduj role/osoby/przypisania dla każdej służby.
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      for (const tt of teamTypes) {
        const table = memberTableFor(tt);
        const [rolesRes, membersRes, tmrRes] = await Promise.all([
          supabase.from('team_roles').select('id, field_key, name, display_order').eq('team_type', tt).eq('is_active', true).order('display_order', { ascending: true }),
          supabase.from(table).select('id, full_name, email').order('full_name', { ascending: true }).then((r) => r, () => ({ data: [] })),
          supabase.from('team_member_roles').select('role_id, member_id').eq('member_table', table).then((r) => r, () => ({ data: [] })),
        ]);
        const eligible = {};
        (tmrRes.data || []).forEach((r) => { (eligible[r.role_id] = eligible[r.role_id] || new Set()).add(String(r.member_id)); });
        out.push({ teamType: tt, roles: rolesRes.data || [], members: membersRes.data || [], eligible });
      }
      if (alive) setTeams(out);
    })();
    return () => { alive = false; };
  }, [teamTypes.join(',')]);

  useEffect(() => { fetchAssignmentsForEvents([event.id]).then(() => force((n) => n + 1)); }, [event.id, fetchAssignmentsForEvents]);

  const eligibleFor = (team, role) => {
    const set = team.eligible[role.id];
    if (set && set.size) return team.members.filter((m) => set.has(String(m.id)));
    return team.members; // brak ograniczeń → wszyscy z tabeli służby
  };

  const persist = useCallback((next) => { setAssign(next); onSaveAssignments(next); }, [onSaveAssignments]);

  const toggle = async (team, role, member) => {
    if (!canManage) return;
    const tt = team.teamType;
    const cur = csvNames(assign?.[tt]?.[role.field_key]);
    const has = cur.includes(member.full_name);
    const nextNames = has ? cur.filter((n) => n !== member.full_name) : [...cur, member.full_name];
    const next = { ...(assign || {}), [tt]: { ...(assign?.[tt] || {}), [role.field_key]: nextNames.join(', ') } };
    persist(next);
    try {
      const me = await getCachedUser();
      if (has) {
        await removeEventAssignment(event.id, tt, role.field_key, member.full_name);
      } else {
        await createAssignment({
          eventId: event.id, teamType: tt, roleKey: role.field_key, roleLabel: role.name,
          assignedName: member.full_name, assignedEmail: member.email || null,
          assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || null,
          isSelfAssignment: !!(me?.email && member.email && me.email.toLowerCase() === member.email.toLowerCase()),
        });
      }
      await fetchAssignmentsForEvents([event.id]);
      force((n) => n + 1);
    } catch (e) { toast.error(e.message || 'Błąd zapisu przypisania'); }
  };

  const sendInvites = async (tt) => {
    setSending(tt);
    try {
      const res = await sendInvitesForEvent(event.id, tt);
      if (!res.success) { toast.error('Nie udało się wysłać: ' + (res.error || '')); return; }
      if (res.emailReady === false) { toast.error(res.error || 'Brak konfiguracji e-mail.'); return; }
      toast.success(res.sent ? `Wysłano zaproszenia (${res.sent})${res.failed ? `, niepowodzeń: ${res.failed}` : ''}.` : 'Brak nowych osób do zaproszenia.');
      await fetchAssignmentsForEvents([event.id]);
      force((n) => n + 1);
    } finally { setSending(null); }
  };

  const statusDot = (tt, roleKey, name) => {
    const s = getEventAssignmentStatus(event.id, tt, roleKey, name);
    if (s === 'accepted') return <Check size={12} className="text-green-500" title="Potwierdził" />;
    if (s === 'rejected') return <XIcon size={12} className="text-red-500" title="Odmówił" />;
    if (s === 'pending') return <Clock size={12} className="text-amber-500" title="Oczekuje" />;
    return null;
  };

  const managing = canManage && !!onSaveTeams;
  const isOverridden = typeof event.team_types === 'string';

  return (
    <div className="space-y-4">
      {/* Pasek zarządzania służbami na tym wydarzeniu (override per wydarzenie) */}
      {managing && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-gray-400">
            {teamTypes.length
              ? <>Służby na tym wydarzeniu: <span className="text-gray-500 dark:text-gray-300">{teamTypes.map((t) => teamLabel(t, moduleLabelMap)).join(', ')}</span></>
              : 'Brak wybranych służb dla tego wydarzenia.'}
          </p>
          <div className="flex items-center gap-2">
            {isOverridden && <button onClick={resetTeams} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Przywróć domyślne</button>}
            <button onClick={() => setShowPicker((v) => !v)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
              <Settings2 size={14} /> Zarządzaj służbami
            </button>
          </div>
        </div>
      )}
      {managing && showPicker && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Zaznacz służby dla tego wydarzenia (pojawią się w grafiku i w zakładce „Służby"):</p>
          <div className="flex flex-wrap gap-1.5">
            {teamOptions.map((o) => (
              <button key={o.value} type="button" onClick={() => toggleTeamType(o.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${teamTypes.includes(o.value) ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {defaultTeamTypes?.length ? <p className="text-[11px] text-gray-400 mt-2">Domyślnie (z typu/modułu): {defaultTeamTypes.map((t) => teamLabel(t, moduleLabelMap)).join(', ')}.</p> : null}
        </div>
      )}

      {teamTypes.length === 0 ? (
        <div className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Brak służb na tym wydarzeniu.</p>
          <p className="text-xs text-gray-400 mt-1">{managing ? 'Kliknij „Zarządzaj służbami", aby je dodać. Domyślne dla całego typu ustawisz w Ustawienia → Zarządzanie → „Wydarzenia" → Służby wg typu.' : 'Służby nie zostały skonfigurowane.'}</p>
        </div>
      ) : teams === null ? <Spinner center size={24} /> : (
      <div className="space-y-5">
      {teams.map((team) => {
        const pendingCount = team.roles.reduce((acc, role) => acc + csvNames(assign?.[team.teamType]?.[role.field_key])
          .filter((n) => getEventAssignmentStatus(event.id, team.teamType, role.field_key, n) === 'pending').length, 0);
        return (
          <section key={team.teamType} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100"><Users size={16} className="text-accent-primary" /> {teamLabel(team.teamType, moduleLabelMap)}</h3>
              {canManage && (
                <button onClick={() => sendInvites(team.teamType)} disabled={sending === team.teamType}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5 disabled:opacity-60">
                  <Send size={14} /> {sending === team.teamType ? 'Wysyłanie…' : `Wyślij zaproszenia${pendingCount ? ` (${pendingCount})` : ''}`}
                </button>
              )}
            </div>
            {team.roles.length === 0 ? (
              <p className="text-sm text-gray-400">Brak zdefiniowanych ról dla tej służby. Dodaj je w: Ustawienia → Zarządzanie → dana służba → „Wydarzenia" → Typy/Pola, lub w zakładce „Służby" modułu.</p>
            ) : (
              <div className="space-y-2">
                {team.roles.map((role) => {
                  const selected = csvNames(assign?.[team.teamType]?.[role.field_key]);
                  const key = `${team.teamType}:${role.field_key}`;
                  const elig = eligibleFor(team, role);
                  return (
                    <div key={role.id} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-40 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200 pt-1">{role.name}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-1.5">
                            {selected.length === 0 && <span className="text-xs text-gray-400 pt-1">—</span>}
                            {selected.map((n) => {
                              const m = team.members.find((x) => x.full_name === n);
                              return (
                                <span key={n} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                  {statusDot(team.teamType, role.field_key, n)}
                                  {n}
                                  {canManage && m && <button onClick={() => toggle(team, role, m)} className="text-gray-400 hover:text-red-500"><XIcon size={12} /></button>}
                                </span>
                              );
                            })}
                            {canManage && (
                              <button onClick={() => setOpenRole(openRole === key ? null : key)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-dashed border-gray-300 dark:border-gray-600 text-accent-primary hover:bg-accent-primary/5">
                                <Plus size={12} /> Dodaj
                              </button>
                            )}
                          </div>
                          {openRole === key && canManage && (
                            <div className="mt-2 max-h-44 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                              {elig.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">Brak osób w tej służbie. Dodaj w zakładce „Służby" modułu.</p> : elig.map((m) => (
                                <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                  <input type="checkbox" checked={selected.includes(m.full_name)} onChange={() => toggle(team, role, m)} className="w-4 h-4 rounded accent-accent-primary" />
                                  <span className="text-gray-700 dark:text-gray-200">{m.full_name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      </div>
      )}
    </div>
  );
}
