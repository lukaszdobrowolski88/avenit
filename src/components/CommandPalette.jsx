import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import {
  Search, X, Loader2, CornerDownLeft, ArrowUp, ArrowDown,
  Users, Music, Home, Calendar as CalendarIcon, ListOrdered, LayoutGrid, Podcast, ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePermissions } from '../contexts/PermissionsContext';
import { useAppModules } from '../hooks/useAppModules';
import { normalizeModuleLabel } from '../hooks/useModuleLabel';
import { HIDDEN_NAV_KEYS, MERGED_MODULE_TARGETS, KEY_ICONS, wordStartScore } from './navConfig';
import { useT } from '../i18n';
import { tr, appLocale } from '../i18n';

// Globalny event do otwierania palety z dowolnego miejsca (np. przycisk w Navbarze).
export const OPEN_EVENT = 'avenit:open-search';
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Słowa kluczowe (synonimy) per moduł — szukane od początku słowa, obok nazwy z menu.
const KEY_KEYWORDS = {
  dashboard: 'start strona główna dashboard',
  calendar: 'kalendarz terminy nabożeństwa spotkania wydarzenia',
  programs: 'plan przebieg nabożeństwa program',
  members: 'osoby ludzie baza kontakty telefon członkowie',
  homegroups: 'komórki grupy domowe',
  attendance: 'obecność frekwencja sesje',
  rsvp: 'zapisy zaproszenia rsvp',
  prayer: 'modlitwa intencje prośby',
  worship: 'pieśni śpiewnik uwielbienie zespół grafik',
  media: 'media prezentacja nagłośnienie wideo',
  atmosfera: 'kawiarnia powitanie',
  kids: 'dzieci szkółka meldowanie',
  mlodziezowka: 'młodzież',
  teaching: 'nauczanie kazania kazanie mówcy serie',
  serve: 'dostępność nieobecności wolontariusze służba',
  komunikator: 'czat wiadomości rozmowy',
  mail: 'poczta skrzynka e-mail',
  mailing: 'newsletter e-mail mailing kampanie',
  push_campaigns: 'powiadomienia push kampanie',
  sms_campaigns: 'sms wiadomości kampanie',
  finance: 'budżet ofiary kasa wydatki wpływy',
  giving: 'darowizny dawanie zbiórki hojność',
  boards: 'tablice zadania kanban projekty',
  forms: 'ankiety zapisy formularze',
  rooms: 'sale rezerwacje zasoby',
  automation: 'automatyczne automatyzacje',
  analytics: 'statystyki raporty analityka ccli wykonania pieśni',
  ai: 'asystent ai',
  care: 'opieka duszpasterska notatki',
  sermons: 'kazania kazanie nagrania',
  settings: 'konfiguracja ustawienia',
};

// Podstrony Ustawień (głębokie linki ?tab=) — pokazywane tylko po wpisaniu frazy.
const SETTINGS_PAGES = [
  { tab: 'users', label: 'Użytkownicy', keywords: 'konta zaproś role hasła' },
  { tab: 'modules', label: 'Moduły', keywords: 'włącz wyłącz moduły' },
  { tab: 'appearance', label: 'Wygląd', keywords: 'logo kolory motyw czcionka' },
  { tab: 'permissions', label: 'Uprawnienia', keywords: 'role dostęp' },
  { tab: 'integrations', label: 'Integracje', keywords: 'sms push klucze płatności' },
];

// Zapas, gdy listy modułów nie da się wczytać.
const FALLBACK_MODULES = [
  { key: 'calendar', path: '/wydarzenia', label: 'Wydarzenia', resource_key: 'module:calendar' },
  { key: 'members', path: '/members', label: 'Członkowie', resource_key: 'module:members' },
  { key: 'worship', path: '/worship', label: 'Grupa Uwielbienia', resource_key: 'module:worship' },
  { key: 'homegroups', path: '/home-groups', label: 'Grupy domowe', resource_key: 'module:homegroups' },
  { key: 'finance', path: '/finance', label: 'Finanse', resource_key: 'module:finance' },
  { key: 'forms', path: '/forms', label: 'Formularze', resource_key: 'module:forms' },
  { key: 'boards', path: '/projekty', label: 'Projekty', resource_key: 'module:boards' },
];

const iconFor = (name, key) => LucideIcons[name] || LucideIcons[KEY_ICONS[key]] || LucideIcons.Square;

// Usuwa znaki specjalne ILIKE, przecinki i nawiasy (składnia or() rozdziela po przecinku).
const clean = (s) => s.replace(/[%_,()]/g, ' ').trim();
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(appLocale()) : '');

// Wyszukiwarki rekordów. `resource` — wymagane uprawnienie; `module` — klucz modułu (nazwa
// kategorii jak w menu). Wynik prowadzi do rekordu (głębokie linki), nie do samej listy.
const SEARCHERS = [
  {
    module: 'members', fallback: 'Członkowie', resource: 'module:members', icon: Users,
    run: async (q) => {
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(6);
      return (data || []).map((m) => ({
        id: `member-${m.id}`,
        label: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || tr('Osoba'),
        sub: m.email || '',
        path: `/members?member=${encodeURIComponent(m.id)}`,
      }));
    },
  },
  {
    module: 'worship', categoryLabel: 'Pieśni', resource: 'module:worship', icon: Music,
    run: async (q) => {
      const { data } = await supabase
        .from('songs')
        .select('id, title, artist')
        .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
        .limit(6);
      return (data || []).map((s) => ({
        id: `song-${s.id}`,
        label: s.title || tr('Pieśń'),
        sub: s.artist || '',
        path: `/worship?song=${encodeURIComponent(s.id)}`,
      }));
    },
  },
  {
    module: 'homegroups', fallback: 'Grupy domowe', resource: 'module:homegroups', icon: Home,
    run: async (q) => {
      const { data } = await supabase
        .from('home_groups')
        .select('id, name, description')
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(5);
      return (data || []).map((g) => ({
        id: `group-${g.id}`,
        label: g.name || tr('Grupa'),
        sub: g.description || '',
        path: `/home-groups?group=${encodeURIComponent(g.id)}`,
      }));
    },
  },
  {
    module: 'calendar', fallback: 'Wydarzenia', resource: 'module:calendar', icon: CalendarIcon,
    run: async (q) => {
      const { data } = await supabase
        .from('events')
        .select('id, title, date, time, location')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
        .order('date', { ascending: false })
        .limit(5);
      return (data || []).map((e) => ({
        id: `event-${e.id}`,
        label: e.title || tr('Wydarzenie'),
        sub: [fmtDate(e.date), e.location].filter(Boolean).join(' · '),
        path: `/wydarzenie/${e.id}`,
      }));
    },
  },
  {
    module: 'programs', fallback: 'Programy', resource: 'module:programs', icon: ListOrdered,
    run: async (q) => {
      const { data } = await supabase
        .from('programs')
        .select('id, date, type, title, notes')
        .or(`title.ilike.%${q}%,notes.ilike.%${q}%,type.ilike.%${q}%`)
        .order('date', { ascending: false })
        .limit(5);
      return (data || []).map((p) => ({
        id: `program-${p.id}`,
        label: `${p.title || p.type || tr('Program')}${p.date ? ' — ' + fmtDate(p.date) : ''}`,
        sub: p.notes || '',
        path: `/programs/${p.id}`,
      }));
    },
  },
  {
    module: 'teaching', categoryLabel: 'Kazania', resource: 'module:teaching', icon: Podcast,
    run: async (q) => {
      const { data } = await supabase
        .from('sermons')
        .select('id, title, speaker, sermon_date')
        .or(`title.ilike.%${q}%,speaker.ilike.%${q}%,scripture_ref.ilike.%${q}%`)
        .order('sermon_date', { ascending: false })
        .limit(5);
      return (data || []).map((s) => ({
        id: `sermon-${s.id}`,
        label: s.title || tr('Kazanie'),
        sub: [s.speaker, fmtDate(s.sermon_date)].filter(Boolean).join(' · '),
        path: `/teaching?tab=kazania&sermon=${encodeURIComponent(s.id)}`,
      }));
    },
  },
  {
    module: 'forms', fallback: 'Formularze', resource: 'module:forms', icon: ClipboardList,
    run: async (q) => {
      const { data } = await supabase
        .from('forms')
        .select('id, title')
        .ilike('title', `%${q}%`)
        .limit(5);
      return (data || []).map((f) => ({
        id: `form-${f.id}`,
        label: f.title || tr('Formularz'),
        sub: '',
        path: `/forms?edit=${encodeURIComponent(f.id)}`,
      }));
    },
  },
  {
    module: 'boards', fallback: 'Projekty', resource: 'module:boards', icon: LayoutGrid,
    run: async (q) => {
      const { data } = await supabase
        .from('boards')
        .select('id, name, description')
        .eq('is_archived', false)
        .ilike('name', `%${q}%`)
        .limit(6);
      return (data || []).map((b) => ({
        id: `board-${b.id}`,
        label: b.name || tr('Tablica'),
        sub: b.description || '',
        path: `/projekty?board=${b.id}`,
      }));
    },
  },
];

export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { modules } = useAppModules();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]); // [{ category, icon, items }]
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqId = useRef(0);
  const returnFocusRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false); setQuery(''); setGroups([]); setActive(0);
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && typeof el.focus === 'function' && document.contains(el)) setTimeout(() => el.focus(), 0);
  }, []);

  // Skrót globalny Cmd/Ctrl+K + event z Navbara.
  useEffect(() => {
    const remember = () => { if (!returnFocusRef.current) returnFocusRef.current = document.activeElement; };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => { if (!o) remember(); return !o; });
      }
    };
    const onOpen = () => { remember(); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  // Nazwa modułu z menu (z bazy) — kategorie wyników mówią tym samym językiem co menu.
  const labelFor = useCallback((key, fallback) => {
    const m = modules.find((x) => x.key === key);
    return m?.label ? tr(normalizeModuleLabel(m.label)) : tr(fallback);
  }, [modules]);

  // Skoki do modułów: z app_modules (włączone + z uprawnieniem), w kolejności menu (UXE-03).
  const jumps = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (it) => { if (!it.path || seen.has(it.id)) return; seen.add(it.id); out.push(it); };
    const byKey = new Map(modules.map((m) => [m.key, m]));
    add({ id: 'mod-dashboard', key: 'dashboard', label: tr('Pulpit'), path: '/', icon: iconFor('LayoutDashboard', 'dashboard'), keywords: KEY_KEYWORDS.dashboard });
    if (can('module:programs')) {
      const prog = byKey.get('programs');
      add({ id: 'mod-programs', key: 'programs', label: prog?.label ? tr(normalizeModuleLabel(prog.label)) : tr('Programy'), path: '/programs', icon: iconFor(prog?.icon, 'programs'), keywords: KEY_KEYWORDS.programs });
    }
    const fromDb = modules.length > 0;
    const list = fromDb ? modules : FALLBACK_MODULES.map((m) => ({ ...m, is_enabled: true }));
    for (const m of list) {
      if (!m || !m.path || !m.is_enabled || ['dashboard', 'programs', 'settings'].includes(m.key)) continue;
      if (m.resource_key && !can(m.resource_key)) continue;
      // Etykiety z bazy też przez tr() — w EN/UK menu pokazuje tłumaczenie domyślnych nazw.
      const label = tr(fromDb ? normalizeModuleLabel(m.label) : m.label);
      if (HIDDEN_NAV_KEYS.includes(m.key)) {
        // Moduł scalony z innym (Opieka → Członkowie, Kazania → Nauczanie) — skok na zakładkę.
        const target = MERGED_MODULE_TARGETS[m.key];
        const host = m.key === 'care' ? 'module:members' : 'module:teaching';
        if (target && can(host)) add({ id: `mod-${m.key}`, key: m.key, label, path: target, icon: iconFor(KEY_ICONS[m.key], m.key), keywords: KEY_KEYWORDS[m.key] || '' });
        continue;
      }
      add({ id: `mod-${m.key}`, key: m.key, label, path: m.path, icon: iconFor(m.icon, m.key), keywords: KEY_KEYWORDS[m.key] || '' });
    }
    if (can('module:settings')) {
      add({ id: 'mod-settings', key: 'settings', label: tr('Ustawienia'), path: '/settings', icon: iconFor('Settings', 'settings'), keywords: KEY_KEYWORDS.settings });
      SETTINGS_PAGES.forEach((p) => add({
        id: `settings-${p.tab}`, key: 'settings', label: `${tr('Ustawienia')} › ${tr(p.label)}`, path: `/settings?tab=${p.tab}`,
        icon: iconFor('Settings', 'settings'), keywords: p.keywords, deep: true,
      }));
    }
    add({ id: 'mod-profile', key: 'profile', label: tr('Mój profil'), path: '/profile', icon: iconFor('User'), keywords: 'konto hasło dwuetapowe profil' });
    return out;
  }, [modules, can]);

  // Filtrowane skoki: dopasowanie od początku słowa; bez frazy — pierwsze pozycje menu.
  const moduleItems = useMemo(() => {
    const q = query.trim();
    if (!q) return jumps.filter((j) => !j.deep).slice(0, 6);
    return jumps
      .map((j, i) => ({ j, i, s: wordStartScore(q, j.label, j.keywords) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, 8)
      .map((x) => x.j);
  }, [jumps, query]);

  // Wyszukiwanie rekordów z debounce + anulowaniem nieaktualnych żądań.
  useEffect(() => {
    const q = clean(query);
    if (q.length < 2) { setGroups([]); setLoading(false); return undefined; }
    setLoading(true);
    const myId = ++reqId.current;
    const searchers = SEARCHERS.filter((s) => can(s.resource));
    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(searchers.map((s) => s.run(q)));
      if (myId !== reqId.current) return; // nieaktualne
      const g = searchers.map((s, i) => ({
        category: s.categoryLabel ? tr(s.categoryLabel) : labelFor(s.module, s.fallback),
        icon: s.icon,
        items: settled[i].status === 'fulfilled' ? settled[i].value : [],
      })).filter((x) => x.items.length > 0);
      setGroups(g);
      setLoading(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [query, can, labelFor]);

  // Płaska lista wszystkich itemów (skoki + rekordy) do nawigacji klawiaturą.
  const flat = useMemo(() => {
    const rows = [];
    if (moduleItems.length) rows.push({ header: query.trim() ? t('Przejdź do') : t('Sugestie') });
    moduleItems.forEach((it) => rows.push(it));
    groups.forEach((g) => {
      rows.push({ header: g.category });
      g.items.forEach((it) => rows.push({ ...it, icon: g.icon }));
    });
    return rows;
  }, [moduleItems, groups, query, t]);

  const selectable = useMemo(() => flat.filter((r) => !r.header), [flat]);

  useEffect(() => { if (active >= selectable.length) setActive(0); }, [selectable.length, active]);

  const go = useCallback((item) => {
    if (!item) return;
    returnFocusRef.current = null; // po przejściu fokus przejmuje nowa strona
    close();
    navigate(item.path);
  }, [close, navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, selectable.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(selectable[active]); }
    else if (e.key === 'Tab') { e.preventDefault(); } // fokus zostaje w oknie (Esc zamyka)
  };

  // Przewijaj do aktywnego elementu.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // Pole ma własny, cichy fokus (kursor + ikona). Globalna poświata pól z brand-avenit.css
  // (z !important) wychodziła poza górną krawędź okna — wyłączamy ją tylko tutaj (UXE-25).
  const setInputRef = useCallback((el) => {
    inputRef.current = el;
    if (el) {
      el.style.setProperty('box-shadow', 'none', 'important');
      el.style.setProperty('border-color', 'transparent', 'important');
      el.style.setProperty('outline', 'none', 'important');
    }
  }, []);

  if (!open) return null;

  let idx = -1;
  const showEmpty = selectable.length === 0;
  const activeId = selectable.length ? `cmdk-opt-${active}` : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh] bg-black/40 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Wyszukiwarka')}
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Pole wyszukiwania */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100 dark:border-gray-700">
          {loading
            ? <Loader2 size={18} className="text-accent-primary animate-spin shrink-0" aria-hidden="true" />
            : <Search size={18} className="text-gray-500 dark:text-gray-400 shrink-0" aria-hidden="true" />}
          <input
            ref={setInputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={!showEmpty}
            aria-controls="cmdk-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t('Szukaj w aplikacji')}
            placeholder={t('Szukaj osób, modułów, pieśni, wydarzeń…')}
            className="flex-1 min-w-0 py-3.5 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-gray-800 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
          <button type="button" onClick={close} aria-label={t('Zamknij wyszukiwarkę')} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 shrink-0">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Wyniki */}
        <div ref={listRef} id="cmdk-list" role="listbox" aria-label={t('Wyniki wyszukiwania')} className="max-h-[52vh] overflow-y-auto custom-scrollbar py-2">
          {showEmpty && (
            <div role="presentation" className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {clean(query).length >= 2 && !loading
                ? t('Nic nie znaleziono dla „{q}”.', { q: query.trim() })
                : t('Zacznij pisać, aby wyszukać w całej aplikacji.')}
            </div>
          )}
          {flat.map((row, i) => {
            if (row.header) {
              return (
                <div key={`h-${i}`} role="presentation" className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {row.header}
                </div>
              );
            }
            idx += 1;
            const myIdx = idx;
            const Icon = row.icon || Search;
            const isActive = myIdx === active;
            return (
              <button
                key={row.id}
                type="button"
                id={`cmdk-opt-${myIdx}`}
                role="option"
                aria-selected={isActive}
                tabIndex={-1}
                data-idx={myIdx}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => go(row)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-left transition-colors ${
                  isActive ? 'bg-accent-primary-lightest dark:bg-gray-700/70' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-white text-accent-primary dark:bg-gray-800 dark:text-accent-primary-light' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.label}</span>
                  {row.sub && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{row.sub}</span>}
                </span>
                {isActive && <CornerDownLeft size={15} className="shrink-0 text-gray-400" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="sr-only" aria-live="polite">
          {clean(query).length >= 2 && !loading ? t('Liczba wyników: {n}', { n: selectable.length }) : ''}
        </div>

        {/* Stopka ze skrótami */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><ArrowUp size={11} aria-hidden="true" /><ArrowDown size={11} aria-hidden="true" /> {t('nawigacja')}</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} aria-hidden="true" /> {t('otwórz')}</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-sans">Esc</kbd> {t('zamknij')}</span>
          <span className="ml-auto hidden sm:inline">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
