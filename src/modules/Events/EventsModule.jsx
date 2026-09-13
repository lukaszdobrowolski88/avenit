// Moduł „Wydarzenia" — pełnoprawny moduł (zastępuje dawny „Kalendarz").
// Wygląd i konfiguracja jak inne moduły: PageHeader (okładka/kolor/nazwa z konfiguracji
// modułu 'calendar') + ResponsiveTabs. Zakładki: Lista | Kalendarz | Archiwum.
// Widoczność wydarzeń egzekwowana serwerowo (PR A) niezależnie od widoku.
import { useState, lazy, Suspense } from 'react';
import { Calendar as CalendarIcon, List, Archive, Plus } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ResponsiveTabs from '../../components/ResponsiveTabs';
import Spinner from '../../components/Spinner';
import { useModuleLabel } from '../../hooks/useModuleLabel';
import { useT } from '../../i18n';
import EventsListView from './EventsListView';

const CalendarModule = lazy(() => import('../CalendarModule'));

export default function EventsModule() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('lista');
  const title = useModuleLabel('calendar', 'Wydarzenia');

  const tabs = [
    { id: 'lista', label: t('Lista'), icon: List },
    { id: 'kalendarz', label: t('Kalendarz'), icon: CalendarIcon },
    { id: 'archiwum', label: t('Archiwum'), icon: Archive },
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <PageHeader
          moduleKey="calendar"
          icon={CalendarIcon}
          title={title}
          subtitle={t('Wszystkie wydarzenia — lista, kalendarz i archiwum')}
          actions={
            activeTab !== 'kalendarz' && (
              <button onClick={() => setActiveTab('kalendarz')}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium shadow-md hover:shadow-lg transition-all">
                <Plus size={18} />
                {t('Nowe wydarzenie')}
              </button>
            )
          }
        />
        <ResponsiveTabs moduleKey="calendar" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mt-4" />
      </div>

      <div className={`flex-1 min-h-0 ${activeTab === 'kalendarz' ? 'p-2 md:p-4' : 'overflow-auto p-4 md:p-6'}`}>
        {activeTab === 'lista' && <EventsListView mode="list" />}
        {activeTab === 'archiwum' && <EventsListView mode="archive" />}
        {activeTab === 'kalendarz' && (
          <Suspense fallback={<Spinner center size={28} />}>
            <CalendarModule embedded />
          </Suspense>
        )}
      </div>
    </div>
  );
}
