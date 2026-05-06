import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { FolderOpen, Music, Search, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useSongsList, useSongTags } from '../../../src/features/songs/api';
import { ProgramsManagerModal } from '../../../src/features/songs/components/ProgramsManagerModal';
import { useAuthSession } from '../../../src/lib/auth';

export default function SongsScreen() {
  const { user } = useAuthSession();
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [programsVisible, setProgramsVisible] = useState(false);
  const { data: allSongs, isLoading, isError, error, refetch, isRefetching } = useSongsList('');
  const tags = useSongTags(allSongs);

  const filtered = useMemo(() => {
    const list = allSongs ?? [];
    return list.filter((s) => {
      const matchesSearch =
        !search.trim() || s.title.toLowerCase().includes(search.trim().toLowerCase());
      const matchesTag =
        !activeTag || (Array.isArray(s.tags) && s.tags.includes(activeTag));
      return matchesSearch && matchesTag;
    });
  }, [allSongs, search, activeTag]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Pieśni"
          subtitle="Repertuar zespołu"
          Icon={Music}
          right={
            <Pressable
              onPress={() => setProgramsVisible(true)}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#fafaf9',
                borderWidth: 1,
                borderColor: '#eef0f3',
              }}
            >
              <FolderOpen size={14} color="#ec4899" />
              <Text
                style={{
                  fontSize: 12,
                  color: '#0c0a09',
                  fontFamily: 'Inter_700Bold',
                  letterSpacing: -0.1,
                }}
              >
                Programy
              </Text>
            </Pressable>
          }
        />

        <View className="px-4 pb-3">
          <View
            className="flex-row items-center gap-2 px-3.5"
            style={{
              height: 46,
              borderRadius: 14,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#eef0f3',
            }}
          >
            <Search size={18} color="#a8a29e" />
            <TextInput
              className="flex-1 text-base"
              style={{ color: '#0c0a09', fontFamily: 'Inter_500Medium' }}
              placeholder="Szukaj pieśni…"
              placeholderTextColor="#a8a29e"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <X size={16} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {tags.length > 0 && (
          <View style={{ height: 44 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 8,
                gap: 6,
                alignItems: 'center',
              }}
            >
              <Chip
                active={activeTag === null}
                label={`Wszystkie · ${allSongs?.length ?? 0}`}
                onPress={() => setActiveTag(null)}
              />
              {tags.map(({ tag, count }) => (
                <Chip
                  key={tag}
                  active={activeTag === tag}
                  label={`${tag} · ${count}`}
                  onPress={() => setActiveTag(activeTag === tag ? null : tag)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#fef3f2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Music size={28} color="#ec4899" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak pieśni
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  {search || activeTag
                    ? 'Spróbuj zmienić filtr lub wyszukiwanie.'
                    : 'Pieśni dodajesz w aplikacji webowej.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Link
                href={{ pathname: '/(app)/songs/[id]', params: { id: String(item.id) } }}
                asChild
              >
                <Pressable
                  className="active:opacity-80"
                  style={{
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
                    className="flex-row items-center gap-3 p-3.5"
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: '#eef0f3',
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: '#fef3f2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Music size={18} color="#ec4899" />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-[15px]"
                        style={{
                          color: '#0c0a09',
                          letterSpacing: -0.3,
                          fontFamily: 'Inter_600SemiBold',
                        }}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        {item.key ? (
                          <Text
                            className="text-[12px]"
                            style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
                          >
                            {item.key}
                          </Text>
                        ) : null}
                        {item.tempo ? (
                          <Text
                            className="text-[12px]"
                            style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
                          >
                            {item.tempo} BPM
                          </Text>
                        ) : null}
                        {Array.isArray(item.tags) && item.tags.length > 0 ? (
                          <View className="flex-row gap-1">
                            {item.tags.slice(0, 2).map((t) => (
                              <View
                                key={t}
                                className="px-1.5 py-0.5"
                                style={{ borderRadius: 4, backgroundColor: '#f5f5f4' }}
                              >
                                <Text
                                  className="text-[10px]"
                                  style={{ color: '#57534e', fontFamily: 'Inter_500Medium' }}
                                >
                                  {t}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Link>
            )}
          />
        )}
      </View>

      <ProgramsManagerModal
        visible={programsVisible}
        onClose={() => setProgramsVisible(false)}
        myEmail={user?.email ?? null}
      />
    </>
  );
}

const Chip = ({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-80"
    style={{
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: active ? '#0c0a09' : '#fafaf9',
      borderWidth: 1,
      borderColor: active ? '#0c0a09' : '#eef0f3',
    }}
  >
    <Text
      className="text-[13px]"
      style={{
        color: active ? '#ffffff' : '#1c1917',
        fontFamily: 'Inter_600SemiBold',
      }}
    >
      {label}
    </Text>
  </Pressable>
);
