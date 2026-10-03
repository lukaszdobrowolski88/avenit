import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight, ChevronRight, Users } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { ALL_MINISTRIES } from '../../../src/features/teams/api';
import { openModule, useModules } from '../../../src/features/modules/useModules';

// Zespoły i służby, do których ta osoba ma dostęp (jak sidebar weba): natywne ekrany
// dla 5 wbudowanych służb, moduły z kreatora otwierane na webie.
export default function TeamsListScreen() {
  const router = useRouter();
  const { ready, items } = useModules();
  const teams = items.filter((it) => it.section === 'teams' && it.key !== 'songs');

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader title="Zespoły" subtitle="Tablice, wydarzenia, grafiki" Icon={Users} showBack />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          {!ready ? (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          ) : null}
          {ready && teams.length === 0 ? (
            <Text
              style={{
                paddingVertical: 40,
                textAlign: 'center',
                color: '#a8a29e',
                fontFamily: 'Inter_500Medium',
              }}
            >
              Nie należysz jeszcze do żadnego zespołu.
            </Text>
          ) : null}
          {teams.map((t) => {
            const native = ALL_MINISTRIES.find((m) => m.key === t.key);
            return (
              <Pressable
                key={t.key}
                onPress={() => openModule(t, router)}
                className="active:opacity-70"
                style={{ marginBottom: 10 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    borderRadius: 18,
                    backgroundColor: '#f7f6f5',
                  }}
                >
                  {native ? (
                    <GradientIcon
                      Icon={native.Icon}
                      size={48}
                      iconSize={22}
                      from={native.gradFrom}
                      to={native.gradTo}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: t.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <t.Icon size={22} color={t.tint} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        color: '#0c0a09',
                        letterSpacing: -0.3,
                        fontFamily: 'Inter_700Bold',
                      }}
                    >
                      {t.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#78716c',
                        marginTop: 2,
                        fontFamily: 'Inter_500Medium',
                      }}
                    >
                      {native
                        ? `Tablica · Wydarzenia${native.teamType ? ' · Grafik' : ''}`
                        : 'Otwiera się na stronie kościoła'}
                    </Text>
                  </View>
                  {t.isWeb ? (
                    <ArrowUpRight size={18} color="#a8a29e" strokeWidth={2.2} />
                  ) : (
                    <ChevronRight size={18} color="#a8a29e" strokeWidth={2.2} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </>
  );
}
