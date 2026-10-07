// Zakładka „Służby" na wydarzeniu — przypisania służb (jak sekcje zespołów w programie),
// ale na events. Sekcje = służby (team_type) z konfiguracji/overrideu + własne sekcje ad-hoc
// (events.team_layout). Role = team_roles(team_type) + własne role ad-hoc. Do każdej roli można
// wybrać osoby z tabeli służby ALBO dopisać osobę ręcznie (spoza tabeli). Wybór zapisywany
// w events.assignments[sectionKey][roleKey] (CSV imion); wysyłka/statusy przez silnik
// schedule_assignments po event_id (osoby dopisane ręcznie bez e-maila nie dostają zaproszeń).
// Zapis assignments WYŁĄCZNIE atomowo (fn event-assignments-patch): wysyłamy tylko zmienione
// ścieżki [sekcja, rola], więc równoległa praca innego lidera (np. grafik Mediów) nie znika.
import React, { useState, useEffect, useRef } from 'react';
import { Send, Check, Clock, X as XIcon, Plus, Users, Settings2, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { getCachedUser } from '../../lib/supabase';
import { useScheduleAssignments, patchEventAssignments, scheduleSaveErrorMessage } from '../../hooks/useScheduleAssignments';
import { diffAssignmentOps, eventInviteSummary } from '../../lib/scheduleBridge';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { confirmDialog } from '../../lib/dialog';
import { tr } from '../../i18n';

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
// Nazwa służby: najpierw nazwa modułu nadana przez kościół (app_modules), potem domyślna.
const teamLabel = (t, moduleLabelMap) => moduleLabelMap?.[t] || (TEAM_LABELS[t] ? tr(TEAM_LABELS[t]) : t);
const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const uid = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const normLayout = (l) => (l && typeof l === 'object' ? { sections: Array.isArray(l.sections) ? l.sections : [], roles: l.roles && typeof l.roles === 'object' ? l.roles : {} } : { sections: [], roles: {} });

export default function EventTeamsTab({ event, teamTypes, defaultTeamTypes, canManage, onAssignmentsChange, onSaveTeams, onSaveLayout, moduleLabelMap: moduleLabelMapProp }) {
  const { assignments: schedRows, createAssignment, removeEventAssignment, fetchAssignmentsForEvents, getEventAssignmentStatus, sendInvitesForEvent } = useScheduleAssignments();
  const [teamData, setTeamData] = useState(null); // { [teamType]: { roles, members, eligible } }
  const [assign, setAssign] = useState(event.assignments && typeof event.assignments === 'object' ? event.assignments : {});
  const assignRef = useRef(assign); // aktualny stan (do liczenia różnic przy szybkich kliknięciach)
  const saveSeq = useRef(0);
  const [dbLabels, setDbLabels] = useState({}); // nazwy modułów nadane przez kościół
  const moduleLabelMap = moduleLabelMapProp || dbLabels;
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
        // Kolumna klucza modułu to `key` (nie module_key).
        const { data } = await supabase.from('app_modules').select('key, label, is_system');
        const labels = {};
        (data || []).forEach((m) => { if (m?.key && m.label) labels[m.key] = m.label; });
        const custom = (data || []).filter((m) => m?.key && m.is_system === false)
          .map((m) => ({ value: m.key, label: m.label || m.key }));
        const seen = new Set();
        const merged = [...SYSTEM_TEAM_OPTIONS, ...custom].filter((o) => (seen.has(o.value) ? false : seen.add(o.value)))
          .map((o) => ({ ...o, label: labels[o.value] || o.label }));
        if (alive) { setTeamOptions(merged); setDbLabels(labels); }
      } catch { /* zostają systemowe */ }
    })();
    return () => { alive = false; };
  }, []);

  // Służby do pokazania = wybrane (teamTypes) + te, które MAJĄ już przypisania (żeby nigdy nie
  // ukryć danych po zmianie typu/reguły lub „Przywróć domyślne"). Własne sekcje idą osobno (layout).
  const customSectionKeys = (layout.sections || []).map((s) => s.key);
  const assignedTeamKeys = Object.keys(assign || {}).filter(
    (k) => !customSectionKeys.includes(k) && Object.entries(assign[k] || {}).some(([rk, v]) => rk !== 'notatki' && rk !== 'absencja' && csvNames(v).length)
  );
  const effectiveTeamTypes = [...new Set([...teamTypes, ...assignedTeamKeys])];

  // Załaduj role/osoby/eligibility dla służb (team_type). Własne sekcje nie mają tabeli osób.
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const tt of effectiveTeamTypes) {
        const table = memberTableFor(tt);
        const day = String(event.date || '').slice(0, 10);
        const [rolesRes, membersRes, tmrRes, availRes] = await Promise.all([
          supabase.from('team_roles').select('id, field_key, name, display_order').eq('team_type', tt).eq('is_active', true).order('display_order', { ascending: true }),
          supabase.from(table).select('id, full_name, email').order('full_name', { ascending: true }).then((r) => r, () => ({ data: [] })),
          supabase.from('team_member_roles').select('role_id, member_id').eq('member_table', table).then((r) => r, () => ({ data: [] })),
          // Zgłoszone nieobecności w dniu wydarzenia (fn team-availability — bez powodów).
          day
            ? supabase.functions.invoke('team-availability', { body: { team: tt, from: day, to: day } }).then((r) => r, () => ({ data: null }))
            : Promise.resolve({ data: null }),
        ]);
        const eligible = {};
        (tmrRes.data || []).forEach((r) => { (eligible[r.role_id] = eligible[r.role_id] || new Set()).add(String(r.member_id)); });
        const unavailable = new Set((availRes?.data?.blockouts || []).map((b) => b.name));
        out[tt] = { roles: rolesRes.data || [], members: membersRes.data || [], eligible, unavailable };
      }
      if (alive) setTeamData(out);
    })();
    return () => { alive = false; };
  }, [effectiveTeamTypes.join(','), event.date]);

  useEffect(() => { fetchAssignmentsForEvents([event.id]).then(() => force((n) => n + 1)); }, [event.id, fetchAssignmentsForEvents]);

  // Zwiń rozwinięte pole wyboru osoby przy kliknięciu poza nie (klik w inny „Dodaj"
  // otwiera nowe i zamyka stare, bo openRole jest pojedynczy).
  useEffect(() => {
    if (!openRole) return;
    const onDown = (e) => {
      if (e.target.closest('[data-role-popover]') || e.target.closest('[data-role-toggle]')) return;
      setOpenRole(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openRole]);

  const setAssignBoth = (next) => { assignRef.current = next; setAssign(next); };

  // Atomowy zapis: różnica względem bieżącego stanu → ops → fn event-assignments-patch.
  // Optymistycznie w UI; po odpowiedzi świeży stan z serwera (z cudzymi zmianami);
  // przy błędzie przywrócenie poprzedniego stanu i komunikat. Zwraca true/false.
  const persist = async (next) => {
    const prev = assignRef.current;
    const ops = diffAssignmentOps(prev, next);
    if (!ops.length) return true;
    const seq = ++saveSeq.current;
    setAssignBoth(next);
    const { assignments, error } = await patchEventAssignments(event.id, ops);
    const latest = saveSeq.current === seq;
    if (error) {
      if (latest) setAssignBoth(prev);
      toast.error(scheduleSaveErrorMessage(error));
      return false;
    }
    if (latest && assignments) {
      setAssignBoth(assignments);
      onAssignmentsChange?.(assignments);
    }
    return true;
  };
  const persistLayout = async (next) => {
    const prev = layout;
    setLayout(next);
    const ok = onSaveLayout ? await onSaveLayout(next) : true;
    if (ok === false) setLayout(prev);
    return ok !== false;
  };
  const withRole = (base, sectionKey, roleKey, names) => ({
    ...(base || {}), [sectionKey]: { ...(base?.[sectionKey] || {}), [roleKey]: names.join(', ') },
  });
  const refreshStatuses = async () => { await fetchAssignmentsForEvents([event.id]); force((n) => n + 1); };
  const whoAmI = async () => { try { return await getCachedUser(); } catch { return null; } };

  // --- Sekcje (służby + własne) ---
  const sections = [
    ...effectiveTeamTypes.map((tt) => ({ key: tt, label: teamLabel(tt, moduleLabelMap), isCustom: false })),
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
  // Dodanie osoby: najpierw siatka (atomowo), potem wiersz zaproszenia. Gdy zaproszenia nie da się
  // zapisać — cofamy wpis w siatce, żeby grafik i „Wyślij" mówiły to samo.
  const addAssigned = async (sectionKey, role, name, email) => {
    const cur = csvNames(assignRef.current?.[sectionKey]?.[role.key]);
    if (cur.includes(name)) return;
    if (!await persist(withRole(assignRef.current, sectionKey, role.key, [...cur, name]))) return;
    if (!email && !(teamData?.[sectionKey]?.members || []).some((m) => m.full_name === name)) return; // wpis ręczny spoza służby
    const me = await whoAmI();
    const res = await createAssignment({
      eventId: event.id, teamType: sectionKey, roleKey: role.key, roleLabel: role.name,
      assignedName: name, assignedEmail: email || null,
      assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || null,
      isSelfAssignment: !!(me?.email && email && me.email.toLowerCase() === email.toLowerCase()),
    });
    if (!res?.success) {
      const now = csvNames(assignRef.current?.[sectionKey]?.[role.key]).filter((n) => n !== name);
      await persist(withRole(assignRef.current, sectionKey, role.key, now));
      toast.error(tr('Nie udało się przypisać: {name}. Sprawdź, czy masz uprawnienia do edycji grafiku.', { name }));
    }
    await refreshStatuses();
  };

  const addPicked = (sectionKey, role, member) => addAssigned(sectionKey, role, member.full_name, member.email || null);

  const addManual = async (sectionKey, role) => {
    const key = `${sectionKey}:${role.key}`;
    const name = String(manualText[key] || '').trim();
    if (!name) return;
    // Jeśli dopisana osoba pasuje do kogoś z tabeli służby (po imieniu) — przypisanie z e-mailem,
    // żeby mogła dostać zaproszenie. W innym wypadku wpis pozostaje ręczny (bez zaproszenia).
    const member = (teamData?.[sectionKey]?.members || []).find((m) => m.full_name === name);
    setManualText((m) => ({ ...m, [key]: '' }));
    await addAssigned(sectionKey, role, name, member?.email || null);
  };

  // Usunięcie osoby: siatka, potem wiersz zaproszenia. Jeśli wiersza nie da się usunąć, osoba
  // wraca do siatki — inaczej „Wyślij" zaprosiłby kogoś, kogo nie ma w grafiku.
  const removeName = async (sectionKey, role, name) => {
    const cur = csvNames(assignRef.current?.[sectionKey]?.[role.key]);
    if (!await persist(withRole(assignRef.current, sectionKey, role.key, cur.filter((n) => n !== name)))) return;
    const res = await removeEventAssignment(event.id, sectionKey, role.key, name);
    if (!res?.success) {
      const now = csvNames(assignRef.current?.[sectionKey]?.[role.key]);
      if (!now.includes(name)) await persist(withRole(assignRef.current, sectionKey, role.key, [...now, name]));
      toast.error(tr('Nie udało się usunąć z grafiku: {name}. Sprawdź, czy masz uprawnienia do edycji grafiku.', { name }));
    }
    await refreshStatuses();
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
  // Usuwa wiersze zaproszeń wszystkich osób z podanych ról; zwraca imiona, których nie udało się usunąć.
  const removeRoleRows = async (sectionKey, roleKeys) => {
    const failed = [];
    for (const rk of roleKeys) {
      for (const n of csvNames(assignRef.current?.[sectionKey]?.[rk])) {
        const res = await removeEventAssignment(event.id, sectionKey, rk, n);
        if (!res?.success) failed.push(n);
      }
    }
    return failed;
  };

  const delSection = async (sectionKey) => {
    const label = (layout.sections || []).find((s) => s.key === sectionKey)?.label || '';
    if (!await confirmDialog(tr('Usunąć sekcję „{name}” razem z przypisanymi osobami? Tej operacji nie można cofnąć.', { name: label }))) return;
    // Najpierw zaproszenia (żeby nie zostały „duchy”), potem siatka i układ.
    const failed = await removeRoleRows(sectionKey, rolesForSection({ key: sectionKey, isCustom: true }).map((r) => r.key));
    if (failed.length) {
      toast.error(tr('Nie udało się usunąć przydziałów: {names}. Sekcja nie została usunięta.', { names: failed.join(', ') }));
      await refreshStatuses();
      return;
    }
    const na = { ...(assignRef.current || {}) }; delete na[sectionKey];
    if (!await persist(na)) return;
    const nextRoles = { ...(layout.roles || {}) }; delete nextRoles[sectionKey];
    await persistLayout({ sections: (layout.sections || []).filter((s) => s.key !== sectionKey), roles: nextRoles });
    await refreshStatuses();
  };

  const addRole = (sectionKey) => {
    const label = newRole.trim();
    if (!label) return;
    const roles = { ...(layout.roles || {}) };
    roles[sectionKey] = [...(roles[sectionKey] || []), { key: uid('r'), label }];
    persistLayout({ ...layout, roles });
    setNewRole(''); setAddingRoleFor(null);
  };
  const delRole = async (sectionKey, role) => {
    const assigned = csvNames(assignRef.current?.[sectionKey]?.[role.key]);
    if (assigned.length && !await confirmDialog(tr('Usunąć rolę „{name}” razem z przypisanymi osobami ({n})?', { name: role.name, n: assigned.length }))) return;
    const failed = await removeRoleRows(sectionKey, [role.key]);
    if (failed.length) {
      toast.error(tr('Nie udało się usunąć przydziałów: {names}. Rola nie została usunięta.', { names: failed.join(', ') }));
      await refreshStatuses();
      return;
    }
    if (assignRef.current?.[sectionKey]?.[role.key] != null) {
      const cur = assignRef.current;
      const na = { ...cur, [sectionKey]: { ...cur[sectionKey] } }; delete na[sectionKey][role.key];
      if (!await persist(na)) return;
    }
    const roles = { ...(layout.roles || {}) };
    roles[sectionKey] = (roles[sectionKey] || []).filter((r) => r.key !== role.key);
    await persistLayout({ ...layout, roles });
    await refreshStatuses();
  };

  const sendInvites = async (sectionKey) => {
    setSending(sectionKey);
    try {
      const res = await sendInvitesForEvent(event.id, sectionKey);
      if (res.emailReady === false) { toast.error(tr('Wysyłka e-maili nie jest skonfigurowana. Skontaktuj się z administratorem.')); return; }
      if (!res.success) { toast.error(tr('Nie udało się wysłać zaproszeń. Spróbuj ponownie.')); return; }
      if (res.sent) toast.success(tr('Wysłano zaproszenia ({n})', { n: res.sent }) + (res.failed ? tr(', niepowodzeń: {n}', { n: res.failed }) : '') + '.');
      else if (res.failed) toast.error(tr('Nie udało się wysłać zaproszeń. Spróbuj ponownie.'));
      else toast.info(tr('Brak nowych osób do zaproszenia.'));
      await refreshStatuses();
    } finally { setSending(null); }
  };

  const statusDot = (sectionKey, roleKey, name) => {
    const s = getEventAssignmentStatus(event.id, sectionKey, roleKey, name);
    if (s === 'accepted') return <Check size={12} className="text-green-500" title={tr('Potwierdził')} />;
    if (s === 'rejected') return <XIcon size={12} className="text-red-500" title={tr('Odmówił')} />;
    if (s === 'pending') return <Clock size={12} className="text-amber-500" title={tr('Oczekuje')} />;
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
              ? <>{tr('Służby na tym wydarzeniu:')} <span className="text-gray-500 dark:text-gray-300">{teamTypes.map((t) => teamLabel(t, moduleLabelMap)).join(', ')}</span></>
              : tr('Brak wybranych służb dla tego wydarzenia.')}
          </p>
          <div className="flex items-center gap-2">
            {isOverridden && <button onClick={resetTeams} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{tr('Przywróć domyślne')}</button>}
            <button onClick={() => setShowPicker((v) => !v)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
              <Settings2 size={14} /> {tr('Zarządzaj służbami')}
            </button>
          </div>
        </div>
      )}
      {managing && showPicker && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Zaznacz służby dla tego wydarzenia (pojawią się w grafiku i w zakładce „Służby"):')}</p>
            <div className="flex flex-wrap gap-1.5">
              {teamOptions.map((o) => (
                <button key={o.value} type="button" onClick={() => toggleTeamType(o.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${teamTypes.includes(o.value) ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {dbLabels[o.value] || (TEAM_LABELS[o.value] ? tr(TEAM_LABELS[o.value]) : o.label)}
                </button>
              ))}
            </div>
            {defaultTeamTypes?.length ? <p className="text-[11px] text-gray-400 mt-2">{tr('Domyślnie (z typu/modułu): {list}.', { list: defaultTeamTypes.map((t) => teamLabel(t, moduleLabelMap)).join(', ') })}</p> : null}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{tr('Dodaj własną sekcję (poza służbami modułów), np. „Kuchnia", „Porządkowi":')}</p>
            <div className="flex items-center gap-2">
              <input value={newSection} onChange={(e) => setNewSection(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }}
                placeholder={tr('Nazwa sekcji…')} className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
              <button onClick={addSection} className="text-sm px-3 py-1.5 rounded-lg bg-accent-primary text-white flex items-center gap-1.5"><Plus size={14} /> {tr('Dodaj sekcję')}</button>
            </div>
          </div>
        </div>
      )}

      {!hasAnySection ? (
        <EmptyState
          icon={Users}
          title={tr('Brak służb na tym wydarzeniu.')}
          subtitle={managing ? tr('Kliknij „Zarządzaj służbami", aby dodać służby lub własną sekcję.') : tr('Służby nie zostały skonfigurowane.')}
          compact
        />
      ) : (effectiveTeamTypes.length > 0 && teamData === null) ? <Spinner center size={24} /> : (
        <div className="space-y-5">
          {sections.map((section) => {
            const roles = rolesForSection(section);
            // Liczymy tylko osoby, do których zaproszenie jeszcze NIE wyszło (z e-mailem).
            const inv = eventInviteSummary(schedRows, event.id, section.key);
            return (
              <section key={section.key} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    <Users size={16} className="text-accent-primary" aria-hidden="true" /> {section.label}
                    {section.isCustom && <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">{tr('własna')}</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    {canManage && !section.isCustom && (
                      <Button size="sm" icon={Send} variant={inv.toSend ? 'primary' : 'outline'} loading={sending === section.key}
                        onClick={() => sendInvites(section.key)}
                        title={tr('Wyślij osobom z tej służby prośbę o potwierdzenie (e-mail i powiadomienie w aplikacji). Wybór osoby sam niczego nie wysyła.')}>
                        {inv.toSend ? tr('Poproś o potwierdzenie ({n})', { n: inv.toSend }) : tr('Poproś o potwierdzenie')}
                      </Button>
                    )}
                    {canManage && section.isCustom && (
                      <button onClick={() => delSection(section.key)} title={tr('Usuń sekcję')} aria-label={tr('Usuń sekcję')} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
                {canManage && inv.noEmail.length > 0 && (
                  <p className="mb-3 inline-flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={13} className="shrink-0 mt-px" aria-hidden="true" />
                    {tr('Bez e-maila — nie dostaną powiadomienia: {names}', { names: inv.noEmail.join(', ') })}
                  </p>
                )}

                {roles.length === 0 ? (
                  <p className="text-sm text-gray-400">{section.isCustom ? tr('Dodaj role do tej sekcji.') : tr('Brak zdefiniowanych ról dla tej służby — dodaj własną rolę poniżej lub zdefiniuj w module.')}</p>
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
                            {canManage && role.isCustom && <button onClick={() => delRole(section.key, role)} title={tr('Usuń rolę')} aria-label={tr('Usuń rolę')} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selected.length === 0 && <span className="text-xs text-gray-400">—</span>}
                            {selected.map((n) => (
                              <span key={n} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                {statusDot(section.key, role.key, n)}
                                {n}
                                {canManage && <button onClick={() => removeName(section.key, role, n)} aria-label={tr('Usuń {name} z tej roli', { name: n })} title={tr('Usuń {name} z tej roli', { name: n })} className="text-gray-400 hover:text-red-500"><XIcon size={12} /></button>}
                              </span>
                            ))}
                            {canManage && (
                              <button data-role-toggle={key} onClick={() => setOpenRole(openRole === key ? null : key)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-dashed border-gray-300 dark:border-gray-600 text-accent-primary hover:bg-accent-primary/5">
                                <Plus size={12} /> {tr('Dodaj')}
                              </button>
                            )}
                          </div>
                          {openRole === key && canManage && (
                            <div data-role-popover={key} className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700">
                              {pick.length > 0 && (
                                <div className="max-h-40 overflow-y-auto custom-scrollbar divide-y divide-gray-50 dark:divide-gray-700/50">
                                  {pick.map((m) => (
                                    <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                      <input type="checkbox" checked={isSelected(section.key, role, m.full_name)}
                                        onChange={() => (isSelected(section.key, role, m.full_name) ? removeName(section.key, role, m.full_name) : addPicked(section.key, role, m))}
                                        className="w-4 h-4 rounded accent-accent-primary" />
                                      <span className={teamData?.[section.key]?.unavailable?.has(m.full_name) ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}>
                                        {m.full_name}
                                        {teamData?.[section.key]?.unavailable?.has(m.full_name) && <span className="ml-1 text-xs opacity-80">{tr('(zgłoszona nieobecność)')}</span>}
                                        {!m.email && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400" title={tr('Brak e-maila — ta osoba nie dostanie powiadomienia')}>⚠</span>}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                              {/* Ręczne dopisanie osoby do służby (spoza tabeli) */}
                              <div className="flex items-center gap-2 p-2 border-t border-gray-100 dark:border-gray-800">
                                <input value={manualText[key] || ''} onChange={(e) => setManualText((mm) => ({ ...mm, [key]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addManual(section.key, role); }}
                                  placeholder={tr('Dopisz osobę ręcznie…')} className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
                                <button onClick={() => addManual(section.key, role)} className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-primary text-white whitespace-nowrap">{tr('Dopisz')}</button>
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
                        placeholder={tr('Nazwa roli…')} className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-accent-primary" />
                      <button onClick={() => addRole(section.key)} className="text-sm px-3 py-1.5 rounded-lg bg-accent-primary text-white">{tr('Dodaj')}</button>
                      <button onClick={() => { setAddingRoleFor(null); setNewRole(''); }} className="text-sm px-2 py-1.5 text-gray-400 hover:text-gray-600">{tr('Anuluj')}</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingRoleFor(section.key); setNewRole(''); }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-primary hover:text-accent-secondary">
                      <Plus size={15} /> {tr('Dodaj rolę')}
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
