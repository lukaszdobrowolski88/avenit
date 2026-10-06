import React, { useState, useEffect, useRef, useCallback } from 'react';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ChevronUp, ChevronDown, Check, UserX, Send, Clock, X as XIcon, Download, CalendarX, Users, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from '../../lib/toast';
import { CampusBadge, useCampusBadge } from '../../components/CampusBadge';
import { useT } from '../../i18n';
import { tr, appLocale } from '../../i18n';
import { useScheduleAssignments, patchEventAssignments, scheduleSaveErrorMessage } from '../../hooks/useScheduleAssignments';
import { eventInviteSummary } from '../../lib/scheduleBridge';
import { getCachedUser } from '../../lib/supabase';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';

// Grafik nad WYDARZENIAMI (twardy switch z programów). Wiersze = wydarzenia danej służby:
// wydarzenie należy do służby, jeśli reguła event_type_teams (module_key, event_type) zawiera
// tę służbę, a w braku reguły — gdy to wydarzenie własnego modułu (module_key === teamType).
// Kolumny = role z team_roles(team_type). Zapis w events.assignments[teamType][field_key] (CSV)
// WYŁĄCZNIE przez fn event-assignments-patch (atomowo, tylko zmienione pola — nie nadpisuje
// przypisań innych służb wpisanych w międzyczasie). Wysyłka/statusy przez silnik
// schedule_assignments po event_id (ten sam co zakładka „Służby").

// Mapowanie tabeli osób służby (zgodne z EventTeamsTab).
const TEAM_MEMBER_TABLE = {
  worship: 'worship_team', media: 'media_team', atmosfera: 'atmosfera_members',
  kids: 'kids_teachers', mc: 'custom_mc_members',
};
const memberTableFor = (teamType) => TEAM_MEMBER_TABLE[teamType] || `custom_${teamType}_members`;
const csvNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const pad2 = (n) => String(n).padStart(2, '0');
// Dzień/miesiąc LOKALNY (toISOString dawał UTC — między 00:00 a 02:00 „wczoraj”).
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Wąski ekran (telefon) → widok kart zamiast szerokiej tabeli.
function useIsNarrow(query = '(max-width: 767px)') {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [query]);
  return narrow;
}

// Hook do obliczania pozycji dropdowna
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 280;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
        // Lista nie może wyjść poza prawą krawędź ekranu (telefon).
        const listWidth = Math.max(rect.width, 224);
        const left = Math.max(8, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - listWidth - 8));

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left,
          width: listWidth,
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

// Multi-select dla tabeli grafiku (obsługa myszą, dotykiem i klawiaturą:
// Enter/Spacja/↓ otwiera, ↑/↓ przechodzi po osobach, Enter/Spacja zaznacza, Esc zamyka).
// unavailableMembers — zgłoszone nieobecności (volunteer_blockouts): ostrzeżenie, ale wybór możliwy
// (lider może wiedzieć więcej); absentMembers — ręczna nieobecność w grafiku: wybór zablokowany.
const TableMultiSelect = ({ options, value, onChange, absentMembers = [], unavailableMembers = [], label }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selectedItems = csvNames(value);

  const close = useCallback((focusTrigger) => {
    setIsOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.portal-multiselect')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Po otwarciu fokus na zaznaczonej (albo pierwszej) osobie — żeby dało się działać klawiaturą.
  useEffect(() => {
    if (!isOpen || !coords.width || !listRef.current) return;
    const sel = listRef.current.querySelector('[role="option"][aria-selected="true"]')
      || listRef.current.querySelector('[role="option"]');
    sel?.focus({ preventScroll: true });
  }, [isOpen, coords.width]);

  const toggleSelection = (name, isAbsent) => {
    if (isAbsent) return;
    const newSelection = selectedItems.includes(name)
      ? selectedItems.filter((i) => i !== name)
      : [...selectedItems, name];
    onChange(newSelection.join(', '));
  };

  const onListKeyDown = (e) => {
    const items = Array.from(listRef.current?.querySelectorAll('[role="option"]') || []);
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, idx + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, idx - 1)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
  };

  const summary = selectedItems.length ? selectedItems.join(', ') : t('Wybierz...');

  return (
    <div className="relative w-full">
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label ? `${label}: ${summary}` : summary}
        className="w-full min-h-[36px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-left cursor-pointer flex flex-wrap gap-1 items-center hover:border-accent-primary-light dark:hover:border-accent-primary-light focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 transition"
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !isOpen) { e.preventDefault(); setIsOpen(true); }
          else if (e.key === 'Escape' && isOpen) { e.preventDefault(); close(true); }
        }}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-500 dark:text-gray-400 text-xs">{t('Wybierz...')}</span>
        ) : (
          selectedItems.map((item, idx) => (
            <span key={idx} className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light px-1.5 py-0.5 rounded text-xs border border-accent-primary-lighter dark:border-accent-primary-dark whitespace-nowrap">
              {item}
            </span>
          ))
        )}
      </button>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label || undefined}
          onKeyDown={onListKeyDown}
          className="portal-multiselect fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-72 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: coords.width,
          }}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{t('Brak osób w tej służbie')}</div>
          )}
          {options.map((person) => {
            const isSelected = selectedItems.includes(person.full_name);
            const isAbsent = absentMembers.includes(person.full_name);
            const isUnavailable = !isAbsent && unavailableMembers.includes(person.full_name);
            return (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                aria-disabled={isAbsent || undefined}
                key={person.id}
                className={`w-full text-left px-3 py-2 min-h-[40px] text-[13px] flex items-center justify-between gap-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/40
                  ${isAbsent ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'cursor-pointer hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 text-gray-700 dark:text-gray-300'}
                  ${isSelected ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light font-medium' : ''}
                `}
                onClick={() => toggleSelection(person.full_name, isAbsent)}
              >
                <span className={isAbsent ? 'line-through decoration-gray-400 dark:decoration-gray-600' : isUnavailable ? 'text-red-600 dark:text-red-400' : ''}>
                  {person.full_name}
                  {isUnavailable && <span className="ml-1 text-xs opacity-80">({t('zgłoszona nieobecność')})</span>}
                  {!person.email && !isAbsent && (
                    <span className="ml-1 text-xs text-amber-700 dark:text-amber-400" title={tr('Brak e-maila — ta osoba nie dostanie powiadomienia')}>⚠</span>
                  )}
                </span>
                {isSelected && !isAbsent && <Check size={14} aria-hidden="true" />}
                {isAbsent && <UserX size={14} className="text-red-300 dark:text-red-400" aria-hidden="true" />}
                {isUnavailable && !isSelected && <CalendarX size={14} className="text-red-400" aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

// Przycisk „Powiadom" + status akceptacji per wydarzenie (grafik nad wydarzeniami).
// Przypisania są zsynchronizowane do schedule_assignments przy każdym wyborze osoby
// (createAssignment/removeEventAssignment z event_id), więc tu tylko wysyłamy i pokazujemy status.
// Wybór osoby NIE wysyła maila sam — dlatego przycisk jest wyraźny i pokazuje liczbę niewysłanych.
function EventSendCell({ eventId, teamType, assignments, onSent }) {
  const [loading, setLoading] = useState(false);
  const s = eventInviteSummary(assignments, eventId, teamType);
  const total = s.accepted + s.rejected + s.pending;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {s.toSend > 0 && (
        <Button
          size="sm"
          icon={Send}
          loading={loading}
          onClick={async () => { setLoading(true); try { await onSent(); } finally { setLoading(false); } }}
          title={tr('Wyślij zaproszenia (e-mail i powiadomienie w aplikacji) osobom, które jeszcze ich nie dostały')}
          className="whitespace-nowrap"
        >
          {tr('Powiadom ({n})', { n: s.toSend })}
        </Button>
      )}
      {total > 0 && (
        <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          {s.accepted > 0 && (
            <span className="inline-flex items-center gap-0.5 text-green-700 dark:text-green-400" title={tr('Potwierdzone: {n}', { n: s.accepted })} aria-label={tr('Potwierdzone: {n}', { n: s.accepted })}>
              <Check size={12} aria-hidden="true" />{s.accepted}
            </span>
          )}
          {s.pending > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400" title={tr('Czeka na odpowiedź: {n}', { n: s.pending })} aria-label={tr('Czeka na odpowiedź: {n}', { n: s.pending })}>
              <Clock size={12} aria-hidden="true" />{s.pending}
            </span>
          )}
          {s.rejected > 0 && (
            <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400" title={tr('Odmówiło: {n}', { n: s.rejected })} aria-label={tr('Odmówiło: {n}', { n: s.rejected })}>
              <XIcon size={12} aria-hidden="true" />{s.rejected}
            </span>
          )}
        </span>
      )}
      {s.noEmail.length > 0 && (
        <span
          className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
          title={tr('Bez e-maila — nie dostaną powiadomienia: {names}', { names: s.noEmail.join(', ') })}
        >
          <AlertTriangle size={12} aria-hidden="true" /> {tr('Bez e-maila: {names}', { names: s.noEmail.join(', ') })}
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
  const narrow = useIsNarrow();
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [typeTeams, setTypeTeams] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState({});
  // Zgłoszone nieobecności osób służby (fn team-availability): [{ name, start_date, end_date }].
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bulkSending, setBulkSending] = useState(null); // monthKey
  const hintShown = useRef(false);
  const saveSeq = useRef({}); // { [eventId]: numer ostatniego zapisu } — starsze odpowiedzi nie nadpisują nowszych

  const { assignments: schedAssignments, fetchAssignmentsForEvents, createAssignment, removeEventAssignment, sendInvitesForEvent } = useScheduleAssignments();

  // Statusy zaproszeń pobieramy po zmianie ZBIORU wydarzeń (nie po każdej edycji komórki).
  const eventIdsKey = events.map((e) => e.id).filter(Boolean).join(',');
  useEffect(() => {
    const ids = eventIdsKey ? eventIdsKey.split(',') : [];
    if (ids.length) fetchAssignmentsForEvents(events.map((e) => e.id).filter(Boolean));
  }, [eventIdsKey, fetchAssignmentsForEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [moduleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Czy wydarzenie należy do tej służby (spójne z zakładką „Służby" na wydarzeniu).
  // 0) event ma już przypisania tej służby → zawsze pokaż (nie gub danych po zmianie typu/reguły).
  // Dalej priorytet: override per wydarzenie (events.team_types) → reguła typu → moduł-służba.
  const includesThisTeam = useCallback((ev) => {
    const asg = ev.assignments?.[teamType];
    if (asg && Object.entries(asg).some(([k, v]) => k !== 'notatki' && k !== 'absencja' && csvNames(v).length)) return true;
    if (ev.team_types != null) return csvNames(ev.team_types).includes(teamType);
    const rule = (typeTeams || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type === ev.event_type);
    if (rule && Array.isArray(rule.teams) && rule.teams.length) return rule.teams.includes(teamType);
    return (ev.module_key || '') === teamType; // brak reguły → służba = moduł wydarzenia
  }, [typeTeams, teamType]);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // Reguły służb wg typu (żeby grafik pokazał też wydarzenia z INNYCH modułów, gdzie ta służba służy).
      let rules = [];
      try {
        const { data: ts } = await supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle();
        rules = ts?.value ? (typeof ts.value === 'string' ? JSON.parse(ts.value) : ts.value) : [];
      } catch { rules = []; }
      setTypeTeams(Array.isArray(rules) ? rules : []);

      // Wszystkie wydarzenia (grupujemy po miesiącach, jak dawniej programy).
      const { data: evData, error: evError } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });
      if (evError) throw evError;
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
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // Tylko wydarzenia tej służby.
  const teamEvents = events.filter(includesThisTeam);
  const teamEventIds = () => teamEvents.map((e) => e.id).filter(Boolean);

  // Nieobecności dla zakresu dat wydarzeń grafiku (od dziś — przeszłości nie układamy).
  const availRange = (() => {
    const today = localDay();
    const dates = teamEvents.map((e) => String(e.date || '').slice(0, 10)).filter((d) => d >= today).sort();
    return dates.length ? `${dates[0]}|${dates[dates.length - 1]}` : '';
  })();
  useEffect(() => {
    if (!availRange) { setAvailability([]); return; }
    const [from, to] = availRange.split('|');
    supabase.functions.invoke('team-availability', { body: { team: teamType, from, to } })
      .then(({ data }) => setAvailability(Array.isArray(data?.blockouts) ? data.blockouts : []))
      .catch(() => setAvailability([]));
  }, [availRange, teamType]);
  const unavailableOn = (date) => {
    const d = String(date || '').slice(0, 10);
    return [...new Set(availability.filter((b) => b.start_date <= d && d <= b.end_date).map((b) => b.name))];
  };

  // Grupowanie po miesiącach
  const groupedEvents = teamEvents.reduce((acc, ev) => {
    if (!ev.date) return acc;
    const date = new Date(ev.date);
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedEvents).sort().reverse();

  useEffect(() => {
    const currentMonthKey = localDay().slice(0, 7);
    setExpandedMonths(prev => ({ ...prev, [currentMonthKey]: true }));
  }, []);

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const formatMonthName = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  };

  const formatDateShort = (dateString) => {
    return new Date(dateString).toLocaleDateString(appLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Ustaw pola sekcji tej służby w lokalnym stanie wydarzenia.
  const setTeamFields = (eventId, fields) => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const team = { ...(e.assignments?.[teamType] || {}) };
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) delete team[k]; else team[k] = v;
      }
      return { ...e, assignments: { ...(e.assignments || {}), [teamType]: team } };
    }));
  };

  // Atomowy zapis wybranych pól grafiku tej służby (fn event-assignments-patch).
  // Optymistycznie w UI; po odpowiedzi stan z serwera (z cudzymi zmianami), przy błędzie —
  // przywrócenie poprzednich wartości i komunikat. Zwraca true/false.
  const patchTeam = async (eventId, changes) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return false;
    const prevTeam = ev.assignments?.[teamType] || {};
    const previous = Object.fromEntries(Object.keys(changes).map((k) => [k, k in prevTeam ? prevTeam[k] : undefined]));
    const seq = (saveSeq.current[eventId] || 0) + 1;
    saveSeq.current[eventId] = seq;
    setTeamFields(eventId, changes);

    const ops = Object.entries(changes).map(([key, value]) => ({ team: teamType, key, value: value ?? null }));
    const { assignments, error } = await patchEventAssignments(eventId, ops);
    const latest = saveSeq.current[eventId] === seq;
    if (error) {
      if (latest) setTeamFields(eventId, previous);
      toast.error(scheduleSaveErrorMessage(error));
      return false;
    }
    if (latest && assignments) {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, assignments } : e)));
    }
    return true;
  };

  const updateRole = async (eventId, roleKey, roleLabel, value) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const before = csvNames(ev.assignments?.[teamType]?.[roleKey]);
    const after = csvNames(value);
    const added = after.filter((n) => !before.includes(n));
    const removed = before.filter((n) => !after.includes(n));
    if (!added.length && !removed.length) return;

    if (!await patchTeam(eventId, { [roleKey]: after.join(', ') })) return;

    // Synchronizacja z silnikiem zaproszeń. Gdy się nie uda, cofamy zmianę w siatce —
    // inaczej „Powiadom" zaprosiłby osobę, którą właśnie zdjęto (albo pominął dodaną).
    const failedAdd = [];
    const failedRemove = [];
    let me = null;
    try { me = await getCachedUser(); } catch { me = null; }
    for (const name of added) {
      const m = members.find((x) => x.full_name === name);
      const res = await createAssignment({
        eventId, teamType, roleKey, roleLabel,
        assignedName: name, assignedEmail: m?.email || null,
        assignedByEmail: me?.email || null, assignedByName: me?.email?.split('@')[0] || 'Administrator',
        isSelfAssignment: !!(me?.email && m?.email && me.email.toLowerCase() === m.email.toLowerCase()),
      });
      if (!res?.success) failedAdd.push(name);
    }
    for (const name of removed) {
      const res = await removeEventAssignment(eventId, teamType, roleKey, name);
      if (!res?.success) failedRemove.push(name);
    }

    if (failedAdd.length || failedRemove.length) {
      const corrected = [...after.filter((n) => !failedAdd.includes(n)), ...failedRemove];
      await patchTeam(eventId, { [roleKey]: corrected.join(', ') });
      toast.error(tr('Nie udało się zmienić przydziału: {names}. Sprawdź, czy masz uprawnienia do edycji grafiku, i spróbuj ponownie.', {
        names: [...failedAdd, ...failedRemove].join(', '),
      }));
    } else if (added.length && !hintShown.current) {
      const withEmail = added.some((n) => members.find((x) => x.full_name === n)?.email);
      if (withEmail) {
        hintShown.current = true;
        toast.info(tr('Zapisano w grafiku. Aby powiadomić osoby, kliknij „Powiadom” przy dacie.'));
      }
    }
    await fetchAssignmentsForEvents(teamEventIds());
  };

  // Notatki: zapis tylko przy realnej zmianie (dawniej każde wyjście z pola nadpisywało grafik).
  const updateNotes = async (eventId, value) => {
    const ev = events.find((e) => e.id === eventId);
    const current = ev?.assignments?.[teamType]?.notatki || '';
    if (!ev || value === current) return;
    await patchTeam(eventId, { notatki: value });
  };

  const updateAbsence = async (eventId, value) => {
    const ev = events.find((e) => e.id === eventId);
    const current = ev?.assignments?.[teamType]?.absencja || '';
    if (!ev || csvNames(value).join(', ') === csvNames(current).join(', ')) return;
    await patchTeam(eventId, { absencja: value });
  };

  // Eksport widocznego grafiku (wszystkie wydarzenia tej służby) do CSV.
  const exportCsv = () => {
    const header = [tr('Data'), tr('Wydarzenie'), ...columns.map((c) => c.label), tr('Nieobecni'), tr('Notatki')];
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

  // Wysyłka zaproszeń dla jednego albo kilku wydarzeń (cały miesiąc) — jeden zbiorczy komunikat.
  const sendForEvents = async (eventIds) => {
    let sent = 0, failed = 0, errorMsg = null, notConfigured = false;
    for (const id of eventIds) {
      const res = await sendInvitesForEvent(id, teamType);
      if (res?.success) { sent += res.sent || 0; failed += res.failed || 0; continue; }
      if (res?.emailReady === false) { notConfigured = true; break; }
      errorMsg = res?.error || 'error';
    }
    if (notConfigured) toast.error(tr('Wysyłka e-maili nie jest skonfigurowana. Skontaktuj się z administratorem.'));
    else if (sent > 0) toast.success(failed ? tr('Wysłano powiadomienia: {sent}, niepowodzeń: {failed}', { sent, failed }) : tr('Wysłano powiadomienia: {sent}', { sent }));
    else if (failed > 0 || errorMsg) toast.error(tr('Nie udało się wysłać powiadomień.'));
    else toast.info(tr('Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).'));
    await fetchAssignmentsForEvents(teamEventIds());
  };

  const sendForMonth = async (monthKey, ids) => {
    setBulkSending(monthKey);
    try { await sendForEvents(ids); } finally { setBulkSending(null); }
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
    return <Spinner center />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={tr('Nie udało się wczytać grafiku')}
        subtitle={tr('Sprawdź połączenie z internetem i spróbuj ponownie.')}
        action={<Button variant="outline" icon={RefreshCw} onClick={fetchData}>{tr('Spróbuj ponownie')}</Button>}
      />
    );
  }

  // ── Wspólne elementy wiersza (tabela na komputerze / karta na telefonie) ──
  const dateInfo = (ev, unavailableList) => (
    <div className="flex flex-col gap-1.5 items-start text-xs">
      <span className="tabular-nums font-semibold text-gray-800 dark:text-gray-100 text-[13px]">{formatDateShort(ev.date)}</span>
      {ev.title && <span className="text-xs text-gray-600 dark:text-gray-400 font-normal">{ev.title}</span>}
      <CampusBadge campus={getCampus(ev.campus_id)} />
      {unavailableList.length > 0 && (
        <span className="inline-flex items-start gap-1 text-xs text-red-600 dark:text-red-400 max-w-[200px]" title={t('Zgłoszone nieobecności')}>
          <CalendarX size={12} className="shrink-0 mt-px" aria-hidden="true" />
          <span>{unavailableList.join(', ')}</span>
        </span>
      )}
      <EventSendCell
        eventId={ev.id}
        teamType={teamType}
        assignments={schedAssignments}
        onSent={() => sendForEvents([ev.id])}
      />
    </div>
  );

  const roleSelect = (ev, col, absentList, unavailableList) => (
    <TableMultiSelect
      label={col.label}
      options={getMembersForRole(col.roleId)}
      value={ev.assignments?.[teamType]?.[col.key] || ''}
      onChange={(val) => updateRole(ev.id, col.key, col.label, val)}
      absentMembers={absentList}
      unavailableMembers={unavailableList}
    />
  );

  const absenceSelect = (ev) => (
    <TableMultiSelect
      label={tr('Nieobecni')}
      options={members}
      value={ev.assignments?.[teamType]?.absencja || ''}
      onChange={(val) => updateAbsence(ev.id, val)}
    />
  );

  const notesInput = (ev) => {
    const notes = ev.assignments?.[teamType]?.notatki || '';
    return (
      <input
        key={`${ev.id}:${notes}`}
        aria-label={tr('Notatki')}
        className="w-full bg-transparent border-b border-gray-200 dark:border-gray-700 md:border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-accent-primary-light dark:focus:border-accent-primary-light text-[13px] p-1.5 outline-none transition placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300"
        placeholder={tr('Wpisz...')}
        defaultValue={notes}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={(e) => updateNotes(ev.id, e.target.value)}
      />
    );
  };

  const legend = (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-4">
      <span className="inline-flex items-center gap-1"><Check size={12} className="text-green-700 dark:text-green-400" aria-hidden="true" /> {tr('potwierdzone')}</span>
      <span className="inline-flex items-center gap-1"><Clock size={12} className="text-amber-700 dark:text-amber-400" aria-hidden="true" /> {tr('czeka na odpowiedź')}</span>
      <span className="inline-flex items-center gap-1"><XIcon size={12} className="text-red-600 dark:text-red-400" aria-hidden="true" /> {tr('odmowa')}</span>
      <span className="inline-flex items-center gap-1"><AlertTriangle size={12} className="text-amber-700 dark:text-amber-400" aria-hidden="true" /> {tr('brak e-maila — bez powiadomienia')}</span>
    </p>
  );

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {tr('Grafik')}
        </h2>
        {teamEvents.length > 0 && (
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Download size={15} aria-hidden="true" /> {tr('Eksport CSV')}
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} title={t('Brak członków w zespole')} subtitle={tr('Najpierw dodaj członków w zakładce "Służby"')} />
      ) : sortedMonths.length === 0 ? (
        <EmptyState icon={Calendar} title={t('Brak wydarzeń')} subtitle={tr('Dodaj wydarzenia w tym module albo przypisz tę służbę do typu wydarzenia w Ustawieniach.')} />
      ) : (
        <div className="space-y-4">
          {legend}
          {sortedMonths.map(monthKey => {
            const isExpanded = expandedMonths[monthKey];
            const monthEvents = groupedEvents[monthKey].slice().sort((a, b) => new Date(a.date) - new Date(b.date));
            const toSendIds = monthEvents.filter((ev) => eventInviteSummary(schedAssignments, ev.id, teamType).toSend > 0).map((ev) => ev.id);
            const toSendCount = monthEvents.reduce((acc, ev) => acc + eventInviteSummary(schedAssignments, ev.id, teamType).toSend, 0);
            return (
              <div key={monthKey} className={`bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm relative z-0 transition-all duration-300 ${isExpanded ? 'mb-8' : 'mb-0'}`}>
                <button
                  onClick={() => toggleMonth(monthKey)}
                  aria-expanded={!!isExpanded}
                  className={`w-full px-4 sm:px-6 py-4 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 flex justify-between items-center gap-2 transition border-b border-gray-100 dark:border-gray-700 ${isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
                >
                  <span className="font-bold text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wider">{formatMonthName(monthKey)}</span>
                  <span className="inline-flex items-center gap-2">
                    {!isExpanded && toSendCount > 0 && (
                      <span className="text-xs font-medium text-accent-primary">{tr('Do powiadomienia: {n}', { n: toSendCount })}</span>
                    )}
                    {isExpanded ? <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" /> : <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />}
                  </span>
                </button>

                {isExpanded && toSendCount > 0 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20">
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {tr('Nowe przypisania bez powiadomienia: {n}', { n: toSendCount })}
                    </span>
                    <Button size="sm" icon={Send} loading={bulkSending === monthKey} onClick={() => sendForMonth(monthKey, toSendIds)}>
                      {tr('Powiadom wszystkich ({n})', { n: toSendCount })}
                    </Button>
                  </div>
                )}

                {isExpanded && narrow && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {monthEvents.map((ev) => {
                      const absentList = csvNames(ev.assignments?.[teamType]?.absencja);
                      const unavailableList = unavailableOn(ev.date);
                      return (
                        <div key={ev.id} className="p-4 space-y-3">
                          {dateInfo(ev, unavailableList)}
                          <div className="grid grid-cols-1 gap-3">
                            {columns.map((col) => (
                              <div key={col.key}>
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{col.label}</div>
                                {roleSelect(ev, col, absentList, unavailableList)}
                              </div>
                            ))}
                            <div>
                              <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">{tr('Nieobecni')}</div>
                              {absenceSelect(ev)}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{tr('Notatki')}</div>
                              {notesInput(ev)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && !narrow && (
                  <DataTable flush className="pb-4 rounded-b-2xl" tableClassName="min-w-max">
                    <THead>
                      <tr>
                        {/* Kolumna daty przyklejona — po przewinięciu w prawo nadal wiadomo, która to niedziela. */}
                        <TH className="sticky left-0 z-[2] bg-gray-50 dark:bg-gray-800 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">{t('Data')}</TH>
                        {columns.map(col => (
                          <TH key={col.key} className="min-w-[150px]">{col.label}</TH>
                        ))}
                        <TH className="min-w-[150px] !text-red-500 dark:!text-red-400">{tr('Nieobecni')}</TH>
                        <TH className="min-w-[170px]">{tr('Notatki')}</TH>
                      </tr>
                    </THead>
                    <tbody className="relative">
                      {monthEvents.map((ev) => {
                        const absentList = csvNames(ev.assignments?.[teamType]?.absencja);
                        const unavailableList = unavailableOn(ev.date);
                        return (
                          <TR key={ev.id} className="relative">
                            <TD className="font-medium sticky left-0 z-[1] bg-white dark:bg-gray-800 align-top min-w-[150px] max-w-[220px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                              {dateInfo(ev, unavailableList)}
                            </TD>
                            {columns.map(col => (
                              <TD key={col.key} className="relative align-top">
                                {roleSelect(ev, col, absentList, unavailableList)}
                              </TD>
                            ))}
                            <TD className="relative align-top">
                              {absenceSelect(ev)}
                            </TD>
                            <TD className="align-top">
                              {notesInput(ev)}
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </DataTable>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
