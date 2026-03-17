import React, { useState } from 'react';
import { Settings, RefreshCw, Calendar, CheckSquare, CalendarX, Heart, Users, MessageCircle } from 'lucide-react';

import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useDashboardData } from './hooks/useDashboardData';
import { WIDGET_DEFINITIONS } from './utils/layoutDefaults';
import { hasTabAccess } from '../../utils/tabPermissions';
import { useUserRole } from '../../hooks/useUserRole';

import DashboardGrid from './components/DashboardGrid';
import WidgetContainer from './components/WidgetContainer';
import LayoutCustomizer from './components/LayoutCustomizer';

import MyMinistryWidget from './widgets/MyMinistryWidget';
import MyTasksWidget from './widgets/MyTasksWidget';
import MyAbsencesWidget from './widgets/MyAbsencesWidget';
import MyPrayersWidget from './widgets/MyPrayersWidget';
import OnlineUsersWidget from './widgets/OnlineUsersWidget';
import UnreadMessagesWidget from './widgets/UnreadMessagesWidget';

const WIDGET_ICONS = {
  ministry: Calendar,
  tasks: CheckSquare,
  absences: CalendarX,
  prayers: Heart,
  onlineUsers: Users,
  unreadMessages: MessageCircle,
};

export default function PersonalDashboard({ user }) {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const { userRole, loading: roleLoading } = useUserRole();
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
    upcomingPrograms,
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

  const loading = layoutLoading || dataLoading || roleLoading;

  // Filtruj layout - usuń widget 'welcome' bo teraz jest w nagłówku
  const filteredLayout = layout.filter(w => w.widgetId !== 'welcome');

  const renderWidget = (widgetId) => {
    switch (widgetId) {
      case 'ministry':
        return <MyMinistryWidget upcomingMinistry={upcomingMinistry} pastMinistry={pastMinistry} userEmail={userEmail} />;
      case 'tasks':
        return <MyTasksWidget tasks={tasks} userEmail={userEmail} userName={userProfile?.full_name} onRefresh={refreshTasks} />;
      case 'absences':
        return (
          <MyAbsencesWidget
            absences={absences}
            programs={upcomingPrograms}
            userEmail={userEmail}
            userName={userProfile?.full_name}
            onRefresh={refreshAbsences}
          />
        );
      case 'prayers':
        return <MyPrayersWidget prayers={prayers} userEmail={userEmail} onRefresh={refreshPrayers} size={layout.find(l => l.widgetId === 'prayers')?.size || 'medium'} />;
      case 'onlineUsers':
        return <OnlineUsersWidget userEmail={userEmail} />;
      case 'unreadMessages':
        return <UnreadMessagesWidget userEmail={userEmail} />;
      default:
        return null;
    }
  };

  const displayName = userProfile?.full_name || userEmail?.split('@')[0] || 'Użytkowniku';
  const firstName = displayName.split(' ')[0];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Dzień dobry';
    if (hour < 18) return 'Witaj';
    return 'Dobry wieczór';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Ładowanie pulpitu...</p>
        </div>
      </div>
    );
  }

  // Filtruj widgety na podstawie widoczności i uprawnień
  const visibleWidgets = filteredLayout
    .filter(w => w.visible && hasTabAccess('dashboard', w.widgetId, userRole))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 lg:-m-6 p-4 md:p-6 lg:p-8">
      {/* Header z powitaniem */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {userProfile?.avatar_url ? (
            <img
              src={userProfile.avatar_url}
              alt="Avatar"
              className="w-14 h-14 rounded-full object-cover ring-2 ring-white dark:ring-gray-700 shadow-lg"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
              {firstName.charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {getGreeting()},
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
              {firstName}! <span className="text-gray-400 dark:text-gray-500 font-normal">Miło Cię widzieć</span>
            </h1>
          </div>
        </div>

        {/* Desktop only - hide on mobile */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={refresh}
            className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            title="Odśwież dane"
          >
            <RefreshCw size={18} />
          </button>

          {/* Customize button */}
          <button
            onClick={() => setShowCustomizer(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
          >
            <Settings size={18} />
            <span className="hidden sm:inline font-medium">Dostosuj</span>
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
              {isCustomizing ? 'Gotowe' : 'Edytuj układ'}
            </button>
          )}
        </div>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600 dark:text-gray-300">Zapisywanie...</span>
        </div>
      )}

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
                title={widget.name}
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Settings size={40} className="text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            Brak widocznych widgetów
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Wszystkie widgety są ukryte. Kliknij "Dostosuj", aby je włączyć.
          </p>
          <button
            onClick={() => setShowCustomizer(true)}
            className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            Dostosuj pulpit
          </button>
        </div>
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
