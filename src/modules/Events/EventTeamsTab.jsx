// Zakładka „Służby" na wydarzeniu — przypisania służb (jak sekcje zespołów w programie),
// ale na events. Sekcje = służby (team_type) z konfiguracji/overrideu + własne sekcje ad-hoc
// (events.team_layout). Role = team_roles(team_type) + własne role ad-hoc. Do każdej roli można
// wybrać osoby z tabeli służby ALBO dopisać osobę ręcznie (spoza tabeli). Wybór zapisywany
// w events.assignments[sectionKey][roleKey] (CSV imion); wysyłka/statusy przez silnik
// schedule_assignments po event_id (osoby dopisane ręcznie bez e-maila nie dostają zaproszeń).
import React, { useState, useEffect, useCallback } from 'react';
import { Send, Check, Clock, X as XIcon, Plus, Users, Settings2, Trash2 } from 'lucide-react';
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
const uid = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const normLayout = (l) => (l && typeof l === 'object' ? { sections: Array.isArray(l.sections) ? l.sections : [], roles: l.roles && typeof l.roles === 'object' ? l.roles : {} } : { sections: [], roles: {} });

export default function EventTeamsTab({ event, teamTypes, defaultTeamTypes, canManage, onSaveAssignments, onSaveTeams, onSaveLayout, moduleLabelMap }) {
  const { createAssignment, removeEventAssignment, fetchAssignmentsForEvents, getEventAssignmentStatus, sendInvitesForEvent } = useScheduleAssignments();
  const [teamData, setTeamData] = useState(null); // { [teamType]: { roles, members, eligible } }
  const [assign, setAssign] = useState(event.assignments && typeof event.assignments === 'object' ? event.assignments : {});
  const [layout, setLayout] = useState(normLayout(event.team_layout));
  const [openRole, setOpenRole] = useState(null); // `${sectionKey}:${roleKey}`
  const [sending, setSending] = useState(null);
  const [, force] = useState(0);
  const [teamOptions, setTeamOptions] = useState(SYSTEM_TEAM_OPTIONS);
  const [showPicker, setShowPicker] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [addingRoleFor, setAddingRoleFor] = useState(null); // sectionKey
  const [newRole, setNewRole] = useState('');
  const [manualText, setManualText] = useState({}); // { `${sectionKey}:${roleKey}`: text }

  // Opcje pickera służb: systemowe + moduły custom (z app_modules).
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

  // Załaduj role/osoby/eligibility dla służb (team_type). Własne sekcje nie mają tabeli osób.
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const tt of teamTypes) {
        const table = memberTableFor(tt);
        const [rolesRes, membersRes, tmrRes] = await Promise.all([
          supabase.from('team_roles').select('id, field_key, name, display_order').eq('team_type', tt).eq('is_active', true).order('display_order', { ascending: true }),
          supabase.from(table).select('id, full_name, email').order('full_name', { ascending: true }).then((r) => r, () => ({ data: [] })),
          supabase.from('team_member_roles').select('role_id, member_id').eq('member_table', table).then((r) => r, () => ({ data: [] })),
        ]);
        const eligible = {};
        (tmrRes.data || []).forEach((r) => { (eligible[r.role_id] = eligible[r.role_id] || new Set()).add(String(r.member_id)); });
        out[tt] = { roles: rolesRes.data || [], members: membersRes.data || [], eligible };
      }
      if (alive) setTeamData(out);
    })();
    return () => { alive = false; };
  }, [teamTypes.join(',')]);

  useEffect(() => { fetchAssignmentsForEvents([event.id]).then(() => force((n) => n + 1)); }, [event.id, fetchAssignmentsForEvents]);

  const persist = useCallback((next) => { setAssign(next); onSaveAssignments(next); }, [onSaveAssignments]);
  const persistLayout = useCallback((next) => { setLayout(next); onSaveLayout?.(next); }, [onSaveLayout]);

  // --- Sekcje (służby + własne) ---
  const sections = [
    ...teamTypes.map((tt) => ({ key: tt, label: teamLabel(tt, moduleLabelMap), isCustom: false })),
    ...(layout.sections || []).map((s) => ({ key: s.key, label: s.label, isCustom: true })),
  ];

  const rolesForSection = (section) => {
    const dbRoles = section.isCustom ? [] : (teamData?.[section.key]?.roles || []).map((r) => ({ key: r.field_key, name: r.name, roleId: r.id, isCustom: false }));
    const extra = (layout.roles?.[section.key] || []).map((r) => ({ key: r.key, name: r.label, roleId: null, isCustom: true }));
    return [...dbRoles, ...extra];
  };

  const pickListFor = (section, role) => {
    if (section.isCustom) return [];
    const td = teamData?.[section.key];
    if (!td) return [];
    if (role.isCustom || !role.roleId) return td.members; // własna rola → wszyscy z tabeli służby
    const set = td.eligible[role.roleId];
    return set && set.size ? td.members.filter((m) => set.has(String(m.id))) : td.members;
  };

  // --- Przypisania ---
  const addPicked = async (sectionKey, role, member) => {
    const cur = csvNames(assign?.[sectionKey]?.[role.key]);
    if (cur.includes(member.full_name)) return;
    const next = { ...(assign || {}), [sectionKey]: { ...(assign?.[sectionKey] || {}), [role.key]: [...cur, member.full_name].join(', ') } };
    persist(next);
    try {
      const me = await getCachedUser();
      await createAssignment({
        eventId: event.id, teamType: sectionKey, roleKey: role.key, roleLabel: role.name,
        assignedName: member.full_name, assignedEmail: member.email || null,
        assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || null,
        isSelfAssignment: !!(me?.email && member.email && me.email.toLowerCase() === member.email.toLowerCase()),
      });
      await fetchAssignmentsForEvents([event.id]); force((n) => n + 1);
    } catch (e) { toast.error(e.message || 'Błąd zapisu przypisania'); }
  };

  const addManual = async (sectionKey, role) => {
    const key = `${sectionKey}:${role.key}`;
    const name = String(manualText[key] || '').trim();
    if (!name) return;
    const cur = csvNames(assign?.[sectionKey]?.[role.key]);
    if (!cur.includes(name)) {
      const next = { ...(assign || {}), [sectionKey]: { ...(assign?.[sectionKey] || {}), [role.key]: [...cur, name].join(', ') } };
      persist(next);
      // Jeśli dopisana osoba pasuje do kogoś z tabeli służby (po imieniu) — utwórz przypisanie
      // z e-mailem, żeby mogła dostać zaproszenie. W innym wypadku wpis pozostaje ręczny.
      const member = (teamData?.[sectionKey]?.members || []).find((m) => m.full_name === name && m.email);
      if (member) {
        try {
          const me = await getCachedUser();
          await createAssignment({ eventId: event.id, teamType: sectionKey, roleKey: role.key, roleLabel: role.name, assignedName: name, assignedEmail: member.email, assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || null, isSelfAssignment: false });
          await fetchAssignmentsForEvents([event.id]); force((n) => n + 1);
        } catch { /* ignore */ }
      }
    }
    setManualText((m) => ({ ...m, [key]: '' }));
  };

  const removeName = async (sectionKey, role, name) => {
    const cur = csvNames(assign?.[sectionKey]?.[role.key]);
    const next = { ...(assign || {}), [sectionKey]: { ...(assign?.[sectionKey] || {}), [role.key]: cur.filter((n) => n !== name).join(', ') } };
    persist(next);
    try { await removeEventAssignment(event.id, sectionKey, role.key, name); await fetchAssignmentsForEvents([event.id]); force((n) => n + 1); } catch { /* ignore */ }
  };

  const isSelected = (sectionKey, role, name) => csvNames(assign?.[sectionKey]?.[role.key]).includes(name);

  // --- Zarządzanie strukturą ---
  const toggleTeamType = (value) => {
    const cur = new Set(teamTypes);
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    onSaveTeams?.([...cur].join(', '));
  };
  const resetTeams = () => onSaveTeams?.(null);

  const addSection = () => {
    const label = newSection.trim();
    if (!label) return;
    persistLayout({ ...layout, sections: [...(layout.sections || []), { key: uid('sec'), label }] });
    setNewSection('');
  };
  const delSection = async (sectionKey) => {
    if (!confirm('Usunąć tę sekcję wraz z przypisaniami?')) return;
    // wyczyść przypisania sekcji z silnika
    for (const role of rolesForSection({ key: sectionKey, isCustom: true })) {
      for (const n of csvNames(assign?.[sectionKey]?.[role.key])) { try { await removeEventAssignment(event.id, sectionKey, role.key, n); } catch { /* ignore */ } }
    }
    const nextRoles = { ...(layout.roles || {}) }; delete nextRoles[sectionKey];
    persistLayout({ sections: (layout.sections || []).filter((s) => s.key !== sectionKey), roles: nextRoles });
    const na = { ...(assign || {}) }; delete na[sectionKey]; persist(na);
  };

  const addRole = (sectionKey) => {
    const label = newRole.trim();
    if (!label) return;
    const roles = { ...(layout.roles || {}) };
    roles[sectionKey] = [...(roles[sectionKey] || []), { key: uid('r'), label }];
    persistLayout({ ...layout, roles });
    setNewRole(''); setAddingRoleFor(null);
  };
  const delRole = async (sectionKey, roleKey) => {
    for (const n of csvNames(assign?.[sectionKey]?.[roleKey])) { try { await removeEventAssignment(event.id, sectionKey, roleKey, n); } catch { /* ignore */ } }
    const roles = { ...(layout.roles || {}) };
    roles[sectionKey] = (roles[sectionKey] || []).filter((r) => r.key !== roleKey);
    persistLayout({ ...layout, roles });
    if (assign?.[sectionKey]?.[roleKey] != null) {
      const na = { ...assign, [sectionKey]: { ...assign[sectionKey] } }; delete na[sectionKey][roleKey]; persist(na);
    }
  };

  const sendInvites = async (sectionKey) => {
    setSending(sectionKey);
    try {
      const res = await sendInvitesForEvent(event.id, sectionKey);
      if (!res.success) { toast.error('Nie udało się wysłać: ' + (res.error || '')); return; }
      if (res.emailReady === false) { toast.error(res.error || 'Brak konfiguracji e-mail.'); return; }
      toast.success(res.sent ? `Wysłano zaproszenia (${res.sent})${res.failed ? `, niepowodzeń: ${res.failed}` : ''}.` : 'Brak nowych osób do zaproszenia.');
      await fetchAssignmentsForEvents([event.id]); force((n) => n + 1);
    } finally { setSending(null); }
  };

  const statusDot = (sectionKey, roleKey, name) => {
    const s = getEventAssignmentStatus(event.id, sectionKey, roleKey, name);
    if (s === 'accepted') return <Check size={12} className="text-green-500" title="Potwierdził" />;
    if (s === 'rejected') return <XIcon size={12} className="text-red-500" title="Odmówił" />;
    if (s === 'pending') return <Clock size={12} className="text-amber-500" title="Oczekuje" />;
    return null;
  };

  const managing = canManage && !!onSaveTeams;
  const isOverridden = typeof event.team_types === 'string';
  const hasAnySection = sections.length > 0;

  return (
    <div className="space-y-4">
      {/* Pasek zarządzania służbami na tym wydarzeniu */}
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div>
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
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Dodaj własną sekcję (poza służbami modułów), np. „Kuchnia", „Porządkowi":</p>
            <div className="flex items-center gap-2">
              <input value={newSection} onChange={(e) => setNewSection(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }}
                placeholder="Nazwa sekcji…" className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
              <button onClick={addSection} className="text-sm px-3 py-1.5 rounded-lg bg-accent-primary text-white flex items-center gap-1.5"><Plus size={14} /> Dodaj sekcję</button>
            </div>
          </div>
        </div>
      )}

      {!hasAnySection ? (
        <div className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Brak służb na tym wydarzeniu.</p>
          <p className="text-xs text-gray-400 mt-1">{managing ? 'Kliknij „Zarządzaj służbami", aby dodać służby lub własną sekcję.' : 'Służby nie zostały skonfigurowane.'}</p>
        </div>
      ) : (teamTypes.length > 0 && teamData === null) ? <Spinner center size={24} /> : (
        <div className="space-y-5">
          {sections.map((section) => {
            const roles = rolesForSection(section);
            const pendingCount = roles.reduce((acc, role) => acc + csvNames(assign?.[section.key]?.[role.key])
              .filter((n) => getEventAssignmentStatus(event.id, section.key, role.key, n) === 'pending').length, 0);
            return (
              <section key={section.key} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    <Users size={16} className="text-accent-primary" /> {section.label}
                    {section.isCustom && <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">własna</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    {canManage && !section.isCustom && (
                      <button onClick={() => sendInvites(section.key)} disabled={sending === section.key}
                        className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white flex items-center gap-1.5 disabled:opacity-60">
                        <Send size={14} /> {sending === section.key ? 'Wysyłanie…' : `Wyślij zaproszenia${pendingCount ? ` (${pendingCount})` : ''}`}
                      </button>
                    )}
                    {canManage && section.isCustom && (
                      <button onClick={() => delSection(section.key)} title="Usuń sekcję" className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>

                {roles.length === 0 ? (
                  <p className="text-sm text-gray-400">{section.isCustom ? 'Dodaj role do tej sekcji.' : 'Brak zdefiniowanych ról dla tej służby — dodaj własną rolę poniżej lub zdefiniuj w module.'}</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {roles.map((role) => {
                      const selected = csvNames(assign?.[section.key]?.[role.key]);
                      const key = `${section.key}:${role.key}`;
                      const pick = pickListFor(section, role);
                      return (
                        <div key={key} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{role.name}</span>
                            {canManage && role.isCustom && <button onClick={() => delRole(section.key, role.key)} title="Usuń rolę" className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.length === 0 && <span className="text-xs text-gray-400">—</span>}
                            {selected.map((n) => (
                              <span key={n} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                {statusDot(section.key, role.key, n)}
                                {n}
                                {canManage && <button onClick={() => removeName(section.key, role, n)} className="text-gray-400 hover:text-red-500"><XIcon size={12} /></button>}
                              </span>
                            ))}
                            {canManage && (
                              <button onClick={() => setOpenRole(openRole === key ? null : key)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-dashed border-gray-300 dark:border-gray-600 text-accent-primary hover:bg-accent-primary/5">
                                <Plus size={12} /> Dodaj
                              </button>
                            )}
                          </div>
                          {openRole === key && canManage && (
                            <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700">
                              {pick.length > 0 && (
                                <div className="max-h-40 overflow-y-auto custom-scrollbar divide-y divide-gray-50 dark:divide-gray-700/50">
                                  {pick.map((m) => (
                                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                      <input type="checkbox" checked={isSelected(section.key, role, m.full_name)}
                                        onChange={() => (isSelected(section.key, role, m.full_name) ? removeName(section.key, role, m.full_name) : addPicked(section.key, role, m))}
                                        className="w-4 h-4 rounded accent-accent-primary" />
                                      <span className="text-gray-700 dark:text-gray-200">{m.full_name}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                              {/* Ręczne dopisanie osoby do służby (spoza tabeli) */}
                              <div className="flex items-center gap-2 p-2 border-t border-gray-100 dark:border-gray-800">
                                <input value={manualText[key] || ''} onChange={(e) => setManualText((mm) => ({ ...mm, [key]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addManual(section.key, role); }}
                                  placeholder="Dopisz osobę ręcznie…" className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
                                <button onClick={() => addManual(section.key, role)} className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-primary text-white whitespace-nowrap">Dopisz</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Dodawanie własnej roli do sekcji (służby lub własnej) */}
                {canManage && (
                  addingRoleFor === section.key ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input value={newRole} onChange={(e) => setNewRole(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') addRole(section.key); if (e.key === 'Escape') { setAddingRoleFor(null); setNewRole(''); } }}
                        placeholder="Nazwa roli…" className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
                      <button onClick={() => addRole(section.key)} className="text-sm px-3 py-1.5 rounded-lg bg-accent-primary text-white">Dodaj</button>
                      <button onClick={() => { setAddingRoleFor(null); setNewRole(''); }} className="text-sm px-2 py-1.5 text-gray-400 hover:text-gray-600">Anuluj</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingRoleFor(section.key); setNewRole(''); }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary">
                      <Plus size={15} /> Dodaj rolę
                    </button>
                  )
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
