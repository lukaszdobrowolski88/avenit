import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { Music, Music2 } from 'lucide-react-native';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { usePlannedSongs, type PlannedProgram, type PlannedSong } from '../../../src/features/setlist/api';

export default function SetlistScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePlannedSongs();
  const programs = (data ?? []).filter((p: PlannedProgram) => p.songs.length > 0);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader title="Planowane pieśni" subtitle="Setlisty nadchodzących nabożeństw" Icon={Music} showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#e11d48', textAlign: 'center', fontFamily: 'Inter_500Medium' }}>
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : programs.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#ede9fe',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Music2 size={28} color="#7c3aed" />
            </View>
            <Text style={{ fontSize: 16, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
              Brak planowanych pieśni
            </Text>
            <Text style={{ fontSize: 13, color: '#78716c', textAlign: 'center', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
              Gdy liderzy ułożą setlistę na nadchodzące nabożeństwo, pojawi się tutaj.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />}
          >
            {programs.map((p: PlannedProgram) => (
              <View
                key={p.id}
                style={{
                  marginBottom: 14,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#eef0f3',
                  backgroundColor: '#ffffff',
                  overflow: 'hidden',
                }}
              >
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: '#7c3aed', letterSpacing: 0.4, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>
                    {formatDate(p.date, 'EEEE, d MMM yyyy')}
                  </Text>
                  <Text style={{ fontSize: 17, color: '#0c0a09', marginTop: 2, letterSpacing: -0.3, fontFamily: 'Inter_700Bold' }}>
                    {p.title || 'Nabożeństwo'}
                  </Text>
                </View>
                {p.songs.map((s: PlannedSong, i: number) => (
                  <View
                    key={`${p.id}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 11,
                      borderTopWidth: 1,
                      borderTopColor: '#f5f5f4',
                    }}
                  >
                    <Text style={{ width: 20, fontSize: 13, color: '#a8a29e', fontFamily: 'Inter_700Bold' }}>
                      {i + 1}.
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                        {s.title}
                      </Text>
                      {s.note ? (
                        <Text style={{ fontSize: 12, color: '#78716c', marginTop: 1, fontFamily: 'Inter_400Regular' }}>
                          {s.note}
                        </Text>
                      ) : null}
                    </View>
                    {s.key ? (
                      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: '#ede9fe' }}>
                        <Text style={{ fontSize: 12, color: '#6d28d9', fontFamily: 'Inter_700Bold' }}>{s.key}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}
