import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Loader2, CornerDownLeft, ArrowUp, ArrowDown,
  Users, Music, CalendarDays, Home, Calendar as CalendarIcon,
  LayoutDashboard, Wallet, FileText, Settings, User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Globalny event do otwierania palety z dowolnego miejsca (np. przycisk w Navbarze).
export const OPEN_EVENT = 'avenit:open-search';
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Szybkie skoki do modułów — zawsze dostępny, uniwersalny podzbiór.
const MODULES = [
  { label: 'Pulpit', path: '/', icon: LayoutDashboard, keywords: 'dashboard start główna' },
  { label: 'Programy', path: '/programs', icon: CalendarDays, keywords: 'nabożeństwa plan' },
  { label: 'Kalendarz', path: '/calendar', icon: CalendarIcon, keywords: 'wydarzenia terminy' },
  { label: 'Członkowie', path: '/members', icon: Users, keywords: 'osoby ludzie baza' },
  { label: 'Uwielbienie', path: '/worship', icon: Music, keywords: 'pieśni śpiewnik zespół' },
  { label: 'Grupy domowe', path: '/home-groups', icon: Home, keywords: 'komórki spotkania' },
  { label: 'Finanse', path: '/finance', icon: Wallet, keywords: 'ofiary budżet kasa' },
  { label: 'Formularze', path: '/forms', icon: FileText, keywords: 'zapisy ankiety' },
  { label: 'Ustawienia', path: '/settings', icon: Settings, keywords: 'konfiguracja profil kościoła' },
  { label: 'Mój profil', path: '/profile', icon: User, keywords: 'konto ustawienia hasło' },
];

// Usuwa znaki specjalne ILIKE i przecinki (składnia or() rozdziela po przecinku).
const clean = (s) => s.replace(/[%_,]/g, ' ').trim();

// Definicje wyszukiwarek encji — każda zwraca ujednolicone itemy.
const SEARCHERS = [
  {
    category: 'Członkowie', icon: Users,
    run: async (q) => {
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(6);
      return (data || []).map((m) => ({
        id: `member-${m.id}`,
        label: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Członek',
        sub: m.email || '',
        path: '/members',
      }));
    },
  },
  {
    category: 'Pieśni', icon: Music,
    run: async (q) => {
      const { data } = await supabase
        .from('songs')
        .select('id, title, artist')
        .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
        .limit(6);
      return (data || []).map((s) => ({
        id: `song-${s.id}`,
        label: s.title || 'Pieśń',
        sub: s.artist || '',
        path: '/worship',
      }));
    },
  },
  {
    category: 'Grupy domowe', icon: Home,
    run: async (q) => {
      const { data } = await supabase
        .from('home_groups')
        .select('id, name, description')
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(5);
      return (data || []).map((g) => ({
        id: `group-${g.id}`,
        label: g.name || 'Grupa',
        sub: g.description || '',
        path: '/home-groups',
      }));
    },
  },
  {
    category: 'Wydarzenia', icon: CalendarIcon,
    run: async (q) => {
      const { data } = await supabase
        .from('events')
        .select('id, title, date, time, location')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
        .order('date', { ascending: false })
        .limit(5);
      return (data || []).map((e) => ({
        id: `event-${e.id}`,
        label: e.title || 'Wydarzenie',
        sub: [e.date ? new Date(e.date).toLocaleDateString('pl-PL') : '', e.location].filter(Boolean).join(' · '),
        path: '/calendar',
      }));
    },
  },
  {
    category: 'Programy', icon: CalendarDays,
    run: async (q) => {
      const { data } = await supabase
        .from('programs')
        .select('id, date, type, notes')
        .or(`notes.ilike.%${q}%,type.ilike.%${q}%`)
        .order('date', { ascending: false })
        .limit(5);
      return (data || []).map((p) => ({
        id: `program-${p.id}`,
        label: `${p.type || 'Program'}${p.date ? ' — ' + new Date(p.date).toLocaleDateString('pl-PL') : ''}`,
        sub: p.notes || '',
        path: `/programs/${p.id}`,
      }));
    },
  },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]); // [{ category, icon, items }]
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqId = useRef(0);

  const close = useCallback(() => { setOpen(false); setQuery(''); setGroups([]); setActive(0); }, []);

  // Skrót globalny Cmd/Ctrl+K + event z Navbara.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  // Filtrowane skoki do modułów.
  const moduleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? MODULES.filter((m) => m.label.toLowerCase().includes(q) || m.keywords.includes(q))
      : MODULES.slice(0, 6);
    return base.map((m) => ({ id: `mod-${m.path}`, label: m.label, sub: '', path: m.path, icon: m.icon }));
  }, [query]);

  // Wyszukiwanie encji z debounce + anulowaniem nieaktualnych żądań.
  useEffect(() => {
    const q = clean(query);
    if (q.length < 2) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    const myId = ++reqId.current;
    const t = setTimeout(async () => {
      const settled = await Promise.allSettled(SEARCHERS.map((s) => s.run(q)));
      if (myId !== reqId.current) return; // nieaktualne
      const g = SEARCHERS.map((s, i) => ({
        category: s.category, icon: s.icon,
        items: settled[i].status === 'fulfilled' ? settled[i].value : [],
      })).filter((x) => x.items.length > 0);
      setGroups(g);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Płaska lista wszystkich itemów (skoki + encje) do nawigacji klawiaturą.
  const flat = useMemo(() => {
    const rows = [];
    if (moduleItems.length) rows.push({ header: query.trim() ? 'Przejdź do' : 'Sugestie' });
    moduleItems.forEach((it) => rows.push({ ...it, icon: it.icon }));
    groups.forEach((g) => {
      rows.push({ header: g.category });
      g.items.forEach((it) => rows.push({ ...it, icon: g.icon }));
    });
    return rows;
  }, [moduleItems, groups, query]);

  const selectable = useMemo(() => flat.filter((r) => !r.header), [flat]);

  useEffect(() => { if (active >= selectable.length) setActive(0); }, [selectable.length, active]);

  const go = useCallback((item) => { if (!item) return; close(); navigate(item.path); }, [close, navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, selectable.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(selectable[active]); }
  };

  // Przewijaj do aktywnego elementu.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  let idx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh] bg-black/40 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Pole wyszukiwania */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100 dark:border-gray-700">
          {loading
            ? <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" />
            : <Search size={18} className="text-gray-400 shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Szukaj członków, pieśni, grup, wydarzeń…"
            className="flex-1 py-3.5 bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
          />
          <button onClick={close} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Wyniki */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto custom-scrollbar py-2">
          {selectable.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {clean(query).length >= 2 && !loading
                ? <>Brak wyników dla „{query.trim()}".</>
                : <>Zacznij pisać, aby wyszukać w całej aplikacji.</>}
            </div>
          )}
          {flat.map((row, i) => {
            if (row.header) {
              return (
                <div key={`h-${i}`} className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
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
                data-idx={myIdx}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => go(row)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.label}</span>
                  {row.sub && <span className="block truncate text-xs text-gray-400">{row.sub}</span>}
                </span>
                {isActive && <CornerDownLeft size={15} className="shrink-0 text-gray-400" />}
              </button>
            );
          })}
        </div>

        {/* Stopka ze skrótami */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> nawigacja</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> otwórz</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-sans">Esc</kbd> zamknij</span>
          <span className="ml-auto hidden sm:inline">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
