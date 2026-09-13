import React, { useState, useEffect, useRef, useCallback } from 'react';
import Spinner from '../../components/Spinner';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ChevronUp, ChevronDown, Check, UserX, Send, Clock, X as XIcon, Download } from 'lucide-react';
import { toast } from '../../lib/toast';
import { CampusBadge, useCampusBadge } from '../../components/CampusBadge';
import { useT } from '../../i18n';
import { tr } from '../../i18n';
import { useScheduleAssignments } from '../../hooks/useScheduleAssignments';
import { getCachedUser } from '../../lib/supabase';

// Grafik nad WYDARZENIAMI (twardy switch z programów). Wiersze = wydarzenia danej służby:
// wydarzenie należy do służby, jeśli reguła event_type_teams (module_key, event_type) zawiera
// tę służbę, a w braku reguły — gdy to wydarzenie własnego modułu (module_key === teamType).
// Kolumny = role z team_roles(team_type). Zapis w events.assignments[teamType][field_key] (CSV);
// wysyłka/statusy przez silnik schedule_assignments po event_id (ten sam co zakładka „Służby").

// Mapowanie tabeli osób służby (zgodne z EventTeamsTab).
const TEAM_MEMBER_TABLE = {
  worship: 'worship_team', media: 'media_team', atmosfera: 'atmosfera_members',
  kids: 'kids_teachers', mc: 'custom_mc_members',
};
const memberTableFor = (teamType) => TEAM_MEMBER_TABLE[teamType] || `custom_${teamType}_members`;
const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// Hook do obliczania pozycji dropdowna
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  return coords;
}

// Multi-select dla tabeli grafiku
const TableMultiSelect = ({ options, value, onChange, absentMembers = [] }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.portal-multiselect')) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleSelection = (name, isAbsent) => {
    if (isAbsent) return;
    let newSelection;
    if (selectedItems.includes(name)) newSelection = selectedItems.filter(i => i !== name);
    else newSelection = [...selectedItems, name];
    onChange(newSelection.join(', '));
  };

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        className="w-full min-h-[32px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs cursor-pointer flex flex-wrap gap-1 items-center hover:border-accent-primary-light dark:hover:border-accent-primary-light transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px] italic">{t('Wybierz...')}</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light px-1.5 py-0.5 rounded text-[10px] border border-accent-primary-lighter dark:border-accent-primary-dark whitespace-nowrap">
              {item}
            </span>
          ))
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          className="portal-multiselect fixed z-[9999] w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left
          }}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 italic">{t('Brak osób w tej służbie')}</div>
          )}
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);
            return (
              <div
                key={person.id}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400 dark:decoration-gray-600' : ''}>
                  {person.full_name}
                </span>
                {isSelected && !isAbsent && <Check size={12} />}
                {isAbsent && <UserX size={12} className="text-red-300 dark:text-red-400" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

// Przycisk „Wyślij" + status akceptacji per wydarzenie (grafik nad wydarzeniami).
// Przypisania są już zsynchronizowane do schedule_assignments przy każdym wyborze osoby
// (createAssignment/removeEventAssignment z event_id), więc tu tylko wysyłamy i pokazujemy status.
function EventSendCell({ eventId, teamType, assignments, onSent }) {
  const [loading, setLoading] = useState(false);
  const rows = (assignments || []).filter((a) => a.event_id === eventId && a.team_type === teamType);
  const accepted = rows.filter((a) => a.status === 'accepted').length;
  const rejected = rows.filter((a) => a.status === 'rejected').length;
  const pending = rows.filter((a) => a.status === 'pending').length;
  // „Do wysłania" = oczekujące, którym jeszcze nie wysłano maila.
  const toSend = rows.filter((a) => a.status === 'pending' && !a.email_sent_at && a.assigned_email).length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={async () => { setLoading(true); try { await onSent(); } finally { setLoading(false); } }}
        disabled={loading}
        title={toSend ? 'Wyślij zaproszenia (mail + push) do przypisanych osób' : 'Brak nowych osób do powiadomienia'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${loading ? 'opacity-60' : ''} ${toSend ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
        <Send size={12} /> {loading ? '...' : toSend ? `Wyślij (${toSend})` : 'Wyślij'}
      </button>
      {rows.length > 0 && (
        <span className="inline-flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          {accepted > 0 && <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400"><Check size={11} />{accepted}</span>}
          {pending > 0 && <span className="inline-flex items-center gap-0.5 text-amber-500"><Clock size={11} />{pending}</span>}
          {rejected > 0 && <span className="inline-flex items-center gap-0.5 text-red-500"><XIcon size={11} />{rejected}</span>}
        </span>
      )}
    </div>
  );
}

// Główny komponent grafiku
export default function ScheduleTab({ moduleKey, moduleName }) {
  const t = useT();
  const { getCampus } = useCampusBadge();
  const teamType = moduleKey;
  const memberTableName = memberTableFor(teamType);
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [typeTeams, setTypeTeams] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [loading, setLoading] = useState(true);

  const { assignments: schedAssignments, fetchAssignmentsForEvents, createAssignment, removeEventAssignment, sendInvitesForEvent } = useScheduleAssignments();

  useEffect(() => {
    const ids = events.map((e) => e.id).filter(Boolean);
    if (ids.length) fetchAssignmentsForEvents(ids);
  }, [events, fetchAssignmentsForEvents]);

  useEffect(() => {
    fetchData();
  }, [moduleKey]);

  // Czy wydarzenie należy do tej służby (spójne z zakładką „Służby" na wydarzeniu).
  // Priorytet: override per wydarzenie (events.team_types, CSV) → reguła typu → moduł-służba.
  const includesThisTeam = useCallback((ev) => {
    if (ev.team_types != null) return csvNames(ev.team_types).includes(teamType);
    const rule = (typeTeams || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type === ev.event_type);
    if (rule && Array.isArray(rule.teams) && rule.teams.length) return rule.teams.includes(teamType);
    return (ev.module_key || '') === teamType; // brak reguły → służba = moduł wydarzenia
  }, [typeTeams, teamType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Reguły służb wg typu (żeby grafik pokazał też wydarzenia z INNYCH modułów, gdzie ta służba służy).
      let rules = [];
      try {
        const { data: ts } = await supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle();
        rules = ts?.value ? (typeof ts.value === 'string' ? JSON.parse(ts.value) : ts.value) : [];
      } catch { rules = []; }
      setTypeTeams(Array.isArray(rules) ? rules : []);

      // Wszystkie wydarzenia (grupujemy po miesiącach, jak dawniej programy).
      const { data: evData } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });
      setEvents(evData || []);

      // Osoby służby (obsługa braku tabeli).
      const { data: membersData, error: membersError } = await supabase
        .from(memberTableName)
        .select('*')
        .order('full_name');
      if (membersError && membersError.code === '42P01') setMembers([]);
      else setMembers(membersData || []);

      // Role służby.
      const { data: rolesData } = await supabase
        .from('team_roles')
        .select('*')
        .eq('team_type', teamType)
        .eq('is_active', true)
        .order('display_order');
      setRoles(rolesData || []);

      // Przypisania osób do ról (kto do której roli).
      const { data: memberRolesData } = await supabase
        .from('team_member_roles')
        .select('*')
        .eq('member_table', memberTableName);
      setMemberRoles(memberRolesData || []);
    } catch (err) {
      console.error('Błąd pobierania danych grafiku:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tylko wydarzenia tej służby.
  const teamEvents = events.filter(includesThisTeam);

  // Grupowanie po miesiącach
  const groupedEvents = teamEvents.reduce((acc, ev) => {
    if (!ev.date) return acc;
    const date = new Date(ev.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedEvents).sort().reverse();

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    return new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Zapis pola grafiku w events.assignments[teamType]; jednocześnie synchronizacja do schedule_assignments.
  const writeAssignments = async (eventId, updater) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const teamData = { ...(ev.assignments?.[teamType] || {}) };
    updater(teamData);
    const updatedAssignments = { ...(ev.assignments || {}), [teamType]: teamData };
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, assignments: updatedAssignments } : e));
    await supabase.from('events').update({ assignments: updatedAssignments }).eq('id', eventId);
  };

  const updateRole = async (eventId, roleKey, roleLabel, value) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const before = csvNames(ev.assignments?.[teamType]?.[roleKey]);
    const after = csvNames(value);
    const added = after.filter((n) => !before.includes(n));
    const removed = before.filter((n) => !after.includes(n));

    await writeAssignments(eventId, (teamData) => { teamData[roleKey] = after.join(', '); });

    try {
      const me = await getCachedUser();
      for (const name of added) {
        const m = members.find((x) => x.full_name === name);
        await createAssignment({
          eventId, teamType, roleKey, roleLabel,
          assignedName: name, assignedEmail: m?.email || null,
          assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || 'Administrator',
          isSelfAssignment: !!(me?.email && m?.email && me.email.toLowerCase() === m.email.toLowerCase()),
        });
      }
      for (const name of removed) {
        await removeEventAssignment(eventId, teamType, roleKey, name);
      }
      if (added.length || removed.length) await fetchAssignmentsForEvents(teamEvents.map((e) => e.id).filter(Boolean));
    } catch (e) {
      toast.error(e.message || 'Błąd zapisu przypisania');
    }
  };

  const updateNotes = async (eventId, value) => {
    await writeAssignments(eventId, (teamData) => { teamData.notatki = value; });
  };

  const updateAbsence = async (eventId, value) => {
    await writeAssignments(eventId, (teamData) => { teamData.absencja = value; });
  };

  // Eksport widocznego grafiku (wszystkie wydarzenia tej służby) do CSV.
  const exportCsv = () => {
    const header = ['Data', 'Wydarzenie', ...columns.map((c) => c.label), 'Absencja', 'Notatki'];
    const rows = teamEvents.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map((ev) => {
      const td = ev.assignments?.[teamType] || {};
      return [formatDateShort(ev.date), ev.title || '', ...columns.map((c) => td[c.key] || ''), td.absencja || '', td.notatki || ''];
    });
    const esc = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `grafik-${teamType}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const sendForEvent = async (eventId) => {
    const res = await sendInvitesForEvent(eventId, teamType);
    if (res?.success) {
      if (res.sent > 0) toast.success(`Wysłano powiadomienia: ${res.sent}${res.failed ? `, niepowodzeń: ${res.failed}` : ''}`);
      else if (res.emailReady === false) toast.error(res.error || 'Brak konfiguracji e-mail na serwerze.');
      else toast.info('Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).');
    } else {
      toast.error(res?.error || 'Nie udało się wysłać powiadomień.');
    }
    await fetchAssignmentsForEvents(teamEvents.map((e) => e.id).filter(Boolean));
  };

  // Kolumny na podstawie ról
  const columns = roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : [{ key: 'osoba', label: t('Osoba'), roleId: null }];

  // Filtrowanie osób według roli
  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) return members;
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));
    if (assignedMemberIds.length === 0) return members;
    return members.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <Spinner size={32} className="mx-auto" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Grafik
        </h2>
        {teamEvents.length > 0 && (
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Download size={15} /> Eksport CSV
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('Brak członków w zespole')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {tr('Najpierw dodaj członków w zakładce "Służby"')}
          </p>
        </div>
      ) : sortedMonths.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('Brak wydarzeń')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Dodaj wydarzenia w tym module albo przypisz tę służbę do typu wydarzenia w Ustawieniach.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMonths.map(monthKey => {
            const isExpanded = expandedMonths[monthKey];
            return (
              <div key={monthKey} className={`bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}>
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className={`w-full px-6 py-4 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 flex justify-between items-center transition border-b border-gray-100 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
                >
                  <span className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
                  {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400"/> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400"/>}
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto pb-4">
                    <table className="w-full text-left border-collapse min-w-max">
                      <thead>
                        <tr className="bg-gray-50/50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                          <th className="p-3 font-semibold w-24 min-w-[90px]">{t('Data')}</th>
                          {columns.map(col => (
                            <th key={col.key} className="p-3 font-semibold min-w-[130px]">{col.label}</th>
                          ))}
                          <th className="p-3 font-semibold min-w-[130px] text-red-500 dark:text-red-400">Absencja</th>
                          <th className="p-3 font-semibold min-w-[150px]">Notatki</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700 relative">
                        {groupedEvents[monthKey]
                          .sort((a, b) => new Date(a.date) - new Date(b.date))
                          .map((ev) => {
                          const absentList = csvNames(ev.assignments?.[teamType]?.absencja);
                          return (
                            <tr key={ev.id} className="hover:bg-white/60 dark:hover:bg-gray-700/30 transition relative">
                              <td className="p-3 font-medium text-gray-700 dark:text-gray-300 text-xs">
                                <div className="flex flex-col gap-1.5 items-start">
                                  <span className="font-mono">{formatDateShort(ev.date)}</span>
                                  {ev.title && <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">{ev.title}</span>}
                                  <CampusBadge campus={getCampus(ev.campus_id)} />
                                  <EventSendCell
                                    eventId={ev.id}
                                    teamType={teamType}
                                    assignments={schedAssignments}
                                    onSent={() => sendForEvent(ev.id)}
                                  />
                                </div>
                              </td>
                              {columns.map(col => (
                                <td key={col.key} className="p-2 relative">
                                  <TableMultiSelect
                                    options={getMembersForRole(col.roleId)}
                                    value={ev.assignments?.[teamType]?.[col.key] || ''}
                                    onChange={(val) => updateRole(ev.id, col.key, col.label, val)}
                                    absentMembers={absentList}
                                  />
                                </td>
                              ))}
                              <td className="p-2 relative">
                                <TableMultiSelect
                                  options={members}
                                  value={ev.assignments?.[teamType]?.absencja || ''}
                                  onChange={(val) => updateAbsence(ev.id, val)}
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-accent-primary-light dark:focus:border-accent-primary-light text-xs p-1 outline-none transition placeholder-gray-300 dark:placeholder-gray-600 text-gray-700 dark:text-gray-300"
                                  placeholder="Wpisz..."
                                  defaultValue={ev.assignments?.[teamType]?.notatki || ''}
                                  onBlur={(e) => updateNotes(ev.id, e.target.value)}
                                />
                              </td>
                            </tr>
                          );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
