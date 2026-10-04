import { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Home, MessageSquare } from 'lucide-react-native';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { MINISTRY_META, useCreateWallPost, useWallPosts, type WallPost } from '../../../src/features/teams/api';
import { TAB_META, TEAM_CONFIG, isTeamKey, tabGate, type TeamTabKey } from '../../../src/features/teams/config';
import { TeamTabsBar } from '../../../src/features/teams/components/TeamTabsBar';
import { WallPostCard } from '../../../src/features/teams/components/WallPostCard';
import { NewPostModal } from '../../../src/features/teams/components/NewPostModal';
import { EventsTab } from '../../../src/features/teams/tabs/EventsTab';
import { GrafikTab } from '../../../src/features/teams/tabs/GrafikTab';
import { PeopleTab, RolesTab } from '../../../src/features/teams/tabs/PeopleTab';
import { EquipmentTab } from '../../../src/features/teams/tabs/EquipmentTab';
import { FinanceTab } from '../../../src/features/teams/tabs/FinanceTab';
import { TasksTab } from '../../../src/features/teams/tabs/TasksTab';
import { KidsTodayTab } from '../../../src/features/teams/tabs/KidsTodayTab';
import { AddButton, Empty, Loading } from '../../../src/features/teams/tabs/ui';
import { useMyProfile } from '../../../src/features/account/api';
import { goBack } from '../../../src/lib/navigation';

// Wygląd nagłówka; Grupy domowe nie są w MINISTRY_META (to moduł wspólnoty).
const LOOK = {
  ...Object.fromEntries(
    Object.values(MINISTRY_META).map((m) => [m.key, { Icon: m.Icon, from: m.gradFrom, to: m.gradTo, label: m.label }]),
  ),
  homegroups: { Icon: Home, from: '#22c55e', to: '#6B6557', label: 'Grupy domowe' },
} as Record<string, { Icon: typeof Home; from: string; to: string; label: string }>;

// Zakładki prowadzące do osobnych ekranów zamiast treści w miejscu.
const NAV_TABS = new Set<TeamTabKey>(['files', 'songs']);

export default function TeamDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  // `tab` — otwarcie od razu na zakładce (np. link z powiadomienia: ?tab=schedule).
  const { ministry, tab: tabParam } = useLocalSearchParams<{ ministry: string; tab?: string }>();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const profile = useMyProfile(myEmail);
  const myName = profile.data?.full_name || profile.data?.name || null;
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const scope = { selectedCampusId, withCampusFilter };
  const perms = usePermissions();

  const valid = isTeamKey(ministry);
  const cfg = TEAM_CONFIG[valid ? ministry : 'worship'];

  // Zakładki jak na webie, każda za swoją bramką tab:<moduł>:<x>.
  const tabs = useMemo(
    () =>
      cfg.tabs
        .filter((t) => {
          const gate = tabGate(cfg, t);
          return gate ? perms.tabVisible(cfg.key, gate) : true;
        })
        .map((t) => ({
          key: t,
          label: t === 'members' && cfg.membersLabel ? cfg.membersLabel : TAB_META[t].label,
          Icon: TAB_META[t].Icon,
        })),
    [cfg, perms.tabVisible],
  );
  const [tab, setTab] = useState<TeamTabKey | null>((tabParam as TeamTabKey) ?? null);
  // Router podmienia parametry otwartego już ekranu — nowa zakładka z linku też ma zadziałać.
  useEffect(() => {
    if (tabParam) setTab(tabParam as TeamTabKey);
  }, [tabParam]);
  const active = (tab && tabs.some((t) => t.key === tab) ? tab : tabs.find((t) => !NAV_TABS.has(t.key))?.key) ?? 'events';

  const wallMinistry = cfg.wallMinistry ?? cfg.key;
  const wall = useWallPosts(wallMinistry);
  const createPost = useCreateWallPost(wallMinistry);
  const [postOpen, setPostOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onTab = (k: string) => {
    const key = k as TeamTabKey;
    if (key === 'files') {
      router.push({ pathname: '/(app)/materials', params: { team: cfg.key } });
      return;
    }
    if (key === 'songs') {
      router.push('/(app)/songs');
      return;
    }
    setTab(key);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['team'] }),
      qc.invalidateQueries({ queryKey: ['teams', 'wall'] }),
    ]);
    setRefreshing(false);
  };

  if (!valid) {
    return <NoModuleAccess message="Nie znamy takiego zespołu." />;
  }
  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EE' }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  if (!perms.moduleVisible(cfg.key)) return <NoModuleAccess />;

  const look = LOOK[cfg.key];
  const teamLabel = perms.modules.find((m) => m.key === cfg.key)?.label || look.label;

  const renderContent = () => {
    switch (active) {
      case 'checkin':
        return <KidsTodayTab myEmail={myEmail} canCreateSession={perms.can('res:checkin_sessions:create')} />;
      case 'wall':
        return (
          <View>
            <AddButton label="Nowy post" onPress={() => setPostOpen(true)} />
            {wall.isLoading ? <Loading /> : null}
            {!wall.isLoading && !(wall.data ?? []).length ? (
              <Empty Icon={MessageSquare} title="Brak postów" hint="Napisz coś do zespołu — zobaczą to też na webie." />
            ) : null}
            {((wall.data ?? []) as WallPost[]).map((p) => (
              <WallPostCard key={p.id} post={p} ministry={wallMinistry} myEmail={myEmail} myName={myName} />
            ))}
          </View>
        );
      case 'events':
        return <EventsTab cfg={cfg} scope={scope} campusIdForInsert={campusIdForInsert} myEmail={myEmail} />;
      case 'schedule':
        return <GrafikTab teamKey={cfg.key} me={{ email: myEmail, name: myName }} />;
      case 'tasks':
        return <TasksTab sourceKind={cfg.boardSourceKind} myEmail={myEmail} />;
      case 'members':
        return (
          <PeopleTab
            table={cfg.memberTable}
            rolesFor={cfg.key === 'mlodziezowka' || cfg.key === 'homegroups' || cfg.key === 'kids' ? undefined : cfg.key}
            emptyLabel="Lista jest pusta"
          />
        );
      case 'leaders':
        return <PeopleTab table={cfg.leaderTable} emptyLabel="Brak liderów na liście" />;
      case 'roles':
        return <RolesTab teamKey={cfg.key} memberTable={cfg.memberTable} />;
      case 'finance':
        return <FinanceTab cfg={cfg} scope={scope} myEmail={myEmail} myName={myName} />;
      case 'equipment':
        return <EquipmentTab teamKey={cfg.key} />;
      default:
        return null;
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: insets.top + 6,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={10}
            className="active:opacity-60"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
          </Pressable>
          <GradientIcon Icon={look.Icon} size={44} iconSize={20} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#8A6606', letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}>
              {cfg.key === 'homegroups' ? 'Panel służby' : 'Zespół'}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 21, color: '#2A2312', letterSpacing: -0.5, fontFamily: 'Manrope_700Bold' }}
            >
              {teamLabel}
            </Text>
          </View>
        </View>

        <TeamTabsBar tabs={tabs} active={active} onChange={onTab} />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2A2312" />}
        >
          {renderContent()}
        </ScrollView>
      </View>

      <NewPostModal
        visible={postOpen}
        onClose={() => setPostOpen(false)}
        isLoading={createPost.isPending}
        onSubmit={async ({ title, content }) => {
          if (!myEmail) {
            Alert.alert('Brak sesji', 'Zaloguj się ponownie.');
            return;
          }
          await createPost.mutateAsync({ title, content, authorEmail: myEmail, authorName: myName });
          setPostOpen(false);
        }}
      />
    </>
  );
}
