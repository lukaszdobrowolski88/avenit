import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  ExternalLink,
  FileText,
  HelpCircle,
  LayoutGrid,
  Link2,
  Megaphone,
  MessageSquare,
  Users,
  Vote,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { usePermissions, type PermissionTab } from '../../../src/lib/permissions';
import { useAuthSession } from '../../../src/lib/auth';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { openOnWeb } from '../../../src/features/modules/useModules';
import { TeamTabsBar } from '../../../src/features/teams/components/TeamTabsBar';
import { EventsTab } from '../../../src/features/teams/tabs/EventsTab';
import { PeopleTab } from '../../../src/features/teams/tabs/PeopleTab';
import { Empty } from '../../../src/features/teams/tabs/ui';
import { WallPostCard } from '../../../src/features/teams/components/WallPostCard';
import { useWallPosts, type WallPost } from '../../../src/features/teams/api';
import {
  AnnouncementsWidget,
  ContactsWidget,
  CustomTasksWidget,
  FaqWidget,
  LayoutWidget,
  LinksWidget,
  ModuleBoardsWidget,
  PollWidget,
  type WidgetCtx,
} from '../../../src/features/custom/widgets';

const ICON: Record<string, LucideIcon> = {
  announcements: Megaphone,
  links: Link2,
  contacts: Users,
  faq: HelpCircle,
  poll: Vote,
  tasks: Briefcase,
  members: Users,
  wall: MessageSquare,
  events: CalendarDays,
  board: LayoutGrid,
  custom: FileText,
};

// Tablica modułu z kreatora: wall_posts.ministry = klucz modułu (jak WallTab na webie).
const ModuleWall = ({ moduleKey, email, name }: { moduleKey: string; email: string | null; name: string | null }) => {
  const wall = useWallPosts(moduleKey);
  const posts: WallPost[] = wall.data ?? [];
  if (!posts.length) return <Empty Icon={MessageSquare} title="Brak postów" />;
  return (
    <View>
      {posts.map((p) => (
        <WallPostCard key={p.id} post={p} ministry={moduleKey} myEmail={email} myName={name} />
      ))}
    </View>
  );
};

export default function CustomModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const moduleKey = String(key ?? '');
  const qc = useQueryClient();
  const perms = usePermissions();
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const [refreshing, setRefreshing] = useState(false);

  const mod = perms.modules.find((m) => m.key === moduleKey);
  const tabs = useMemo(
    () =>
      perms.tabs
        .filter((t: PermissionTab) => t.module_key === moduleKey && t.visible)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [perms.tabs, moduleKey],
  );
  const [tabKey, setTabKey] = useState<string | null>(null);
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EE' }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  if (!perms.moduleVisible(moduleKey)) return <NoModuleAccess />;

  const ctx: WidgetCtx = {
    moduleKey,
    moduleId: mod?.id ?? null,
    tabId: active?.id ?? null,
    userId: (user?.id as string) ?? null,
    userEmail: user?.email ?? null,
    campusId: campusIdForInsert,
    can: perms.can,
  };

  // Widżety jak ModuleWidget.jsx; nieobsługiwane natywnie → web.
  const renderWidget = (type: string): React.ReactNode => {
    switch (type) {
      case 'announcements':
        return <AnnouncementsWidget ctx={ctx} />;
      case 'links':
        return <LinksWidget ctx={ctx} />;
      case 'contacts':
        return <ContactsWidget ctx={ctx} />;
      case 'faq':
        return <FaqWidget ctx={ctx} />;
      case 'poll':
        return <PollWidget ctx={ctx} />;
      case 'tasks':
        return <CustomTasksWidget ctx={ctx} />;
      case 'members':
        return <PeopleTab table={`custom_${moduleKey}_members`} emptyLabel="Brak osób w module" />;
      case 'wall':
        return <ModuleWall moduleKey={moduleKey} email={user?.email ?? null} name={(user?.full_name as string) ?? null} />;
      case 'events':
        return (
          <EventsTab
            cfg={{ key: moduleKey, eventsTable: 'events' }}
            scope={{ selectedCampusId, withCampusFilter }}
            campusIdForInsert={campusIdForInsert}
            myEmail={user?.email ?? null}
          />
        );
      case 'board':
        return <ModuleBoardsWidget ctx={ctx} />;
      default:
        return (
          <Pressable
            onPress={() => openOnWeb(mod?.path || `/module/${moduleKey}`)}
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: '#EFEBE2' }}
          >
            <ExternalLink size={16} color="#8A6606" />
            <Text style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Otwórz tę część na webie</Text>
          </Pressable>
        );
    }
  };

  const content = () => {
    if (!active) {
      return (
        <Empty
          Icon={LayoutGrid}
          title="Moduł nie ma jeszcze zakładek"
          hint="Zakładki dodaje się w Ustawieniach → Zarządzanie na webie."
        />
      );
    }
    const ct = active.component_type ?? 'empty';
    if (ct === 'custom') {
      return <LayoutWidget ctx={ctx} role={perms.role} isAdmin={perms.isAdmin} renderWidget={renderWidget} />;
    }
    if (ct === 'empty') return <Empty Icon={FileText} title="Ta zakładka jest jeszcze pusta" />;
    return renderWidget(ct);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title={mod?.label ?? moduleKey} subtitle="Moduł kościoła" Icon={LayoutGrid} showBack />
        {tabs.length > 1 ? (
          <View style={{ marginBottom: 6 }}>
            <TeamTabsBar
              tabs={tabs.map((t) => ({ key: t.key, label: t.label, Icon: ICON[t.component_type ?? ''] ?? FileText }))}
              active={active?.key ?? ''}
              onChange={setTabKey}
            />
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await Promise.all([
                  qc.invalidateQueries({ queryKey: ['custom', moduleKey] }),
                  qc.invalidateQueries({ queryKey: ['teams', 'wall', moduleKey] }),
                  perms.refetch(),
                ]);
                setRefreshing(false);
              }}
              tintColor="#2A2312"
            />
          }
        >
          {content()}
        </ScrollView>
      </View>
    </>
  );
}
