import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { useInRouterContext, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Settings2, ArrowUp, ArrowDown, Star, X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCan } from './Can';
import { useModuleTabs, invalidateModuleLabels } from '../hooks/useModuleLabel';
import { toast } from '../lib/toast';
import { tr } from '../i18n';

/**
 * ResponsiveTabs - Responsywny komponent zakładek (styl Monday: podkreślenie akcentem).
 * Z opcjonalnym `moduleKey` pozwala adminowi ustawić KOLEJNOŚĆ i DOMYŚLNĄ zakładkę
 * (zapis do app_settings 'module_tabs'), stosowane dynamicznie dla wszystkich.
 *
 * Zakładka w adresie (UXE-10): główna instancja na stronie synchronizuje aktywną zakładkę
 * z parametrem `?tab=` — odświeżenie, Wstecz i link (np. /members?tab=care) otwierają
 * właściwą zakładkę. Prop `urlParam`:
 *   - pominięty → tryb automatyczny: synchronizuje tylko instancja z `moduleKey` i tylko
 *                 PIERWSZA zamontowana na stronie — zakładki zagnieżdżone (np. Opieka
 *                 w Członkach, Kazania w Nauczaniu) nie nadpisują adresu;
 *   - 'nazwa'   → wymuszona synchronizacja z ?nazwa= (np. drugi poziom zakładek);
 *   - false     → bez synchronizacji (moduł sam obsługuje adres).
 * Kontrakt activeTab/onChange bez zmian — obecne użycia działają bez modyfikacji.
 */
export default function ResponsiveTabs(props) {
  // Poza routerem (np. testy jednostkowe) — zwykłe zakładki bez adresu.
  return useInRouterContext() ? <RoutedTabs {...props} /> : <TabsCore {...props} />;
}

// Która instancja „posiada” parametr ?tab= (jedna główna na stronę).
let urlTabOwner = null;
let instanceSeq = 0;

function RoutedTabs(props) {
  const { tabs = [], activeTab, onChange, moduleKey, urlParam } = props;
  const explicit = typeof urlParam === 'string' && urlParam ? urlParam : null;
  const param = urlParam === false ? null : (explicit || (moduleKey ? 'tab' : null));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const prefs = useModuleTabs(moduleKey);

  const myId = useRef(0);
  if (!myId.current) myId.current = ++instanceSeq;
  const [owner, setOwner] = useState(false);

  useLayoutEffect(() => {
    if (!param) { setOwner(false); return undefined; }
    if (explicit) { setOwner(true); return undefined; }
    if (urlTabOwner == null) urlTabOwner = myId.current;
    setOwner(urlTabOwner === myId.current);
    return () => { if (urlTabOwner === myId.current) urlTabOwner = null; };
  }, [param, explicit]);

  const rawUrlTab = param ? searchParams.get(param) : null;
  const urlTab = owner ? rawUrlTab : null;
  const hidden = prefs?.hidden || [];
  const hiddenKey = hidden.join('|');
  const idsKey = tabs.map((t) => t.id).join('|');
  const isSelectable = (id) => !!id && tabs.some((t) => t.id === id) && !hidden.includes(id);

  // Zakładka z adresu czekająca na zastosowanie (np. zależna od uprawnień jeszcze się nie pojawiła).
  const pendingRef = useRef(null);
  const userPickRef = useRef(false);
  const prevActiveRef = useRef(activeTab);
  const lastKeyRef = useRef(location.key);
  const prevRawRef = useRef(rawUrlTab);

  // A) adres → stan. Layout effect: bez mignięcia domyślnej zakładki przy wejściu z linku.
  useLayoutEffect(() => {
    if (!owner || !urlTab || urlTab === activeTab) { pendingRef.current = null; return; }
    pendingRef.current = urlTab;
    if (isSelectable(urlTab)) onChange(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, urlTab, idsKey, hiddenKey]);

  // B) stan → adres. Klik w zakładkę = nowy wpis w historii (działa Wstecz); zmiana
  // programowa (np. domyślna zakładka, przejście z wnętrza modułu) podmienia bieżący adres.
  useEffect(() => {
    const changed = prevActiveRef.current !== activeTab;
    prevActiveRef.current = activeTab;
    if (!owner || !param) return;
    if (pendingRef.current) {
      if (activeTab === pendingRef.current) pendingRef.current = null;
      return;
    }
    if (!changed || activeTab == null || activeTab === '') return;
    if (searchParams.get(param) === String(activeTab)) { userPickRef.current = false; return; }
    const push = userPickRef.current;
    userPickRef.current = false;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(param, String(activeTab));
      return next;
    }, { replace: !push });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, owner]);

  // C) Adres bez ?tab= po: kliknięciu pozycji menu bocznego tego samego modułu (state.navReset)
  //    albo Wstecz/Dalej z adresu, który miał zakładkę → zakładka domyślna.
  useEffect(() => {
    const prevRaw = prevRawRef.current;
    prevRawRef.current = rawUrlTab;
    if (lastKeyRef.current === location.key) return;
    lastKeyRef.current = location.key;
    if (!owner || rawUrlTab) return;
    const reset = !!location.state?.navReset || (navigationType === 'POP' && !!prevRaw);
    if (!reset) return;
    const def = prefs?.default && isSelectable(prefs.default)
      ? prefs.default
      : tabs.find((t) => !hidden.includes(t.id))?.id;
    if (def && def !== activeTab) onChange(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleSelect = (id) => {
    if (id === activeTab) return;
    pendingRef.current = null;
    userPickRef.current = true;
    onChange(id);
  };

  // Domyślnej zakładki z preferencji nie stosujemy, gdy adres wskazuje konkretną.
  const likelyOwner = !!param && (!!explicit || urlTabOwner == null || urlTabOwner === myId.current);
  const skipDefault = likelyOwner && !!rawUrlTab;

  return <TabsCore {...props} prefs={prefs} onSelect={handleSelect} skipDefault={skipDefault} />;
}

function TabsCore({ tabs = [], activeTab, onChange, onSelect, className = '', moduleKey, prefs: prefsProp, skipDefault = false }) {
  const scrollContainerRef = useRef(null);
  const activeTabRef = useRef(null);
  const ownPrefs = useModuleTabs(prefsProp === undefined ? moduleKey : null);
  const prefs = prefsProp === undefined ? ownPrefs : prefsProp;
  const canEdit = useCan('module:settings');
  const select = onSelect || onChange;

  // Kolejność wg preferencji (nieznane id na koniec, zachowując oryginalną kolejność).
  const orderedTabs = useMemo(() => {
    if (!prefs?.order?.length) return tabs;
    const pos = (id) => { const i = prefs.order.indexOf(id); return i === -1 ? 1000 + tabs.findIndex((t) => t.id === id) : i; };
    return [...tabs].sort((a, b) => pos(a.id) - pos(b.id));
  }, [tabs, prefs]);
  // Ukryte zakładki (widoczność) — konfigurowalne przez admina.
  const hiddenIds = prefs?.hidden || [];
  const visibleTabs = useMemo(() => orderedTabs.filter((t) => !hiddenIds.includes(t.id)), [orderedTabs, hiddenIds]);

  // Domyślna zakładka — zastosuj RAZ, gdy preferencje się wczytają (na wejściu do modułu).
  // Gdy adres wskazuje zakładkę (?tab=), adres ma pierwszeństwo.
  const appliedRef = useRef(false);
  if (skipDefault) appliedRef.current = true;
  useEffect(() => {
    if (!prefs) return;
    if (!appliedRef.current && prefs.default && tabs.some((t) => t.id === prefs.default)) {
      appliedRef.current = true;
      if (prefs.default !== activeTab) { onChange(prefs.default); return; }
    }
    // Jeśli aktywna zakładka jest ukryta — przełącz na pierwszą widoczną.
    if (hiddenIds.includes(activeTab) && visibleTabs[0] && visibleTabs[0].id !== activeTab) {
      onChange(visibleTabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, activeTab]);

  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeElement = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      if (activeRect.left < containerRect.left || activeRect.right > containerRect.right) {
        activeElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  // Klawiatura w pasku zakładek (A11Y-18): ←/→, Home/End przenoszą fokus i wybierają zakładkę.
  const onTabKeyDown = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const list = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
    const i = list.indexOf(document.activeElement);
    if (i === -1 || !list.length) return;
    e.preventDefault();
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    list[n].focus();
    list[n].click();
  };

  const tabClass = (isActive) =>
    `flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] lg:min-h-0 -mb-px border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
      isActive
        ? 'border-accent-primary text-accent-primary'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
    }`;

  const renderTab = (tab, withRef) => {
    const TabIcon = tab.icon;
    const isActive = tab.id === activeTab;
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        ref={withRef && isActive ? activeTabRef : null}
        data-tour={tab.tour}
        data-tab-id={tab.id}
        onClick={() => select(tab.id)}
        className={tabClass(isActive)}
      >
        {TabIcon && <TabIcon size={16} aria-hidden="true" />}
        <span className="lg:inline">{typeof tab.label === 'string' ? tr(tab.label) : tab.label}</span>
      </button>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Mobile */}
      <div className="lg:hidden -mx-4 px-4 border-b border-gray-200 dark:border-gray-700">
        <div ref={scrollContainerRef} role="tablist" aria-orientation="horizontal" onKeyDown={onTabKeyDown} className="flex gap-1 overflow-x-auto scrollbar-hide scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {visibleTabs.map((tab) => renderTab(tab, true))}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <div role="tablist" aria-orientation="horizontal" onKeyDown={onTabKeyDown} className="flex gap-1 flex-wrap flex-1">
            {visibleTabs.map((tab) => renderTab(tab, false))}
          </div>
          {moduleKey && canEdit && (
            <TabConfig moduleKey={moduleKey} tabs={orderedTabs} current={prefs} />
          )}
        </div>
      </div>
    </div>
  );
}

// Konfigurator zakładek (kolejność + domyślna) — widoczny tylko dla zarządzających.
function TabConfig({ moduleKey, tabs, current }) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(tabs.map((t) => t.id));
  const [def, setDef] = useState(current?.default || '');
  const [hidden, setHidden] = useState(current?.hidden || []);
  const [busy, setBusy] = useState(false);

  const openPanel = () => {
    setOrder(tabs.map((t) => t.id));
    setDef(current?.default || '');
    setHidden(current?.hidden || []);
    setOpen(true);
  };
  const toggleHidden = (id) => setHidden((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const label = (id) => tabs.find((t) => t.id === id)?.label || id;
  const move = (i, dir) => {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_tabs').maybeSingle();
      let map = {};
      try { map = JSON.parse(data?.value || '{}') || {}; } catch { map = {}; }
      map[moduleKey] = { order, default: def || null, hidden };
      const { error } = await supabase.from('app_settings').upsert({ key: 'module_tabs', value: JSON.stringify(map) }, { onConflict: 'key' });
      if (error) throw error;
      invalidateModuleLabels();
      toast.success(tr('Zapisano układ zakładek'));
      setOpen(false);
    } catch (e) { toast.error(tr('Nie udało się zapisać układu zakładek. Spróbuj ponownie.')); console.error(e); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_tabs').maybeSingle();
      let map = {};
      try { map = JSON.parse(data?.value || '{}') || {}; } catch { map = {}; }
      delete map[moduleKey];
      const { error } = await supabase.from('app_settings').upsert({ key: 'module_tabs', value: JSON.stringify(map) }, { onConflict: 'key' });
      if (error) throw error;
      invalidateModuleLabels();
      toast.success(tr('Przywrócono domyślny układ'));
      setOpen(false);
    } catch (e) { toast.error(tr('Nie udało się przywrócić domyślnego układu. Spróbuj ponownie.')); console.error(e); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={openPanel} title={tr('Ustaw kolejność i domyślną zakładkę')} aria-label={tr('Ustaw kolejność i domyślną zakładkę')} aria-expanded={open} className="p-2 mb-1 text-gray-400 hover:text-accent-primary transition">
        <Settings2 size={16} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[100] w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase">{tr('Zakładki: kolejność + domyślna')}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label={tr('Zamknij')} className="text-gray-400"><X size={16} aria-hidden="true" /></button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{tr('Gwiazdka = zakładka otwierana domyślnie.')}</p>
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {order.map((id, i) => {
                const isHidden = hidden.includes(id);
                const name = typeof label(id) === 'string' ? label(id) : id;
                return (
                  <div key={id} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700 ${isHidden ? 'opacity-50' : ''}`}>
                    <button type="button" onClick={() => setDef(def === id ? '' : id)} title={tr('Ustaw jako domyślną')} aria-label={tr('Ustaw jako domyślną')} aria-pressed={def === id} disabled={isHidden} className={`${def === id ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'} disabled:opacity-30`}>
                      <Star size={15} fill={def === id ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                    <span className={`text-sm flex-1 truncate text-gray-800 dark:text-gray-100 ${isHidden ? 'line-through' : ''}`}>{label(id)}</span>
                    <button type="button" onClick={() => toggleHidden(id)} title={isHidden ? tr('Pokaż') : tr('Ukryj')} aria-label={isHidden ? tr('Pokaż zakładkę {name}', { name }) : tr('Ukryj zakładkę {name}', { name })} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">{isHidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}</button>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr('Przesuń wyżej')} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={tr('Przesuń niżej')} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ArrowDown size={14} aria-hidden="true" /></button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={reset} disabled={busy} className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60">{tr('Domyślny układ')}</button>
              <button type="button" onClick={save} disabled={busy} className="flex-1 px-3 py-2 text-xs rounded-lg bg-accent-primary text-white font-medium disabled:opacity-60">{busy ? tr('Zapisywanie…') : tr('Zapisz')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
