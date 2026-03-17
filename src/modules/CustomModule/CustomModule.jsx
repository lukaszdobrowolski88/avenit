import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EventsTab from '../shared/EventsTab';
import FinanceTab from '../shared/FinanceTab';
import WallTab from '../shared/WallTab';
import ScheduleTab from '../shared/ScheduleTab';
import DutyTab from '../shared/DutyTab';
import MaterialsTab from '../shared/MaterialsTab';
import MembersTab from './components/MembersTab';
import TasksTab from './components/TasksTab';
import ResponsiveTabs from '../../components/ResponsiveTabs';

export default function CustomModule() {
  const { moduleKey: paramKey } = useParams();
  const location = useLocation();
  const [module, setModule] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pobierz klucz modułu z parametru lub z ścieżki URL
  const currentPath = location.pathname;

  useEffect(() => {
    const fetchModuleData = async () => {
      setLoading(true);
      try {
        let moduleData = null;

        // Jeśli mamy parametr moduleKey, użyj go
        if (paramKey) {
          const { data, error } = await supabase
            .from('app_modules')
            .select('*')
            .eq('key', paramKey)
            .single();
          if (!error) moduleData = data;
        } else {
          // W przeciwnym razie znajdź moduł po ścieżce
          const { data, error } = await supabase
            .from('app_modules')
            .select('*')
            .eq('path', currentPath)
            .single();
          if (!error) moduleData = data;
        }

        if (!moduleData) {
          setLoading(false);
          return;
        }

        setModule(moduleData);

        // Pobierz zakładki modułu
        const { data: tabsData, error: tabsError } = await supabase
          .from('app_module_tabs')
          .select('*')
          .eq('module_id', moduleData.id)
          .order('display_order', { ascending: true });

        if (!tabsError && tabsData) {
          setTabs(tabsData);
          if (tabsData.length > 0) {
            setActiveTab(tabsData[0].key);
          }
        }
      } catch (err) {
        console.error('Błąd pobierania modułu:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchModuleData();
  }, [paramKey, currentPath]);

  const getIconComponent = (iconName) => {
    return LucideIcons[iconName] || LucideIcons.Square;
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 dark:border-pink-400 mx-auto"></div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="p-10 text-center">
        <LucideIcons.AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">Moduł nie znaleziony</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Moduł nie istnieje lub został usunięty.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Nagłówek modułu - identyczny styl jak MediaTeamModule */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
          {module.label}
        </h1>
      </div>

      {/* TAB NAVIGATION */}
      {tabs.length > 0 && (
        <ResponsiveTabs
          tabs={tabs.map(tab => ({
            id: tab.key,
            label: tab.label,
            icon: getIconComponent(tab.icon)
          }))}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      )}

      {/* Zawartość - identyczny styl jak sekcje w MediaTeamModule */}
      <section className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 relative z-[50] transition-colors duration-300">
        {tabs.length > 0 ? (
          <TabContent
            tab={tabs.find(t => t.key === activeTab)}
            moduleKey={module.key}
            moduleName={module.label}
          />
        ) : (
          <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
            <LucideIcons.Layers size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              Ten moduł nie ma jeszcze zakładek.
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Dodaj zakładki w Ustawienia → Zarządzanie → kliknij "Zakładki" przy module.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// Komponent renderujący zawartość zakładki na podstawie component_type
function TabContent({ tab, moduleKey, moduleName }) {
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserEmail(user.email);
        // Pobierz pełną nazwę użytkownika
        const { data } = await supabase
          .from('app_users')
          .select('full_name')
          .eq('email', user.email)
          .single();
        if (data) setCurrentUserName(data.full_name);
      }
    };
    fetchUser();
  }, []);

  if (!tab) return null;

  const componentType = tab.component_type || 'empty';

  switch (componentType) {
    case 'events':
      return <EventsTab ministry={moduleKey} currentUserEmail={currentUserEmail} />;

    case 'tasks':
      return <TasksTab moduleKey={moduleKey} moduleName={moduleName} currentUserEmail={currentUserEmail} />;

    case 'finance':
      return <FinanceTab ministry={moduleKey} />;

    case 'members':
      return <MembersTab moduleKey={moduleKey} moduleName={moduleName} />;

    case 'wall':
      return <WallTab ministry={moduleKey} currentUserEmail={currentUserEmail} currentUserName={currentUserName} />;

    case 'schedule':
      return <ScheduleTab moduleKey={moduleKey} moduleName={moduleName} />;

    case 'duty':
      return <DutyTab moduleKey={moduleKey} moduleName={moduleName} />;

    case 'materials':
      return <MaterialsTab moduleKey={moduleKey} canEdit={true} />;

    case 'empty':
    default:
      return (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
              {tab.label}
            </h2>
          </div>
          <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
            <LucideIcons.Construction size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              Ta zakładka jest w budowie. Możesz dodać tutaj własną zawartość.
            </p>
          </div>
        </div>
      );
  }
}
