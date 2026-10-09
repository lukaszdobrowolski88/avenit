import React, { useState } from 'react';
import { Settings, RefreshCw, Calendar, CheckSquare, CalendarX, Heart, Users, MessageCircle, CalendarDays, Zap, Cake, CalendarCheck, Gift, ClipboardCheck } from 'lucide-react';

import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useDashboardData } from './hooks/useDashboardData';
import { useMyBoardTasks } from './hooks/useMyBoardTasks';
import { WIDGET_DEFINITIONS } from './utils/layoutDefaults';
import { widgetAllowed } from './utils/widgetAccess';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useUserRole } from '../../hooks/useUserRole';
import { useT } from '../../i18n';

import DashboardGrid from './components/DashboardGrid';
import WidgetContainer from './components/WidgetContainer';
import LayoutCustomizer from './components/LayoutCustomizer';
import BrandHero, { plural } from './components/BrandHero';
import { useBrandTheme } from '../../hooks/useBrandTheme';

import MyMinistryWidget from './widgets/MyMinistryWidget';
import MyTasksWidget from './widgets/MyTasksWidget';
import MyAbsencesWidget from './widgets/MyAbsencesWidget';
import MyPrayersWidget from './widgets/MyPrayersWidget';
import OnlineUsersWidget from './widgets/OnlineUsersWidget';
import UnreadMessagesWidget from './widgets/UnreadMessagesWidget';
import UpcomingEventsWidget from './widgets/UpcomingEventsWidget';
import QuickAccessWidget from './widgets/QuickAccessWidget';
import BirthdaysWidget from './widgets/BirthdaysWidget';
import RsvpSummaryWidget from './widgets/RsvpSummaryWidget';
import GivingMonthWidget from './widgets/GivingMonthWidget';
import AttendanceWidget from './widgets/AttendanceWidget';
import PushPrompt from './components/PushPrompt';
import { tr, appLocale } from '../../i18n';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { thumbUrl } from '../../lib/imageThumb';

const WIDGET_ICONS = {
  ministry: Calendar,
  tasks: CheckSquare,
  absences: CalendarX,
  prayers: Heart,
  onlineUsers: Users,
  unreadMessages: MessageCircle,
  upcomingEvents: CalendarDays,
  quickAccess: Zap,
  birthdays: Cake,
  rsvpSummary: CalendarCheck,
  givingMonth: Gift,
  attendance: ClipboardCheck,
};

export default function PersonalDashboard({ user }) {
  const t = useT();
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const { userRole, loading: roleLoading } = useUserRole();
  const { can } = usePermissions();
  const userEmail = user?.email;
  const {
    layout,
    loading: layoutLoading,
    saving,
    updateOrder,
    updateSize,
    toggleVisibility,
    resetLayout,
  } = useDashboardLayout(userEmail);

  const {
    userProfile,
    upcomingMinistry,
    pastMinistry,
    tasks,
    absences,
    prayers,
    stats,
    loading: dataLoading,
    refresh,
    refreshTasks,
    refreshAbsences,
    refreshPrayers,
  } = useDashboardData(userEmail);

  // Zadania z tablic — JEDNO źródło dla widżetu „Moje zadania” i licznika w powitaniu
  // (wcześniej useDashboardData liczył je drugi raz, inną regułą „gotowe”).
  const boardTasks = useMyBoardTasks(userEmail, { userName: userProfile?.full_name || null });
  const openPersonal = (tasks || []).filter((tk) => tk?.source === 'personal' && tk.status !== 'done').length;
  const openBoard = boardTasks.tasks.filter((tk) => !tk.done).length;
  const statsAll = { ...(stats || {}), tasksCount: openPersonal + openBoard };

  const loading = layoutLoading || dataLoading || roleLoading;
  const brand = useBrandTheme();

  // Filtruj layout - usuń widget 'welcome' bo teraz jest w nagłówku
  const filteredLayout = layout.filter(w => w.widgetId !== 'welcome');

  const renderWidget = (widgetId) => {
    switch (widgetId) {
      case 'ministry':
        return <MyMinistryWidget upcomingMinistry={upcomingMinistry} pastMinistry={pastMinistry} userEmail={userEmail} />;
      case 'tasks':
        return <MyTasksWidget tasks={tasks} boardTasks={boardTasks} userEmail={userEmail} userName={userProfile?.full_name} onRefresh={refreshTasks} />;
      case 'absences':
        return (
          <MyAbsencesWidget absences={absences} onRefresh={refreshAbsences} />
        );
      case 'prayers':
        return <MyPrayersWidget prayers={prayers} userEmail={userEmail} onRefresh={refreshPrayers} size={layout.find(l => l.widgetId === 'prayers')?.size || 'medium'} />;
      case 'onlineUsers':
        return <OnlineUsersWidget userEmail={userEmail} />;
      case 'unreadMessages':
        return <UnreadMessagesWidget userEmail={userEmail} />;
      case 'upcomingEvents':
        return <UpcomingEventsWidget />;
      case 'quickAccess':
        return <QuickAccessWidget />;
      case 'birthdays':
        return <BirthdaysWidget />;
      case 'rsvpSummary':
        return <RsvpSummaryWidget />;
      case 'givingMonth':
        return <GivingMonthWidget />;
      case 'attendance':
        return <AttendanceWidget />;
      default:
        return null;
    }
  };

  const displayName = userProfile?.full_name || userEmail?.split('@')[0] || tr('Użytkowniku');
  const firstName = displayName.split(' ')[0];

  // Druga, cienka linia powitania w motywie Avenit — najważniejsza rzecz na dziś.
  const tasksN = statsAll.tasksCount || 0;
  const servicesN = stats?.upcomingServicesCount || 0;
  const headline = tasksN > 0
    ? `${tasksN} ${plural(tasksN, tr('zadanie do zrobienia'), tr('zadania do zrobienia'), tr('zadań do zrobienia'))}`
    : servicesN > 0
      ? `${servicesN} ${plural(servicesN, tr('służba przed Tobą'), tr('służby przed Tobą'), tr('służb przed Tobą'))}`
      : t('Miło Cię widzieć');

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Dzień dobry');
    if (hour < 18) return t('Witaj');
    return t('Dobry wieczór');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Spinner size={32} label={t('Ładowanie pulpitu...')} />
      </div>
    );
  }

  // Filtruj widgety na podstawie widoczności i uprawnień
  const visibleWidgets = filteredLayout
    .filter(w => w.visible && widgetAllowed(w.widgetId, can))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="dashboard-root min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-8">
      {/* Zachęta do włączenia powiadomień w przeglądarce (znika po włączeniu / „Nie teraz”) */}
      <PushPrompt userEmail={userEmail} />

      {/* Header z powitaniem */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {userProfile?.avatar_url ? (
            <img
              src={thumbUrl(userProfile.avatar_url, 56)}
              alt="Avatar"
              className="w-14 h-14 rounded-full object-cover ring-2 ring-white dark:ring-gray-700 shadow-lg"
            />
          ) : (
            <div data-tone={3} className="w-14 h-14 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center text-white text-xl font-bold shadow-lg">
              {firstName.charAt(0).toUpperCase()}
            </div>
          )}

          {brand ? (
            // Jak w aplikacji: etykieta z datą (musztarda), pogrubione powitanie, cienka linia
            // z tym, co dziś najważniejsze, i kropka w kurkumie.
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8A6606] dark:text-[#FFBE0B]">
                {new Date().toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="mt-1 text-[28px] md:text-[34px] leading-[1.12] tracking-[-0.035em] text-gray-900 dark:text-white">
                <span className="font-extrabold">{getGreeting()}, {firstName}!</span>{' '}
                <span className="font-light">{headline}</span>
                <span className="font-extrabold text-[#FFBE0B]">.</span>
              </h1>
            </div>
          ) : (
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {getGreeting()},
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
              {firstName}! <span className="text-gray-400 dark:text-gray-500 font-normal">{t('Miło Cię widzieć')}</span>
            </h1>
          </div>
          )}
        </div>

        {/* Desktop only - hide on mobile */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={refresh}
            className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            title={t('Odśwież dane')}
          >
            <RefreshCw size={18} />
          </button>

          {/* Customize button */}
          <button
            onClick={() => setShowCustomizer(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
          >
            <Settings size={18} />
            <span className="hidden sm:inline font-medium">{t('Dostosuj')}</span>
          </button>

          {/* Toggle edit mode */}
          {visibleWidgets.length > 0 && (
            <button
              onClick={() => setIsCustomizing(!isCustomizing)}
              className={`px-4 py-2.5 rounded-xl border font-medium transition-all shadow-sm ${
                isCustomizing
                  ? 'bg-green-500 text-white border-green-500 hover:bg-green-600'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {isCustomizing ? t('Gotowe') : t('Edytuj układ')}
            </button>
          )}
        </div>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <Spinner size={16} />
          <span className="text-sm text-gray-600 dark:text-gray-300">{tr('Zapisywanie...')}</span>
        </div>
      )}

      {brand && <BrandHero upcomingMinistry={upcomingMinistry} stats={statsAll} />}

      {/* Widgets Grid */}
      {visibleWidgets.length > 0 ? (
        <DashboardGrid
          layout={filteredLayout}
          onReorder={isCustomizing ? updateOrder : undefined}
        >
          {visibleWidgets.map(item => {
            const widget = WIDGET_DEFINITIONS[item.widgetId];
            if (!widget || item.widgetId === 'welcome') return null;

            const IconComponent = WIDGET_ICONS[item.widgetId] || Settings;

            return (
              <WidgetContainer
                key={item.widgetId}
                widgetId={item.widgetId}
                title={t(widget.name)}
                icon={IconComponent}
                size={item.size}
                isCustomizing={isCustomizing}
                onSizeChange={(newSize) => updateSize(item.widgetId, newSize)}
                onHide={() => toggleVisibility(item.widgetId)}
              >
                {renderWidget(item.widgetId)}
              </WidgetContainer>
            );
          })}
        </DashboardGrid>
      ) : (
        <EmptyState
          icon={Settings}
          title={tr('Brak widocznych widgetów')}
          subtitle={tr('Wszystkie widgety są ukryte. Kliknij "Dostosuj", aby je włączyć.')}
          action={<Button onClick={() => setShowCustomizer(true)}>Dostosuj pulpit</Button>}
        />
      )}

      {/* Layout Customizer Modal */}
      <LayoutCustomizer
        isOpen={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        layout={filteredLayout}
        onToggleVisibility={toggleVisibility}
        onSizeChange={updateSize}
        onReset={resetLayout}
        userRole={userRole}
      />
    </div>
  );
}
