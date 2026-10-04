import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight, Users } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, IconWell, ListCard, ListRow, SectionLabel } from '../../../src/components/ui/brand';
import { ALL_MINISTRIES } from '../../../src/features/teams/api';
import { openModule, useModules, type ModuleItem } from '../../../src/features/modules/useModules';

// Zespoły i służby, do których ta osoba ma dostęp (jak sidebar weba): natywne ekrany
// dla 5 wbudowanych służb, moduły z kreatora otwierane na webie.
export default function TeamsListScreen() {
  const router = useRouter();
  const { ready, items, perms } = useModules();
  const teams = items.filter((it) => it.section === 'teams' && it.key !== 'songs');
  // Rola w służbie (przynależność) — lider wyróżniony słodem, członek kurkumą.
  const roleOf = (key: string) => {
    const mine = perms.ministries.filter((m) => m.ministry_key === key);
    if (!mine.length) return null;
    return mine.some((m) => m.role === 'leader') ? 'leader' : 'member';
  };
  const mineTeams = teams.filter((t) => roleOf(t.key));
  const otherTeams = teams.filter((t) => !roleOf(t.key));

  const row = (t: ModuleItem) => {
    const native = ALL_MINISTRIES.find((m) => m.key === t.key);
    const role = roleOf(t.key);
    return (
      <ListRow
        key={t.key}
        leading={<IconWell Icon={t.Icon} size={46} tone={role === 'leader' ? 'slod' : role === 'member' ? 'kurkuma' : 'paper'} />}
        title={t.label}
        subtitle={native ? `Tablica · Wydarzenia${native.teamType ? ' · Grafik' : ''}` : 'Otwiera się na stronie kościoła'}
        meta={
          role ? (
            <Text style={{ fontSize: 11, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_700Bold' }}>
              {role === 'leader' ? 'Lider' : 'Członek zespołu'}
            </Text>
          ) : null
        }
        right={t.isWeb ? <ArrowUpRight size={18} color={B.ink4} strokeWidth={2.2} /> : undefined}
        noChevron={t.isWeb}
        onPress={() => openModule(t, router)}
      />
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Zespoły" subtitle="Tablice, wydarzenia, grafiki" Icon={Users} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          {!ready ? (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator color="#2A2312" />
            </View>
          ) : null}
          {ready && teams.length === 0 ? (
            <Text
              style={{
                paddingVertical: 40,
                textAlign: 'center',
                color: '#857F70',
                fontFamily: 'Manrope_500Medium',
              }}
            >
              Nie należysz jeszcze do żadnego zespołu.
            </Text>
          ) : null}
          {mineTeams.length ? (
            <>
              <SectionLabel count={mineTeams.length}>Twoje zespoły</SectionLabel>
              <ListCard>{mineTeams.map(row)}</ListCard>
            </>
          ) : null}
          {otherTeams.length ? (
            <>
              <SectionLabel count={otherTeams.length}>{mineTeams.length ? 'Pozostałe' : 'Wszystkie zespoły'}</SectionLabel>
              <ListCard>{otherTeams.map(row)}</ListCard>
            </>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
