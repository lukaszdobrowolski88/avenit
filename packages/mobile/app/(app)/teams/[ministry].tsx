import { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Home, MessageSquare } from 'lucide-react-native';
import { B, IconWell } from '../../../src/components/ui/brand';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { NoModuleAccess } from '../../../src/components/ModuleGate';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { MINISTRY_META, useCreateWallPost, useWallPosts, type WallPost } from '../../../src/features/teams/api';
import { TAB_META, TEAM_CONFIG, isTeamKey, tabGate, type TeamTabKey } from '../../../src/features/teams/config';
import { useRoster, type RosterPerson } from '../../../src/features/teams/roster';
import { TeamTabsBar } from '../../../src/features/teams/components/TeamTabsBar';
import { WallPostCard } from '../../../src/features/teams/components/WallPostCard';
import { NewPostModal } from '../../../src/features/teams/components/NewPostModal';
import { OverviewTab } from '../../../src/features/teams/tabs/OverviewTab';
import { EventsTab } from '../../../src/features/teams/tabs/EventsTab';
import { GrafikTab } from '../../../src/features/teams/tabs/GrafikTab';
import { PeopleTab } from '../../../src/features/teams/tabs/PeopleTab';
import { RosterTab } from '../../../src/features/teams/tabs/RosterTab';
import { RolesTab } from '../../../src/features/teams/tabs/RolesTab';
import { EquipmentTab } from '../../../src/features/teams/tabs/EquipmentTab';
import { FinanceTab } from '../../../src/features/teams/tabs/FinanceTab';
import { TasksTab } from '../../../src/features/teams/tabs/TasksTab';
import { KidsTodayTab } from '../../../src/features/teams/tabs/KidsTodayTab';
import { HouseholdsTab, KidsGroupsTab, KidsStudentsTab } from '../../../src/features/teams/tabs/KidsTabs';
import { AddButton, Empty, Loading } from '../../../src/features/teams/tabs/ui';
import { useMyProfile } from '../../../src/features/account/api';
import { goBack } from '../../../src/lib/navigation';

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

// Ikona i nazwa zapasowa; Grupy domowe nie są w MINISTRY_META (to moduł wspólnoty).
const LOOK = {
  ...Object.fromEntries(Object.values(MINISTRY_META).map((m) => [m.key, { Icon: m.Icon, label: m.label }])),
  homegroups: { Icon: Home, label: 'Grupy domowe' },
} as Record<string, { Icon: typeof Home; label: string }>;

// Zakładki prowadzące do osobnych ekranów zamiast treści w miejscu.
const NAV_TABS = new Set<TeamTabKey>(['files', 'songs']);

// Zespoły ze składem w tabeli zespołu i służbami (team_roles) — reszta ma prostą listę osób.
const ROSTER_TEAMS = new Set(['worship', 'media', 'atmosfera', 'kids']);

const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

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
  const me = useMemo(() => ({ email: myEmail, name: myName }), [myEmail, myName]);
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const scope = { selectedCampusId, withCampusFilter };
  const perms = usePermissions();

  const valid = isTeamKey(ministry);
  const cfg = TEAM_CONFIG[valid ? ministry : 'worship'];
  const rosterTeam = ROSTER_TEAMS.has(cfg.key);

  // Zakładki jak na webie, każda za swoją bramką tab:<moduł>:<x>.
  const tabs = useMemo(
    () =>
      cfg.tabs
        .filter((t) => {
          // Rodziny to zasób modułu Członkowie — bez niego zakładka byłaby pusta (403).
          if (t === 'households' && !perms.can('res:households:read')) return false;
          const gate = tabGate(cfg, t);
          return gate ? perms.tabVisible(cfg.key, gate) : true;
        })
        .map((t) => ({
          key: t,
          label: t === 'members' && cfg.membersLabel ? cfg.membersLabel : TAB_META[t].label,
          Icon: TAB_META[t].Icon,
        })),
    [cfg, perms.tabVisible, perms.can],
  );
  const [tab, setTab] = useState<TeamTabKey | null>((tabParam as TeamTabKey) ?? null);
  // Router podmienia parametry otwartego już ekranu — nowa zakładka z linku też ma zadziałać.
  useEffect(() => {
    if (tabParam) setTab(tabParam as TeamTabKey);
  }, [tabParam]);
  const active = (tab && tabs.some((t) => t.key === tab) ? tab : tabs.find((t) => !NAV_TABS.has(t.key))?.key) ?? 'events';

  const wallMinistry = cfg.wallMinistry ?? cfg.key;
  const hasWall = cfg.tabs.includes('wall');
  const wall = useWallPosts(wallMinistry);
  const createPost = useCreateWallPost(wallMinistry);
  const [postOpen, setPostOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const roster = useRoster(cfg.key, rosterTeam ? cfg.memberTable : undefined);

  // Uprawnienia do edycji (serwer i tak je egzekwuje — tu tylko chowamy przyciski).
  const table = cfg.memberTable ?? '';
  const canPeopleCreate = perms.can(`res:${table}:create`);
  const canPeopleEdit = perms.can(`res:${table}:update`);
  const canPeopleDelete = perms.can(`res:${table}:delete`);
  const canEditGrafik = perms.can('res:events:update') && perms.can('res:schedule_assignments:create');
  const canSendInvites = perms.can('action:programs:send_assignment');
  const myRole = perms.ministries.find((m) => m.ministry_key === cfg.key && m.role === 'leader')
    ? 'Lider'
    : perms.ministries.some((m) => m.ministry_key === cfg.key)
      ? 'Członek zespołu'
      : null;

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
    await Promise.all([qc.invalidateQueries({ queryKey: ['team'] }), qc.invalidateQueries({ queryKey: ['teams', 'wall'] })]);
    setRefreshing(false);
  };

  if (!valid) {
    return <NoModuleAccess message="Nie znamy takiego zespołu." />;
  }
  if (!perms.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: B.paper }}>
        <ActivityIndicator color={B.ink} />
      </View>
    );
  }
  if (!perms.moduleVisible(cfg.key)) return <NoModuleAccess />;

  const look = LOOK[cfg.key];
  const teamLabel = perms.modules.find((m) => m.key === cfg.key)?.label || look.label;
  const activePeople = roster.data?.people.filter((p: RosterPerson) => p.active).length ?? 0;
  const roleCount = roster.data?.roles.length ?? 0;
  const summary = roster.data
    ? [
        cfg.key === 'kids'
          ? `${activePeople} ${plural(activePeople, 'nauczyciel', 'nauczycieli', 'nauczycieli')}`
          : `${activePeople} ${plural(activePeople, 'osoba', 'osoby', 'osób')}`, cfg.tabs.includes('roles') && roleCount ? `${roleCount} ${plural(roleCount, 'służba', 'służby', 'służb')}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;
  const posts: WallPost[] = wall.data ?? [];
  const peopleNames = ((roster.data?.people ?? []) as RosterPerson[]).filter((p) => p.active).map((p) => p.name);

  const renderContent = () => {
    switch (active) {
      case 'overview':
        return (
          <OverviewTab
            team={cfg.key}
            table={cfg.memberTable}
            tabs={tabs.map((t) => t.key)}
            me={me}
            canEditGrafik={canEditGrafik}
            latestPost={hasWall ? posts.find((p) => !p.pinned) ?? posts[0] ?? null : null}
            scope={scope}
            onTab={onTab}
          />
        );
      case 'checkin':
        return (
          <KidsTodayTab
            myEmail={myEmail}
            canCheckIn={perms.can('res:checkins:create')}
            canCheckOut={perms.can('res:checkins:update')}
            canReadHouseholds={perms.can('res:households:read')}
            scope={scope}
          />
        );
      case 'wall':
        return (
          <View>
            <AddButton label="Nowy post" onPress={() => setPostOpen(true)} />
            {wall.isLoading ? <Loading /> : null}
            {!wall.isLoading && !posts.length ? (
              <Empty Icon={MessageSquare} title="Brak postów" hint="Napisz coś do zespołu — zobaczą to też na webie." />
            ) : null}
            {posts.map((p) => (
              <WallPostCard key={p.id} post={p} ministry={wallMinistry} myEmail={myEmail} myName={myName} />
            ))}
          </View>
        );
      case 'events':
        return <EventsTab cfg={cfg} scope={scope} campusIdForInsert={campusIdForInsert} myEmail={myEmail} />;
      case 'schedule':
        return <GrafikTab teamKey={cfg.key} teamLabel={teamLabel} me={me} canEdit={canEditGrafik} canSend={canSendInvites} />;
      case 'tasks':
        return <TasksTab sourceKind={cfg.boardSourceKind} myEmail={myEmail} />;
      case 'members':
        return rosterTeam && cfg.memberTable ? (
          <RosterTab
            team={cfg.key}
            table={cfg.memberTable}
            canCreate={canPeopleCreate}
            canEdit={canPeopleEdit}
            canDelete={canPeopleDelete}
            withFunction={cfg.key === 'kids'}
          />
        ) : (
          <PeopleTab table={cfg.memberTable} emptyLabel="Lista jest pusta" />
        );
      case 'leaders':
        return <PeopleTab table={cfg.leaderTable} emptyLabel="Brak liderów na liście" />;
      case 'roles':
        return <RolesTab team={cfg.key} table={table} canEdit={canPeopleEdit} canDelete={canPeopleDelete} />;
      case 'groups':
        return (
          <KidsGroupsTab
            scope={scope}
            campusIdForInsert={campusIdForInsert}
            canCreate={perms.can('res:kids_groups:create')}
            canEdit={perms.can('res:kids_groups:update')}
            canDelete={perms.can('res:kids_groups:delete')}
          />
        );
      case 'students':
        return (
          <KidsStudentsTab
            scope={scope}
            campusIdForInsert={campusIdForInsert}
            canReadHouseholds={perms.can('res:households:read')}
            canCreate={perms.can('res:kids_students:create')}
            canEdit={perms.can('res:kids_students:update')}
            canDelete={perms.can('res:kids_students:delete')}
          />
        );
      case 'households':
        return (
          <HouseholdsTab
            scope={scope}
            canCreate={perms.can('res:households:create')}
            canEdit={perms.can('res:households:update')}
            canDelete={perms.can('res:households:delete')}
          />
        );
      case 'finance':
        return <FinanceTab cfg={cfg} scope={scope} myEmail={myEmail} myName={myName} />;
      case 'equipment':
        return (
          <EquipmentTab
            teamKey={cfg.key}
            people={peopleNames}
            myEmail={myEmail}
            canCreate={perms.can('res:equipment:create')}
            canEdit={perms.can('res:equipment:update')}
            canDelete={perms.can('res:equipment:delete')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 6, paddingBottom: 12 }}>
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={10}
            accessibilityLabel="Wróć"
            className="active:opacity-60"
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color={B.ink} strokeWidth={2.2} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 16, paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: B.gold, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.bold }}>
                {cfg.key === 'homegroups' ? 'Panel służby' : 'Zespół'}
                {myRole ? ` · ${myRole}` : ''}
              </Text>
              <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 30, lineHeight: 34, color: B.ink, letterSpacing: -0.9, fontFamily: F.bold }}>
                {teamLabel}
              </Text>
              {summary ? <Text style={{ marginTop: 4, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>{summary}</Text> : null}
            </View>
            <IconWell Icon={look.Icon} tone="kurkuma" size={52} />
          </View>
        </View>

        <TeamTabsBar tabs={tabs} active={active} onChange={onTab} />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.ink} />}
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
