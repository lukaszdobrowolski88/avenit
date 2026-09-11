import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Settings2, ArrowUp, ArrowDown, Star, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCan } from './Can';
import { useModuleTabs, invalidateModuleLabels } from '../hooks/useModuleLabel';
import { toast } from '../lib/toast';

/**
 * ResponsiveTabs - Responsywny komponent zakładek (styl Monday: podkreślenie akcentem).
 * Z opcjonalnym `moduleKey` pozwala adminowi ustawić KOLEJNOŚĆ i DOMYŚLNĄ zakładkę
 * (zapis do app_settings 'module_tabs'), stosowane dynamicznie dla wszystkich.
 */
export default function ResponsiveTabs({ tabs, activeTab, onChange, className = '', moduleKey }) {
  const scrollContainerRef = useRef(null);
  const activeTabRef = useRef(null);
  const prefs = useModuleTabs(moduleKey);
  const canEdit = useCan('module:settings');

  // Kolejność wg preferencji (nieznane id na koniec, zachowując oryginalną kolejność).
  const orderedTabs = useMemo(() => {
    if (!prefs?.order?.length) return tabs;
    const pos = (id) => { const i = prefs.order.indexOf(id); return i === -1 ? 1000 + tabs.findIndex((t) => t.id === id) : i; };
    return [...tabs].sort((a, b) => pos(a.id) - pos(b.id));
  }, [tabs, prefs]);

  // Domyślna zakładka — zastosuj RAZ, gdy preferencje się wczytają (na wejściu do modułu).
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current || !prefs?.default) return;
    if (tabs.some((t) => t.id === prefs.default)) {
      appliedRef.current = true;
      if (prefs.default !== activeTab) onChange(prefs.default);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

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

  const tabClass = (isActive) =>
    `flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 -mb-px border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
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
        ref={withRef && isActive ? activeTabRef : null}
        data-tour={tab.tour}
        onClick={() => onChange(tab.id)}
        className={tabClass(isActive)}
      >
        {TabIcon && <TabIcon size={16} />}
        <span className="lg:inline">{tab.label}</span>
      </button>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Mobile */}
      <div className="lg:hidden -mx-4 px-4 border-b border-gray-200 dark:border-gray-700">
        <div ref={scrollContainerRef} className="flex gap-1 overflow-x-auto scrollbar-hide scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {orderedTabs.map((tab) => renderTab(tab, true))}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <div className="flex gap-1 flex-wrap flex-1">
            {orderedTabs.map((tab) => renderTab(tab, false))}
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
  const [busy, setBusy] = useState(false);

  const openPanel = () => {
    setOrder(tabs.map((t) => t.id));
    setDef(current?.default || '');
    setOpen(true);
  };
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
      map[moduleKey] = { order, default: def || null };
      const { error } = await supabase.from('app_settings').upsert({ key: 'module_tabs', value: JSON.stringify(map) }, { onConflict: 'key' });
      if (error) throw error;
      invalidateModuleLabels();
      toast.success('Zapisano układ zakładek');
      setOpen(false);
    } catch (e) { toast.error('Nie udało się zapisać: ' + e.message); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_tabs').maybeSingle();
      let map = {};
      try { map = JSON.parse(data?.value || '{}') || {}; } catch { map = {}; }
      delete map[moduleKey];
      await supabase.from('app_settings').upsert({ key: 'module_tabs', value: JSON.stringify(map) }, { onConflict: 'key' });
      invalidateModuleLabels();
      toast.success('Przywrócono domyślny układ');
      setOpen(false);
    } catch (e) { toast.error('Błąd: ' + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative shrink-0">
      <button onClick={openPanel} title="Ustaw kolejność i domyślną zakładkę" className="p-2 mb-1 text-gray-400 hover:text-accent-primary transition">
        <Settings2 size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[100] w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Zakładki: kolejność + domyślna</span>
              <button onClick={() => setOpen(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">Gwiazdka = zakładka otwierana domyślnie.</p>
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {order.map((id, i) => (
                <div key={id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                  <button onClick={() => setDef(def === id ? '' : id)} title="Ustaw jako domyślną" className={def === id ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}>
                    <Star size={15} fill={def === id ? 'currentColor' : 'none'} />
                  </button>
                  <span className="text-sm flex-1 truncate text-gray-800 dark:text-gray-100">{label(id)}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ArrowDown size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={reset} disabled={busy} className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Domyślny układ</button>
              <button onClick={save} disabled={busy} className="flex-1 px-3 py-2 text-xs rounded-lg bg-accent-primary text-white font-medium disabled:opacity-60">Zapisz</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
