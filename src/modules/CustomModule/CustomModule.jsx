import React, { useState, useEffect } from 'react';
import Spinner from '../../components/Spinner';
import { useParams, useLocation } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { supabase } from '../../lib/supabase';
import BoardsModule from '../Boards/BoardsModule';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import PageHeader from '../../components/PageHeader';
import { useTabAccess } from '../../components/Can';
import { tr } from '../../i18n';
import ModuleWidget, { WIDGET_TYPES, SELF_WRAPPING_WIDGETS } from './components/ModuleWidget';
import LayoutRenderer from './components/LayoutRenderer';

const CARD_CLASS =
  'bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 relative z-[50] transition-colors duration-300';

export default function CustomModule() {
  const { moduleKey: paramKey } = useParams();
  const location = useLocation();
  const [module, setModule] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasTabAccess = useTabAccess();

  const currentPath = location.pathname;

  useEffect(() => {
    const fetchModuleData = async () => {
      setLoading(true);
      try {
        let moduleData = null;
        if (paramKey) {
          const { data, error } = await supabase.from('app_modules').select('*').eq('key', paramKey).single();
          if (!error) moduleData = data;
        } else {
          const { data, error } = await supabase.from('app_modules').select('*').eq('path', currentPath).single();
          if (!error) moduleData = data;
        }
        if (!moduleData) { setLoading(false); return; }
        setModule(moduleData);

        const { data: tabsData, error: tabsError } = await supabase
          .from('app_module_tabs')
          .select('*')
          .eq('module_id', moduleData.id)
          .order('display_order', { ascending: true });
        if (!tabsError && tabsData) {
          setTabs(tabsData);
          if (tabsData.length > 0) setActiveTab(tabsData[0].key);
        }
      } catch (err) {
        console.error('Błąd pobierania modułu:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchModuleData();
  }, [paramKey, currentPath]);

  const getIconComponent = (iconName) => LucideIcons[iconName] || LucideIcons.Square;

  // PARYTET UPRAWNIEŃ: zakładki widoczne tylko wg capability tab:<key>:<tab>
  // (dokładnie jak w modułach systemowych — useTabAccess/Can). Superadmin/admin i
  // stan „przed załadowaniem grantów" są permisywne (can() zwraca wtedy true).
  const visibleTabs = module ? tabs.filter((t) => hasTabAccess(module.key, t.key)) : [];

  // Utrzymuj aktywną zakładkę w obrębie widocznych.
  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs, activeTab]);

  if (loading) {
    return (
      <div className="p-10 text-center">
        <Spinner size={48} className="mx-auto" />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="p-10 text-center">
        <LucideIcons.AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">{tr('Moduł nie znaleziony')}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{tr('Moduł nie istnieje lub został usunięty.')}</p>
      </div>
    );
  }

  const HeaderIcon = getIconComponent(module.icon);
  const activeTabObj = visibleTabs.find((t) => t.key === activeTab);
  const selfWrap = activeTabObj && SELF_WRAPPING_WIDGETS.has(activeTabObj.component_type);

  return (
    <div className="space-y-8">
      <PageHeader icon={HeaderIcon} title={module.label} />

      {visibleTabs.length > 0 && (
        <ResponsiveTabs
          tabs={visibleTabs.map((tab) => ({ id: tab.key, label: tab.label, icon: getIconComponent(tab.icon) }))}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      )}

      {visibleTabs.length > 0 ? (
        // Finanse (i inne self-wrapping) mają własną kartę — nie owijamy podwójnie.
        selfWrap ? (
          <TabContent tab={activeTabObj} moduleId={module.id} moduleKey={module.key} moduleName={module.label} />
        ) : (
          <section className={CARD_CLASS}>
            <TabContent tab={activeTabObj} moduleId={module.id} moduleKey={module.key} moduleName={module.label} />
          </section>
        )
      ) : (
        <section className={CARD_CLASS}>
          <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
            <LucideIcons.Layers size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            {tabs.length === 0 ? (
              <>
                <p className="text-gray-500 dark:text-gray-400 mb-2">{tr('Ten moduł nie ma jeszcze zakładek.')}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {tr('Dodaj zakładki w Ustawienia → Zarządzanie → kliknij "Zakładki" przy module.')}
                </p>
              </>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{tr('Nie masz dostępu do żadnej zakładki tego modułu.')}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// Renderuje zawartość zakładki wg component_type.
function TabContent({ tab, moduleId, moduleKey, moduleName }) {
  if (!tab) return null;
  const type = tab.component_type || 'empty';

  // Tablica projektowa (Monday-style) — pełny silnik Tablic.
  if (type === 'board') {
    return <BoardsModule moduleKey={moduleKey} />;
  }

  // Kreator graficzny — interpretuje drzewo układu (tab.layout).
  if (type === 'custom') {
    return <LayoutRenderer layout={tab.layout} moduleId={moduleId} moduleKey={moduleKey} moduleName={moduleName} tabId={tab.id} />;
  }

  // Gotowe widgety danych — przez wspólny ModuleWidget (parytet z modułami systemowymi).
  if (WIDGET_TYPES.includes(type)) {
    return <ModuleWidget widgetType={type} moduleKey={moduleKey} moduleName={moduleName} moduleId={moduleId} tabId={tab.id} />;
  }

  // empty / nieznany — placeholder.
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent">
          {tab.label}
        </h2>
      </div>
      <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
        <LucideIcons.Construction size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">{tr('Ta zakładka jest w budowie. Możesz dodać tutaj własną zawartość.')}</p>
      </div>
    </div>
  );
}
