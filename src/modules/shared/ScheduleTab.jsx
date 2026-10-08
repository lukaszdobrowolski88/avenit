import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { supabase, getCachedUser } from '../../lib/supabase';
import { ChevronDown, Check, UserX, Send, Clock, X as XIcon, Download, CalendarX, Users, Calendar, AlertTriangle, RefreshCw, Plus, MapPin, CircleDashed, Rows, Columns, Wand2, Copy, Bookmark, Printer, BellRing, CalendarPlus } from 'lucide-react';
import { toast } from '../../lib/toast';
import { useCampusBadge } from '../../components/CampusBadge';
import { useT, tr, appLocale } from '../../i18n';
import { useScheduleAssignments, patchEventAssignments, scheduleSaveErrorMessage } from '../../hooks/useScheduleAssignments';
import { eventIncludesTeam } from '../../lib/scheduleBridge';
import { useModuleLabel } from '../../hooks/useModuleLabel';
import { TH } from '../../components/ui/DataTable';
import { useCan } from '../../components/Can';
import { lineupOf, teamHistory, previousLineup, fillEmptyRoles, serviceStats, proposeLineups } from './schedule/lineup';
import { buildPrintHtml, openPrintWindow } from './schedule/printSchedule';
import ActionMenu from '../../components/ActionMenu';
import ProposalModal from './schedule/ProposalModal';
import TemplatesModal from './schedule/TemplatesModal';
import ReminderSettingsModal from './schedule/ReminderSettingsModal';
import MyServicesModal from './schedule/MyServicesModal';
import './scheduleGrid.css';
import '../../components/pickList.css';
import '../../components/toolbar.css';

// Grafik nad WYDARZENIAMI (twardy switch z programów). Wiersze = wydarzenia danej służby:
// wydarzenie należy do służby, jeśli reguła event_type_teams (module_key, event_type) zawiera
// tę służbę, a w braku reguły — gdy to wydarzenie własnego modułu (module_key === teamType).
// Kolumny = role z team_roles(team_type). Zapis w events.assignments[teamType][field_key] (CSV)
// WYŁĄCZNIE przez fn event-assignments-patch (atomowo, tylko zmienione pola — nie nadpisuje
// przypisań innych służb wpisanych w międzyczasie). Wysyłka/statusy przez silnik
// schedule_assignments po event_id (ten sam co zakładka „Służby").
//
// Układ: data + wydarzenie przyklejone z lewej, status/„Powiadom” z prawej, role przewijane
// w środku. Przy każdej osobie jej status (potwierdzone / czeka / odmowa / jeszcze nie
// powiadomiono). Osoby z nieobecnością (zgłoszoną w Dostępności albo wpisaną w kolumnie
// „Nieobecni”) są na liście wyboru zablokowane; gdy ktoś już przypisany zgłosi nieobecność,
// jego pigułka robi się czerwona (konflikt do rozwiązania).

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
// Data z API bywa „2026-10-18T00:00:00.000Z” — liczymy dzień z samego YYYY-MM-DD (bez strefy).
const dayKey = (v) => String(v || '').slice(0, 10);
const parseDay = (v) => { const [y, m, d] = dayKey(v).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const shortDay = (v) => { const [, m, d] = dayKey(v).split('-'); return `${d}.${m}`; };

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

// Tło karty, w której leży grafik → --sg-bg (tym kryją się przyklejone kolumny). Liczone
// z wyglądu, bo zależy od presetu/motywu; odświeżane po przełączeniu trybu ciemnego.
function useSurfaceBg(ref, ready) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return undefined;
    const apply = () => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) continue;
        const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
        if (parseFloat(a) >= 0.95) { el.style.setProperty('--sg-bg', `rgb(${r}, ${g}, ${b})`); return; }
      }
      el.style.removeProperty('--sg-bg');
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-preset'] });
    return () => mo.disconnect();
  }, [ref, ready]);
}

// Poziome przewijanie siatki + znaczniki krawędzi (cień przy przyklejonych kolumnach tylko,
// gdy coś się pod nie wsunęło).
function GridScroller({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      el.dataset.scrollStart = el.scrollLeft <= 1 ? '1' : '0';
      el.dataset.scrollEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 ? '1' : '0';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, []);
  return (
    <div ref={ref} className="sg-wrap overflow-x-auto custom-scrollbar pb-2" data-scroll-start="1" data-scroll-end="1">
      {children}
    </div>
  );
}

// Pozycja listy (position: fixed → współrzędne okna, bez scrollY).
function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return undefined;
    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownMaxHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
      // Lista nie może wyjść poza prawą krawędź ekranu (telefon).
      const listWidth = Math.min(Math.max(rect.width, 296), window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - listWidth - 8));
      setCoords({ top: rect.bottom + 4, bottom: window.innerHeight - rect.top + 4, left, width: listWidth, openUpward });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return coords;
}

// Status osoby w komórce — kolorowy jest tylko znak, pigułka zostaje neutralna (bez „tęczy”).
const STATUS = {
  accepted: { icon: Check, cls: 'text-green-700 dark:text-green-400', label: () => tr('potwierdzone') },
  pending: { icon: Clock, cls: 'text-amber-700 dark:text-amber-400', label: () => tr('czeka na odpowiedź') },
  rejected: { icon: XIcon, cls: 'text-red-600 dark:text-red-400', label: () => tr('odmowa') },
  draft: { icon: CircleDashed, cls: 'text-gray-400 dark:text-gray-500', label: () => tr('jeszcze nie powiadomiono') },
  noemail: { icon: AlertTriangle, cls: 'text-amber-700 dark:text-amber-400', label: () => tr('brak e-maila — bez powiadomienia') },
};

function PersonChip({ name, status = 'draft', conflict = null }) {
  const meta = STATUS[status] || STATUS.draft;
  const Icon = conflict ? CalendarX : meta.icon;
  const label = conflict || meta.label();
  return (
    <span
      className={`sg-chip ${status === 'rejected' && !conflict ? 'sg-chip--rejected' : ''} ${conflict ? 'sg-chip--conflict' : ''}`}
      title={`${name} — ${label}`}
    >
      <Icon size={12} strokeWidth={2.5} className={`shrink-0 ${conflict ? '' : meta.cls}`} aria-hidden="true" />
      <span className="sg-chip-name">{name}</span>
      <span className="sr-only">({label})</span>
    </span>
  );
}

function AwayChip({ name, reported, title }) {
  const Icon = reported ? CalendarX : UserX;
  return (
    <span className="sg-chip sg-chip--away" title={title}>
      <Icon size={12} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
      <span className="sg-chip-name">{name}</span>
    </span>
  );
}

// Wybór osób do komórki (mysz, dotyk, klawiatura: Enter/Spacja/↓ otwiera, ↑/↓ po osobach,
// Enter/Spacja zaznacza, Esc zamyka; przy dłuższej liście pole szukania).
//   blocked — Map(imię → powód): tej osoby nie da się DODAĆ (nieobecność); jeśli już jest
//             w komórce, da się ją zdjąć.
//   locked  — imiona pokazane jako zaznaczone i niezmienialne (kolumna „Nieobecni”: zgłoszone
//             w Dostępności).
//   hints   — Map(imię → podpowiedź), np. „też: Wokale”.
const PeoplePicker = ({ label, options, value, onChange, blocked, locked = [], lockedTitle, hints, renderChip, renderLocked }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);
  const selected = csvNames(value);
  const lockedSet = useMemo(() => new Set(locked), [locked]);
  const showSearch = options.length > 7;

  const close = useCallback((focusTrigger) => {
    setIsOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.portal-multiselect')) close(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  // Po otwarciu fokus w szukajce albo na zaznaczonej (pierwszej) osobie — żeby działała klawiatura.
  useEffect(() => {
    if (!isOpen || !coords.width) return;
    if (searchRef.current) { searchRef.current.focus({ preventScroll: true }); return; }
    const list = listRef.current;
    const sel = list?.querySelector('[role="option"][aria-selected="true"]:not([aria-disabled="true"])')
      || list?.querySelector('[role="option"]:not([aria-disabled="true"])');
    sel?.focus({ preventScroll: true });
  }, [isOpen, coords.width]);

  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    onChange(next.join(', '));
  };

  const enabledOptions = () => Array.from(listRef.current?.querySelectorAll('[role="option"]:not([aria-disabled="true"])') || []);
  const onKeyDown = (e) => {
    const items = enabledOptions();
    const idx = items.indexOf(document.activeElement);
    const inSearch = document.activeElement === searchRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); items[inSearch ? 0 : Math.min(items.length - 1, idx + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx <= 0 && searchRef.current) searchRef.current.focus(); else items[Math.max(0, idx - 1)]?.focus(); }
    else if (e.key === 'Enter' && inSearch) { e.preventDefault(); items[0]?.click(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
  };

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((p) => p.full_name.toLowerCase().includes(q)) : options;
  const lockedList = visible.filter((p) => lockedSet.has(p.full_name));
  const free = visible.filter((p) => !lockedSet.has(p.full_name) && !blocked?.has(p.full_name));
  const away = visible.filter((p) => !lockedSet.has(p.full_name) && blocked?.has(p.full_name));

  const renderOption = (person) => {
    const name = person.full_name;
    const isLocked = lockedSet.has(name);
    const isSel = isLocked || selected.includes(name);
    const reason = blocked?.get(name);
    const disabled = isLocked || (!!reason && !selected.includes(name));
    const hint = isLocked ? lockedTitle : reason || hints?.get(name) || (!person.email ? tr('brak e-maila') : '');
    return (
      <button
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isSel}
        aria-disabled={disabled || undefined}
        key={person.id ?? name}
        className="pick-opt text-gray-800 dark:text-gray-100"
        title={hint ? `${name} — ${hint}` : name}
        onClick={() => { if (!disabled) toggle(name); }}
      >
        <span className="pick-check" aria-hidden="true">{isSel && <Check size={12} strokeWidth={3} />}</span>
        <span className="truncate">{name}</span>
        {hint && <span className={`pick-opt-hint ${reason || isLocked ? 'pick-opt-hint--warn' : ''}`}>{hint}</span>}
      </button>
    );
  };

  const summary = [...locked, ...selected].join(', ') || tr('Dodaj');

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label ? `${label}: ${summary}` : summary}
        className="sg-cell"
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !isOpen) { e.preventDefault(); setIsOpen(true); }
          else if (e.key === 'Escape' && isOpen) { e.preventDefault(); close(true); }
        }}
      >
        {locked.map((n) => <React.Fragment key={`l:${n}`}>{renderLocked ? renderLocked(n) : n}</React.Fragment>)}
        {selected.map((n) => <React.Fragment key={n}>{renderChip(n)}</React.Fragment>)}
        {locked.length + selected.length === 0 && (
          <span className="sg-add"><Plus size={13} aria-hidden="true" />{tr('Dodaj')}</span>
        )}
      </button>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          ref={popRef}
          onKeyDown={onKeyDown}
          className="portal-multiselect pick-pop fixed z-[9999] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward ? { bottom: coords.bottom } : { top: coords.top }),
            left: coords.left,
            width: coords.width,
            maxHeight: 340,
          }}
        >
          {showSearch && (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Szukaj osoby…')}
              aria-label={tr('Szukaj osoby…')}
              className="pick-search bg-transparent text-gray-800 dark:text-gray-100"
            />
          )}
          <div ref={listRef} role="listbox" aria-multiselectable="true" aria-label={label || undefined} className="overflow-y-auto custom-scrollbar py-1">
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{tr('Brak osób w tej służbie')}</div>
            )}
            {options.length > 0 && visible.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{tr('Nikogo nie znaleziono')}</div>
            )}
            {lockedList.length > 0 && <div className="pick-section" role="presentation">{lockedTitle}</div>}
            {lockedList.map(renderOption)}
            {lockedList.length > 0 && free.length > 0 && <div className="pick-section" role="presentation">{tr('Pozostali')}</div>}
            {free.map(renderOption)}
            {away.length > 0 && <div className="pick-section" role="presentation">{tr('Niedostępni w tym dniu')}</div>}
            {away.map(renderOption)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// Podsumowanie statusów jednego wydarzenia (dla tej służby). Rozbija „czeka” na wysłane
// (czekają na odpowiedź) i jeszcze niewysłane (toSend — do „Powiadom”).
function summarize(assignments, eventId, teamType) {
  let accepted = 0, rejected = 0, waiting = 0, toSend = 0;
  const noEmail = [];
  for (const a of assignments || []) {
    if (a.event_id !== eventId || a.team_type !== teamType) continue;
    if (a.status === 'accepted') accepted++;
    else if (a.status === 'rejected') rejected++;
    else if (a.email_sent_at) waiting++;
    else if (a.assigned_email) toSend++;
    else if (!noEmail.includes(a.assigned_name)) noEmail.push(a.assigned_name);
  }
  return { accepted, rejected, waiting, toSend, noEmail };
}

// Kolumna „Status” (przyklejona z prawej): Powiadom + liczniki odpowiedzi + konflikty.
// Wybór osoby NIE wysyła maila sam — dlatego przycisk jest wyraźny i pokazuje liczbę niewysłanych.
function EventStatus({ summary: s, conflicts, onSend }) {
  const [loading, setLoading] = useState(false);
  const hasCounts = s.accepted || s.waiting || s.rejected || s.noEmail.length || conflicts.length;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {s.toSend > 0 && (
        <Button
          size="sm"
          icon={Send}
          loading={loading}
          onClick={async () => { setLoading(true); try { await onSend(); } finally { setLoading(false); } }}
          title={tr('Wyślij zaproszenia (e-mail i powiadomienie push) osobom, które jeszcze ich nie dostały')}
          className="whitespace-nowrap"
        >
          {tr('Powiadom ({n})', { n: s.toSend })}
        </Button>
      )}
      {hasCounts ? (
        <div className="sg-counts">
          {s.accepted > 0 && (
            <span className="text-green-700 dark:text-green-400" title={tr('Potwierdzone: {n}', { n: s.accepted })} aria-label={tr('Potwierdzone: {n}', { n: s.accepted })}>
              <Check size={13} strokeWidth={2.5} aria-hidden="true" />{s.accepted}
            </span>
          )}
          {s.waiting > 0 && (
            <span className="text-amber-700 dark:text-amber-400" title={tr('Czeka na odpowiedź: {n}', { n: s.waiting })} aria-label={tr('Czeka na odpowiedź: {n}', { n: s.waiting })}>
              <Clock size={13} strokeWidth={2.5} aria-hidden="true" />{s.waiting}
            </span>
          )}
          {s.rejected > 0 && (
            <span className="text-red-600 dark:text-red-400" title={tr('Odmówiło: {n}', { n: s.rejected })} aria-label={tr('Odmówiło: {n}', { n: s.rejected })}>
              <XIcon size={13} strokeWidth={2.5} aria-hidden="true" />{s.rejected}
            </span>
          )}
          {s.noEmail.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400" title={tr('Bez e-maila — nie dostaną powiadomienia: {names}', { names: s.noEmail.join(', ') })} aria-label={tr('Bez e-maila — nie dostaną powiadomienia: {names}', { names: s.noEmail.join(', ') })}>
              <AlertTriangle size={13} strokeWidth={2.5} aria-hidden="true" />{s.noEmail.length}
            </span>
          )}
          {conflicts.length > 0 && (
            <span className="text-red-600 dark:text-red-400" title={tr('Przypisani mimo nieobecności: {names}', { names: conflicts.join(', ') })} aria-label={tr('Przypisani mimo nieobecności: {names}', { names: conflicts.join(', ') })}>
              <CalendarX size={13} strokeWidth={2.5} aria-hidden="true" />{conflicts.length}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Główny komponent grafiku
export default function ScheduleTab({ moduleKey, moduleName }) {
  const t = useT();
  const { getCampus } = useCampusBadge();
  const teamType = moduleKey;
  const teamLabel = useModuleLabel(teamType, moduleName || '');
  const memberTableName = memberTableFor(teamType);
  const narrow = useIsNarrow();
  const rootRef = useRef(null);
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
  useSurfaceBg(rootRef, !loading);
  const [bulkSending, setBulkSending] = useState(null); // monthKey
  // Układ siatki: 'dates' (wiersze = wydarzenia) albo 'roles' (wiersze = role, kolumny = daty —
  // przy kilku niedzielach w miesiącu mieści się bez przewijania). Zapamiętany per służba.
  const viewKey = `schedule_view:${teamType}`;
  const [viewMode, setViewMode] = useState(() => { try { return localStorage.getItem(viewKey) === 'roles' ? 'roles' : 'dates'; } catch { return 'dates'; } });
  const changeView = (mode) => { setViewMode(mode); try { localStorage.setItem(viewKey, mode); } catch { /* prywatne okno */ } };
  // Zapisane składy (schedule_templates); null = tabela niedostępna (np. przed migracją) → bez funkcji.
  const [templates, setTemplates] = useState(null);
  const [reminderRaw, setReminderRaw] = useState(null);
  const [proposal, setProposal] = useState(null); // [{ eventId, label, picks, missing }]
  const [templatesFor, setTemplatesFor] = useState(null); // eventId
  const [reminderOpen, setReminderOpen] = useState(false);
  const [myServicesOpen, setMyServicesOpen] = useState(false);
  const canEditReminders = useCan('action:settings:manage_integrations');
  const hintShown = useRef(false);
  const expandInit = useRef(false);
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
  // Wspólny predykat z lib/scheduleBridge (ten sam w zakładce „Wydarzenia” modułu).
  const includesThisTeam = useCallback((ev) => eventIncludesTeam(ev, teamType, typeTeams), [typeTeams, teamType]);

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

      // Ustawienia automatycznych przypomnień (worker schedule-reminders).
      try {
        const { data: rs } = await supabase.from('app_settings').select('value').eq('key', 'schedule_reminders').maybeSingle();
        setReminderRaw(rs?.value ?? null);
      } catch { setReminderRaw(null); }
      loadTemplates();

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
  const today = localDay();

  // Nieobecności dla zakresu dat wydarzeń grafiku (od dziś — przeszłości nie układamy).
  const availRange = (() => {
    const dates = teamEvents.map((e) => dayKey(e.date)).filter((d) => d >= today).sort();
    return dates.length ? `${dates[0]}|${dates[dates.length - 1]}` : '';
  })();
  useEffect(() => {
    if (!availRange) { setAvailability([]); return; }
    const [from, to] = availRange.split('|');
    supabase.functions.invoke('team-availability', { body: { team: teamType, from, to } })
      .then(({ data }) => setAvailability(Array.isArray(data?.blockouts) ? data.blockouts : []))
      .catch(() => setAvailability([]));
  }, [availRange, teamType]);

  // Zgłoszone nieobecności w danym dniu: Map(imię → „17.10–19.10”).
  const reportedOn = (date) => {
    const d = dayKey(date);
    const out = new Map();
    for (const b of availability) {
      if (!(b.start_date <= d && d <= b.end_date) || out.has(b.name)) continue;
      out.set(b.name, b.start_date === b.end_date ? shortDay(b.start_date) : `${shortDay(b.start_date)}–${shortDay(b.end_date)}`);
    }
    return out;
  };

  // Grupowanie po miesiącach: najpierw bieżący i przyszłe (rosnąco), potem minione (od najnowszego).
  const groupedEvents = teamEvents.reduce((acc, ev) => {
    if (!ev.date) return acc;
    const key = dayKey(ev.date).slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});
  const currentMonth = today.slice(0, 7);
  const upcomingMonths = Object.keys(groupedEvents).filter((k) => k >= currentMonth).sort();
  const pastMonths = Object.keys(groupedEvents).filter((k) => k < currentMonth).sort().reverse();
  const nextEventId = teamEvents
    .filter((e) => dayKey(e.date) >= today)
    .sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))[0]?.id;

  // Domyślnie rozwinięty bieżący i następny miesiąc (raz, po wczytaniu danych).
  const monthsKey = `${upcomingMonths.join(',')}|${pastMonths.join(',')}`;
  useEffect(() => {
    if (expandInit.current || loading || monthsKey === '|') return;
    expandInit.current = true;
    const open = upcomingMonths.length ? upcomingMonths.slice(0, 2) : pastMonths.slice(0, 1);
    setExpandedMonths(Object.fromEntries(open.map((k) => [k, true])));
  }, [loading, monthsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const monthParts = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const name = new Date(year, month - 1).toLocaleDateString(appLocale(), { month: 'long' });
    return { name: name.replace(/^\p{L}/u, (c) => c.toUpperCase()), year };
  };

  const formatDateShort = (dateString) => parseDay(dateString).toLocaleDateString(appLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  const weekdayShort = (dateString) => parseDay(dateString).toLocaleDateString(appLocale(), { weekday: 'short' });

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

  // Zapis ról jednego wydarzenia: nextByRole = { roleKey: ['Imię', …] } (pełne nowe wartości).
  // Jeden atomowy patch grafiku + synchronizacja z silnikiem zaproszeń (schedule_assignments).
  // Używane przez komórkę, kopiowanie z poprzedniej niedzieli, szablony i propozycję obsady.
  // Zwraca { added, failed } (liczba dodanych osób / nieudanych zmian).
  const applyRoles = async (eventId, nextByRole, { quiet = false, refresh = true } = {}) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return { added: 0, failed: 0 };
    const diffs = Object.entries(nextByRole).map(([roleKey, names]) => {
      const before = csvNames(ev.assignments?.[teamType]?.[roleKey]);
      const after = [...new Set(names)];
      return { roleKey, after, added: after.filter((n) => !before.includes(n)), removed: before.filter((n) => !after.includes(n)) };
    }).filter((d) => d.added.length || d.removed.length);
    if (!diffs.length) return { added: 0, failed: 0 };

    if (!await patchTeam(eventId, Object.fromEntries(diffs.map((d) => [d.roleKey, d.after.join(', ')])))) return { added: 0, failed: diffs.length };

    // Synchronizacja z silnikiem zaproszeń. Gdy się nie uda, cofamy zmianę w siatce —
    // inaczej „Powiadom" zaprosiłby osobę, którą właśnie zdjęto (albo pominął dodaną).
    let me = null;
    try { me = await getCachedUser(); } catch { me = null; }
    const corrections = {};
    const failedNames = [];
    for (const d of diffs) {
      const roleLabel = columns.find((c) => c.key === d.roleKey)?.label || d.roleKey;
      const failedAdd = [];
      const failedRemove = [];
      for (const name of d.added) {
        const m = members.find((x) => x.full_name === name);
        const res = await createAssignment({
          eventId, teamType, roleKey: d.roleKey, roleLabel,
          assignedName: name, assignedEmail: m?.email || null,
          assignedByEmail: me?.email || null, assignedByName: me?.full_name || me?.email?.split('@')[0] || 'Administrator',
          isSelfAssignment: !!(me?.email && m?.email && me.email.toLowerCase() === m.email.toLowerCase()),
        });
        if (!res?.success) failedAdd.push(name);
      }
      for (const name of d.removed) {
        const res = await removeEventAssignment(eventId, teamType, d.roleKey, name);
        if (!res?.success) failedRemove.push(name);
      }
      if (failedAdd.length || failedRemove.length) {
        corrections[d.roleKey] = [...d.after.filter((n) => !failedAdd.includes(n)), ...failedRemove].join(', ');
        failedNames.push(...failedAdd, ...failedRemove);
      }
    }

    const addedNames = diffs.flatMap((d) => d.added).filter((n) => !failedNames.includes(n));
    if (Object.keys(corrections).length) {
      await patchTeam(eventId, corrections);
      toast.error(tr('Nie udało się zmienić przydziału: {names}. Sprawdź, czy masz uprawnienia do edycji grafiku, i spróbuj ponownie.', {
        names: failedNames.join(', '),
      }));
    } else if (!quiet && addedNames.length && !hintShown.current) {
      if (addedNames.some((n) => members.find((x) => x.full_name === n)?.email)) {
        hintShown.current = true;
        toast.info(tr('Zapisano w grafiku. Aby wysłać zaproszenia, kliknij „Powiadom” w kolumnie Status.'));
      }
    }
    if (refresh) await fetchAssignmentsForEvents(teamEventIds());
    return { added: addedNames.length, failed: failedNames.length };
  };

  const updateRole = (eventId, roleKey, value) => applyRoles(eventId, { [roleKey]: csvNames(value) });

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

  // Kolumny na podstawie ról
  const columns = roles.length > 0
    ? roles.map(role => ({ key: role.field_key, label: role.name, roleId: role.id }))
    : [{ key: 'osoba', label: t('Osoba'), roleId: null }];

  // Eksport widocznego grafiku (wszystkie wydarzenia tej służby) do CSV.
  const exportCsv = () => {
    const header = [tr('Data'), tr('Wydarzenie'), ...columns.map((c) => c.label), tr('Nieobecni'), tr('Notatki')];
    const rows = teamEvents.slice().sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date))).map((ev) => {
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
    let sent = 0, failed = 0, pushed = 0, errorMsg = null, notConfigured = false;
    for (const id of eventIds) {
      const res = await sendInvitesForEvent(id, teamType, teamLabel);
      if (res?.success) { sent += res.sent || 0; failed += res.failed || 0; pushed += res.pushed || 0; continue; }
      if (res?.emailReady === false) { notConfigured = true; break; }
      errorMsg = res?.error || 'error';
    }
    if (notConfigured) toast.error(tr('Wysyłka e-maili nie jest skonfigurowana. Skontaktuj się z administratorem.'));
    else if (sent > 0) {
      const base = failed ? tr('Wysłano powiadomienia: {sent}, niepowodzeń: {failed}', { sent, failed }) : tr('Wysłano powiadomienia: {sent}', { sent });
      toast.success(pushed ? `${base} ${tr('(push na telefon: {n})', { n: pushed })}` : base);
    } else if (pushed > 0) toast.info(tr('E-mail nie wyszedł, ale push dotarł do: {n}. Spróbuj „Powiadom” ponownie później.', { n: pushed }));
    else if (failed > 0 || errorMsg) toast.error(tr('Nie udało się wysłać powiadomień.'));
    else toast.info(tr('Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).'));
    await fetchAssignmentsForEvents(teamEventIds());
  };

  const sendForMonth = async (monthKey, ids) => {
    setBulkSending(monthKey);
    try { await sendForEvents(ids); } finally { setBulkSending(null); }
  };

  // Status osoby w komórce (z silnika schedule_assignments).
  const assignmentByKey = useMemo(() => {
    const m = new Map();
    for (const a of schedAssignments || []) {
      if (a.event_id && a.team_type === teamType) m.set(`${a.event_id}|${a.role_key}|${a.assigned_name}`, a);
    }
    return m;
  }, [schedAssignments, teamType]);
  const memberByName = useMemo(() => new Map(members.map((m) => [m.full_name, m])), [members]);
  const personStatus = (eventId, roleKey, name) => {
    const a = assignmentByKey.get(`${eventId}|${roleKey}|${name}`);
    if (!a) return memberByName.get(name) && !memberByName.get(name).email ? 'noemail' : 'draft';
    if (a.status === 'accepted') return 'accepted';
    if (a.status === 'rejected') return 'rejected';
    if (!a.assigned_email) return 'noemail';
    return a.email_sent_at ? 'pending' : 'draft';
  };

  // Filtrowanie osób według roli
  const getMembersForRole = (roleId) => {
    if (!roleId || memberRoles.length === 0) return members;
    const assignedMemberIds = memberRoles
      .filter(mr => mr.role_id === roleId)
      .map(mr => String(mr.member_id));
    if (assignedMemberIds.length === 0) return members;
    return members.filter(member => assignedMemberIds.includes(String(member.id)));
  };

  // Kontekst wiersza: kto nieobecny (i dlaczego), kto już w której roli, konflikty.
  const rowContext = (ev) => {
    const team = ev.assignments?.[teamType] || {};
    const manualAbsent = csvNames(team.absencja);
    const reported = reportedOn(ev.date);
    const blocked = new Map();
    for (const n of manualAbsent) blocked.set(n, tr('nieobecność'));
    for (const [n, range] of reported) if (!blocked.has(n)) blocked.set(n, tr('nieobecność {range}', { range }));
    const rolesOf = new Map();
    for (const c of columns) {
      for (const n of csvNames(team[c.key])) rolesOf.set(n, [...(rolesOf.get(n) || []), c.label]);
    }
    const conflicts = [...rolesOf.keys()].filter((n) => blocked.has(n));
    return { team, manualAbsent, reported, blocked, rolesOf, conflicts };
  };

  // ── Historia służby, statystyki i narzędzia obsady ──
  const roleKeys = columns.map((c) => c.key);
  const history = useMemo(
    () => teamHistory(events.filter(includesThisTeam), teamType, roleKeys),
    [events, includesThisTeam, teamType, roleKeys.join(',')] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const stats = useMemo(() => serviceStats(history), [history]);
  const colLabel = (key) => columns.find((c) => c.key === key)?.label || key;
  // Osoby przypisane do roli w zespole (Set) albo null — rola bez przypisań = każdy z zespołu.
  const roleMembers = (roleKey) => {
    const col = columns.find((c) => c.key === roleKey);
    if (!col?.roleId || !memberRoles.length) return null;
    const ids = memberRoles.filter((mr) => mr.role_id === col.roleId).map((mr) => String(mr.member_id));
    if (!ids.length) return null;
    return new Set(members.filter((m) => ids.includes(String(m.id))).map((m) => m.full_name));
  };
  const eventLabel = (ev) => `${shortDay(ev.date)} · ${ev.title || tr('Wydarzenie')}`;

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase.from('schedule_templates').select('*').eq('team_type', teamType).order('name');
      if (error) throw error;
      setTemplates((data || []).map((tpl) => {
        let lineup = tpl.lineup;
        if (typeof lineup === 'string') { try { lineup = JSON.parse(lineup); } catch { lineup = {}; } }
        return { ...tpl, lineup: lineup && typeof lineup === 'object' ? lineup : {} };
      }));
    } catch {
      setTemplates(null);
    }
  };

  // Wstawienie składu (poprzednia niedziela / szablon) do PUSTYCH ról, z pominięciem nieobecnych.
  const fillFrom = async (ev, source) => {
    const ctx = rowContext(ev);
    const { changes, skipped } = fillEmptyRoles(lineupOf(ctx.team, roleKeys), source, {
      blocked: ctx.blocked, allowedFor: roleMembers, teamNames: new Set(members.map((m) => m.full_name)),
    });
    const res = Object.keys(changes).length ? await applyRoles(ev.id, changes, { quiet: true }) : { added: 0 };
    const absent = [...new Set(skipped.filter((x) => x.reason === 'absent').map((x) => x.name))];
    const other = [...new Set(skipped.filter((x) => x.reason !== 'absent').map((x) => x.name))];
    const parts = [];
    if (res.added) parts.push(tr('Wstawiono osób: {n}.', { n: res.added }));
    if (absent.length) parts.push(tr('Pominięto nieobecnych: {names}.', { names: absent.join(', ') }));
    if (other.length) parts.push(tr('Pominięto (spoza zespołu albo roli): {names}.', { names: other.join(', ') }));
    if (!parts.length) parts.push(tr('Nic do wstawienia — te role są już obsadzone.'));
    if (res.added) toast.success(parts.join(' ')); else toast.info(parts.join(' '));
  };
  const copyPrevious = (ev) => {
    const prev = previousLineup(history, ev);
    if (prev) fillFrom(ev, prev.lineup);
  };

  const saveTemplate = async (ev, name) => {
    const lineup = lineupOf(rowContext(ev).team, roleKeys);
    const { error } = await supabase.from('schedule_templates').insert({ team_type: teamType, name, lineup });
    if (error) { toast.error(tr('Nie udało się zapisać składu.')); return; }
    toast.success(tr('Zapisano skład „{name}”.', { name }));
    await loadTemplates();
  };
  const deleteTemplate = async (tpl) => {
    const { error } = await supabase.from('schedule_templates').delete().eq('id', tpl.id);
    if (error) { toast.error(tr('Nie udało się usunąć składu.')); return; }
    await loadTemplates();
  };

  // Propozycja obsady (jedno wydarzenie albo cały miesiąc — tylko nadchodzące, tylko puste role).
  const openProposal = (evs) => {
    const targets = evs.filter((ev) => dayKey(ev.date) >= today).map((ev) => {
      const ctx = rowContext(ev);
      return { id: ev.id, date: ev.date, lineup: lineupOf(ctx.team, roleKeys), blocked: ctx.blocked };
    });
    if (!targets.length) { toast.info(tr('Propozycje dotyczą tylko nadchodzących wydarzeń.')); return; }
    const rolesSpec = columns.map((c) => { const set = roleMembers(c.key); return { key: c.key, candidates: set ? [...set] : null }; });
    const byId = new Map(evs.map((ev) => [ev.id, ev]));
    setProposal(proposeLineups({ targets, roles: rolesSpec, history })
      .filter((p) => p.picks.length || p.missing.length)
      .map((p) => ({
        eventId: p.eventId,
        label: eventLabel(byId.get(p.eventId)),
        picks: p.picks.map((x) => ({ ...x, roleLabel: colLabel(x.roleKey) })),
        missing: p.missing.map(colLabel),
      })));
  };
  const applyProposal = async (selected) => {
    let added = 0;
    for (const { eventId, changes } of selected) {
      const res = await applyRoles(eventId, changes, { quiet: true, refresh: false });
      added += res.added;
    }
    await fetchAssignmentsForEvents(teamEventIds());
    setProposal(null);
    if (added) toast.success(tr('Wstawiono osób: {n}. Sprawdź grafik i kliknij „Powiadom”.', { n: added }));
  };

  // Wydruk / PDF miesiąca w układzie „role × daty” (mieści się na A4).
  const printMonth = (monthKey, monthEvents) => {
    const { name, year } = monthParts(monthKey);
    const html = buildPrintHtml({
      title: `${teamLabel || tr('Grafik')} — ${name} ${year}`,
      subtitle: tr('Grafik służby'),
      events: monthEvents.map((ev) => ({
        date: shortDay(ev.date), weekday: weekdayShort(ev.date), time: ev.time ? String(ev.time).slice(0, 5) : '',
        title: ev.title || '', place: ev.location || '',
      })),
      rows: [
        ...columns.map((c) => ({ label: c.label, cells: monthEvents.map((ev) => csvNames(ev.assignments?.[teamType]?.[c.key])) })),
        { label: tr('Nieobecni'), kind: 'absent', cells: monthEvents.map((ev) => { const ctx = rowContext(ev); return [...new Set([...ctx.manualAbsent, ...ctx.reported.keys()])]; }) },
        { label: tr('Notatki'), kind: 'notes', cells: monthEvents.map((ev) => { const n = ev.assignments?.[teamType]?.notatki; return n ? [n] : []; }) },
      ],
      footer: tr('Wygenerowano {date} · Avenit', { date: new Date().toLocaleDateString(appLocale()) }),
    });
    if (!openPrintWindow(html)) toast.error(tr('Przeglądarka zablokowała okno wydruku — zezwól na wyskakujące okna dla tej strony.'));
  };

  const saveReminders = async (cfg) => {
    const { error } = await supabase.from('app_settings').upsert({ key: 'schedule_reminders', value: JSON.stringify(cfg) }, { onConflict: 'key' });
    if (error) { toast.error(tr('Nie udało się zapisać ustawień przypomnień.')); return false; }
    setReminderRaw(cfg);
    toast.success(tr('Zapisano ustawienia przypomnień.'));
    return true;
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

  // ── Komórki (tabela na komputerze / karta na telefonie) ──
  const roleSelect = (ev, col, ctx) => {
    // Podpowiedzi na liście: ile razy osoba służy w tym miesiącu + inna rola tego dnia.
    const monthKey = dayKey(ev.date).slice(0, 7);
    const options = getMembersForRole(col.roleId);
    const hints = new Map();
    for (const p of options) {
      const name = p.full_name;
      const n = stats.monthCount(name, monthKey);
      const others = (ctx.rolesOf.get(name) || []).filter((l) => l !== col.label);
      const parts = [];
      if (n) parts.push(tr('{n}× w mies.', { n }));
      if (others.length) parts.push(tr('też: {roles}', { roles: others.join(', ') }));
      if (parts.length) hints.set(name, parts.join(' · '));
    }
    return (
      <PeoplePicker
        label={col.label}
        options={options}
        value={ctx.team[col.key] || ''}
        onChange={(val) => updateRole(ev.id, col.key, val)}
        blocked={ctx.blocked}
        hints={hints}
        renderChip={(name) => (
          <PersonChip
            name={name}
            status={personStatus(ev.id, col.key, name)}
            conflict={ctx.blocked.has(name) ? tr('Nieobecność: {reason}', { reason: ctx.blocked.get(name) }) : null}
          />
        )}
      />
    );
  };

  const absenceSelect = (ev, ctx) => {
    const locked = [...ctx.reported.keys()].filter((n) => !ctx.manualAbsent.includes(n));
    return (
      <PeoplePicker
        label={tr('Nieobecni')}
        options={members}
        value={ctx.team.absencja || ''}
        onChange={(val) => updateAbsence(ev.id, val)}
        locked={locked}
        lockedTitle={tr('Zgłoszone w Dostępności')}
        renderLocked={(name) => (
          <AwayChip name={name} reported title={tr('{name} — zgłoszona nieobecność {range}', { name, range: ctx.reported.get(name) })} />
        )}
        renderChip={(name) => <AwayChip name={name} title={tr('{name} — nieobecny/a (wpisane w grafiku)', { name })} />}
      />
    );
  };

  const notesInput = (ev, ctx) => {
    const notes = ctx.team.notatki || '';
    return (
      <input
        key={`${ev.id}:${notes}`}
        type="text"
        aria-label={tr('Notatki')}
        className="sg-note bg-transparent text-gray-700 dark:text-gray-200"
        placeholder={tr('Dodaj notatkę')}
        defaultValue={notes}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={(e) => updateNotes(ev.id, e.target.value)}
      />
    );
  };

  const eventTitle = (ev) => (
    <Link to={`/wydarzenie/${ev.id}`} className="sg-event-title text-gray-900 dark:text-gray-100" title={ev.title || tr('Wydarzenie')}>
      {ev.title || tr('Wydarzenie')}
    </Link>
  );
  const campusLine = (ev) => {
    const campus = getCampus(ev.campus_id);
    return campus ? (
      <div className="sg-meta"><MapPin size={11} className="shrink-0" aria-hidden="true" /><span className="truncate">{campus.name}</span></div>
    ) : null;
  };
  const timeOf = (ev) => (ev.time ? String(ev.time).slice(0, 5) : '');
  const dateLine = (ev) => `${weekdayShort(ev.date)}${timeOf(ev) ? ` · ${timeOf(ev)}` : ''}`;

  // Menu ⋯ wydarzenia: propozycja obsady, kopiowanie z poprzedniego, zapisane składy.
  const eventMenu = (ev) => {
    const prev = previousLineup(history, ev);
    const upcoming = dayKey(ev.date) >= today;
    return (
      <ActionMenu
        label={tr('Obsada: {event}', { event: eventLabel(ev) })}
        items={[
          { key: 'propose', icon: Wand2, label: tr('Zaproponuj obsadę'), onClick: () => openProposal([ev]), disabled: !upcoming, hint: upcoming ? '' : tr('minione') },
          { key: 'copy', icon: Copy, label: prev ? tr('Kopiuj skład z {date}', { date: shortDay(prev.date) }) : tr('Kopiuj skład z poprzedniego'), onClick: () => copyPrevious(ev), disabled: !prev },
          ...(templates ? [{ key: 'tpl', icon: Bookmark, label: tr('Zapisane składy…'), hint: templates.length ? String(templates.length) : '', onClick: () => setTemplatesFor(ev.id) }] : []),
        ]}
      />
    );
  };

  const legend = (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      {['accepted', 'pending', 'rejected', 'draft', 'noemail'].map((k) => {
        const { icon: Icon, cls, label } = STATUS[k];
        return (
          <span key={k} className="inline-flex items-center gap-1">
            <Icon size={12} strokeWidth={2.5} className={cls} aria-hidden="true" /> {label()}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1">
        <CalendarX size={12} strokeWidth={2.5} className="text-red-600 dark:text-red-400" aria-hidden="true" /> {tr('nieobecność')}
      </span>
    </p>
  );

  // Układ „role w wierszach, daty w kolumnach”.
  const rolesTable = (monthEvents, contexts, summaries) => (
    <GridScroller>
      {/* Stały układ: kolumna ról 176 px, daty dzielą resztę po równo (212–340 px każda). */}
      <table className="sg-table sg-table--fixed" style={{ minWidth: 0, width: `max(min(100%, ${176 + monthEvents.length * 340}px), ${176 + monthEvents.length * 212}px)` }}>
        <thead>
          <tr>
            <TH className="sg-sticky sg-col-rolehead sg-edge-l">{tr('Rola')}</TH>
            {monthEvents.map((ev) => {
              const past = dayKey(ev.date) < today;
              return (
                <th key={ev.id} scope="col" className={`sg-vth ${past ? 'sg-vth--past' : ''}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 text-gray-900 dark:text-gray-100">
                      <div className="sg-date">
                        {shortDay(ev.date)}
                        {ev.id === nextEventId && <span className="sg-next-dot" title={tr('Najbliższe')} />}
                      </div>
                      <div className="sg-meta">{dateLine(ev)}</div>
                    </div>
                    {eventMenu(ev)}
                  </div>
                  <div className="mt-1">{eventTitle(ev)}</div>
                  {campusLine(ev)}
                  <div className="mt-2 min-h-[1px]">
                    <EventStatus summary={summaries.get(ev.id)} conflicts={contexts.get(ev.id).conflicts} onSend={() => sendForEvents([ev.id])} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.key} className="sg-row">
              <th scope="row" className="sg-td sg-sticky sg-col-rolehead sg-edge-l sg-rolelabel">{col.label}</th>
              {monthEvents.map((ev) => <td key={ev.id} className="sg-td">{roleSelect(ev, col, contexts.get(ev.id))}</td>)}
            </tr>
          ))}
          <tr className="sg-row">
            <th scope="row" className="sg-td sg-sticky sg-col-rolehead sg-edge-l sg-rolelabel">{tr('Nieobecni')}</th>
            {monthEvents.map((ev) => <td key={ev.id} className="sg-td">{absenceSelect(ev, contexts.get(ev.id))}</td>)}
          </tr>
          <tr className="sg-row">
            <th scope="row" className="sg-td sg-sticky sg-col-rolehead sg-edge-l sg-rolelabel">{tr('Notatki')}</th>
            {monthEvents.map((ev) => <td key={ev.id} className="sg-td">{notesInput(ev, contexts.get(ev.id))}</td>)}
          </tr>
        </tbody>
      </table>
    </GridScroller>
  );

  // Układ „wydarzenia w wierszach” (domyślny).
  const datesTable = (monthEvents, contexts, summaries) => (
    <GridScroller>
      <table className="sg-table">
        <thead>
          <tr>
            <TH className="sg-sticky sg-col-date">{t('Data')}</TH>
            <TH className="sg-sticky sg-col-event sg-edge-l">{tr('Wydarzenie')}</TH>
            {columns.map((col) => (
              <TH key={col.key} className="sg-col-role">{col.label}</TH>
            ))}
            <TH className="sg-col-absent">{tr('Nieobecni')}</TH>
            <TH className="sg-col-notes">{tr('Notatki')}</TH>
            <TH className="sg-sticky sg-col-status sg-edge-r">{tr('Status')}</TH>
          </tr>
        </thead>
        <tbody>
          {monthEvents.map((ev) => {
            const ctx = contexts.get(ev.id);
            const past = dayKey(ev.date) < today;
            return (
              <tr key={ev.id} className={`sg-row ${past ? 'sg-row--past' : ''}`}>
                <td className="sg-td sg-sticky sg-col-date text-gray-900 dark:text-gray-100">
                  <div className="sg-date">
                    {shortDay(ev.date)}
                    {ev.id === nextEventId && <span className="sg-next-dot" title={tr('Najbliższe')} />}
                  </div>
                  <div className="sg-meta">{dateLine(ev)}</div>
                </td>
                <td className="sg-td sg-sticky sg-col-event sg-edge-l">
                  <div className="sg-event-cell">
                    <div className="min-w-0">
                      {eventTitle(ev)}
                      {campusLine(ev)}
                    </div>
                    <span className="sg-reveal">{eventMenu(ev)}</span>
                  </div>
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="sg-td sg-col-role">{roleSelect(ev, col, ctx)}</td>
                ))}
                <td className="sg-td sg-col-absent">{absenceSelect(ev, ctx)}</td>
                <td className="sg-td sg-col-notes">{notesInput(ev, ctx)}</td>
                <td className="sg-td sg-sticky sg-col-status sg-edge-r">
                  <EventStatus summary={summaries.get(ev.id)} conflicts={ctx.conflicts} onSend={() => sendForEvents([ev.id])} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GridScroller>
  );

  const renderMonth = (monthKey) => {
    const isExpanded = !!expandedMonths[monthKey];
    const monthEvents = groupedEvents[monthKey].slice().sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)));
    const summaries = new Map(monthEvents.map((ev) => [ev.id, summarize(schedAssignments, ev.id, teamType)]));
    const toSendIds = monthEvents.filter((ev) => summaries.get(ev.id).toSend > 0).map((ev) => ev.id);
    const toSendCount = monthEvents.reduce((acc, ev) => acc + summaries.get(ev.id).toSend, 0);
    const { name, year } = monthParts(monthKey);
    const contexts = new Map(monthEvents.map((ev) => [ev.id, rowContext(ev)]));
    const conflictCount = [...contexts.values()].reduce((acc, c) => acc + c.conflicts.length, 0);
    const hasUpcoming = monthEvents.some((ev) => dayKey(ev.date) >= today);

    return (
      <section key={monthKey} aria-label={`${name} ${year}`}>
        <div className="sg-month">
          <button type="button" className="sg-month-toggle text-gray-900 dark:text-gray-100" onClick={() => toggleMonth(monthKey)} aria-expanded={isExpanded}>
            <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className="font-extrabold">{name}</span>
            <span className="font-light">{year}</span>
          </button>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {conflictCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 mr-1">
                <CalendarX size={13} strokeWidth={2.5} aria-hidden="true" />
                {tr('Przypisani mimo nieobecności: {n}', { n: conflictCount })}
              </span>
            )}
            {isExpanded && hasUpcoming && (
              <Button size="sm" variant="secondary" icon={Wand2} onClick={() => openProposal(monthEvents)}
                title={tr('Propozycja obsady pustych ról we wszystkich nadchodzących wydarzeniach miesiąca')}>
                {tr('Zaproponuj obsadę')}
              </Button>
            )}
            {isExpanded && (
              <button type="button" className="sg-icon-btn text-gray-600 dark:text-gray-300" onClick={() => printMonth(monthKey, monthEvents)}
                title={tr('Drukuj / PDF')} aria-label={tr('Drukuj grafik: {month}', { month: `${name} ${year}` })}>
                <Printer size={16} aria-hidden="true" />
              </button>
            )}
            {toSendCount > 0 && (isExpanded ? (
              <Button size="sm" icon={Send} loading={bulkSending === monthKey} onClick={() => sendForMonth(monthKey, toSendIds)}>
                {tr('Powiadom wszystkich ({n})', { n: toSendCount })}
              </Button>
            ) : (
              <span className="text-xs font-medium text-accent-primary">{tr('Do powiadomienia: {n}', { n: toSendCount })}</span>
            ))}
          </div>
        </div>

        {isExpanded && narrow && (
          <div className="sg-cards">
            {monthEvents.map((ev) => {
              const ctx = contexts.get(ev.id);
              const past = dayKey(ev.date) < today;
              return (
                <div key={ev.id} className={`sg-card ${past ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between gap-3 px-1.5 mb-1">
                    <div className="min-w-0">
                      <div className="sg-date text-gray-900 dark:text-gray-100">
                        {ev.id === nextEventId && <span className="sg-next-dot" title={tr('Najbliższe')} />}
                        {shortDay(ev.date)}
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{dateLine(ev)}</span>
                      </div>
                      <div className="mt-0.5">{eventTitle(ev)}</div>
                      {campusLine(ev)}
                    </div>
                    <div className="flex items-start gap-1">
                      <EventStatus summary={summaries.get(ev.id)} conflicts={ctx.conflicts} onSend={() => sendForEvents([ev.id])} />
                      {eventMenu(ev)}
                    </div>
                  </div>
                  <div className="sg-card-grid">
                    {columns.map((col) => (
                      <React.Fragment key={col.key}>
                        <div className="sg-card-label">{col.label}</div>
                        <div className="min-w-0">{roleSelect(ev, col, ctx)}</div>
                      </React.Fragment>
                    ))}
                    <div className="sg-card-label">{tr('Nieobecni')}</div>
                    <div className="min-w-0">{absenceSelect(ev, ctx)}</div>
                  </div>
                  <div className="sg-card-label">{tr('Notatki')}</div>
                  {notesInput(ev, ctx)}
                </div>
              );
            })}
          </div>
        )}

        {isExpanded && !narrow && (viewMode === 'roles'
          ? rolesTable(monthEvents, contexts, summaries)
          : datesTable(monthEvents, contexts, summaries))}
      </section>
    );
  };

  const templatesEvent = templatesFor ? events.find((e) => e.id === templatesFor) : null;

  return (
    <div ref={rootRef} className="sg-root">
      <div className="flex justify-between items-start gap-3 mb-2 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {tr('Grafik')}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {!narrow && teamEvents.length > 0 && (
            <div className="seg-bar" role="group" aria-label={tr('Układ grafiku')}>
              <button type="button" aria-pressed={viewMode === 'dates'} onClick={() => changeView('dates')}
                className="seg-btn" title={tr('Wiersze = wydarzenia')}>
                <Rows size={15} aria-hidden="true" />{tr('Daty')}
              </button>
              <button type="button" aria-pressed={viewMode === 'roles'} onClick={() => changeView('roles')}
                className="seg-btn" title={tr('Wiersze = role, kolumny = daty')}>
                <Columns size={15} aria-hidden="true" />{tr('Role')}
              </button>
            </div>
          )}
          <button type="button" className="tool-btn" onClick={() => setMyServicesOpen(true)}
            title={tr('Dodaj swoje służby do kalendarza w telefonie')}>
            <CalendarPlus size={15} aria-hidden="true" />{tr('Moje służby')}
          </button>
          <button type="button" className="tool-btn" onClick={() => setReminderOpen(true)}
            title={tr('Automatyczne przypomnienia')}>
            <BellRing size={15} aria-hidden="true" />{tr('Przypomnienia')}
          </button>
          {teamEvents.length > 0 && (
            <button type="button" className="tool-btn" onClick={exportCsv} title={tr('Pobierz grafik jako CSV')}>
              <Download size={15} aria-hidden="true" />{tr('CSV')}
            </button>
          )}
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} title={t('Brak członków w zespole')} subtitle={tr('Najpierw dodaj członków w zakładce "Służby"')} />
      ) : upcomingMonths.length + pastMonths.length === 0 ? (
        <EmptyState icon={Calendar} title={t('Brak wydarzeń')} subtitle={tr('Dodaj wydarzenia w tym module albo przypisz tę służbę do typu wydarzenia w Ustawieniach.')} />
      ) : (
        <div>
          {legend}
          <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {upcomingMonths.map(renderMonth)}
          </div>
          {pastMonths.length > 0 && (
            <>
              <div className="sg-divider">{tr('Minione')}</div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {pastMonths.map(renderMonth)}
              </div>
            </>
          )}
        </div>
      )}

      {proposal && (
        <ProposalModal isOpen onClose={() => setProposal(null)} proposals={proposal} onApply={applyProposal} />
      )}
      {templatesEvent && templates && (
        <TemplatesModal
          isOpen
          onClose={() => setTemplatesFor(null)}
          eventLabel={eventLabel(templatesEvent)}
          templates={templates}
          roleLabel={colLabel}
          currentLineup={lineupOf(templatesEvent.assignments?.[teamType], roleKeys)}
          onSave={(name) => saveTemplate(templatesEvent, name)}
          onInsert={async (tpl) => { await fillFrom(templatesEvent, tpl.lineup); setTemplatesFor(null); }}
          onDelete={deleteTemplate}
        />
      )}
      <ReminderSettingsModal isOpen={reminderOpen} onClose={() => setReminderOpen(false)} value={reminderRaw} canEdit={canEditReminders} onSave={saveReminders} />
      <MyServicesModal isOpen={myServicesOpen} onClose={() => setMyServicesOpen(false)} />
    </div>
  );
}
