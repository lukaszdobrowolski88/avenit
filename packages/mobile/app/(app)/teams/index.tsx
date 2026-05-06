import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { ALL_MINISTRIES } from '../../../src/features/teams/api';

export default function TeamsListScreen() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader title="Zespoły" subtitle="Tablice, wydarzenia, grafiki" Icon={Users} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          {ALL_MINISTRIES.map((m) => (
            <Link
              key={m.key}
              href={{ pathname: '/(app)/teams/[ministry]', params: { ministry: m.key } }}
              asChild
            >
              <Pressable
                className="active:opacity-80"
                style={{
                  marginBottom: 10,
                  borderRadius: 16,
                  backgroundColor: '#ffffff',
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.04,
                  shadowRadius: 10,
                  elevation: 1,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#eef0f3',
                  }}
                >
                  <GradientIcon
                    Icon={m.Icon}
                    size={48}
                    iconSize={22}
                    from={m.gradFrom}
                    to={m.gradTo}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        color: '#0c0a09',
                        letterSpacing: -0.3,
                        fontFamily: 'Inter_700Bold',
                      }}
                    >
                      {m.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#78716c',
                        marginTop: 2,
                        fontFamily: 'Inter_500Medium',
                      }}
                    >
                      Tablica · Wydarzenia{m.teamType ? ' · Grafik' : ''}
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#a8a29e" strokeWidth={2.2} />
                </View>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </View>
    </>
  );
}
