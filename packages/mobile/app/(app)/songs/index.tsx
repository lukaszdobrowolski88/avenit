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
import { Link, useRouter } from 'expo-router';
import { FolderOpen, Music, Plus, Search, Tags, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, InfoBlock } from '../../../src/components/ui/brand';
import { useSongLibrary, type SongListItem } from '../../../src/features/songs/library';
import { ProgramsManagerModal } from '../../../src/features/songs/components/ProgramsManagerModal';
import { SongFormModal } from '../../../src/features/songs/components/SongFormModal';
import { TagsSheet } from '../../../src/features/songs/components/TagsSheet';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';

export default function SongsScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const perms = usePermissions();
  const canCreate = perms.can('res:songs:create');
  const canEdit = perms.can('res:songs:update');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [programsVisible, setProgramsVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const { data, isLoading, isError, error, refetch, isRefetching } = useSongLibrary();
  const allSongs = (data ?? []) as SongListItem[];

  // Tagi wg liczby pieśni (jak dotąd).
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allSongs) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
  }, [allSongs]);

  // Szukanie po tytule, autorze i tagach (bez polskich znaków też: „blogoslaw”).
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const filtered = useMemo(() => {
    const q = fold(search.trim());
    return allSongs.filter((s) => {
      const matchesSearch = !q || fold(`${s.title} ${s.author ?? ''} ${s.tags.join(' ')}`).includes(q);
      const matchesTag = !activeTag || s.tags.includes(activeTag);
      return matchesSearch && matchesTag;
    });
  }, [allSongs, search, activeTag]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title="Pieśni"
          subtitle="Repertuar zespołu"
          Icon={Music}
          showBack
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
            {canEdit ? (
              <Pressable
                onPress={() => setManagingTags(true)}
                hitSlop={8}
                accessibilityLabel="Tagi"
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E1D5' }}
              >
                <Tags size={15} color="#8A6606" />
              </Pressable>
            ) : null}
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
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E6E1D5',
              }}
            >
              <FolderOpen size={14} color="#8A6606" />
              <Text
                style={{
                  fontSize: 12,
                  color: '#2A2312',
                  fontFamily: 'Manrope_700Bold',
                  letterSpacing: -0.1,
                }}
              >
                Programy
              </Text>
            </Pressable>
            </View>
          }
        />

        <View className="px-4 pb-3">
          <View
            className="flex-row items-center gap-2 px-3.5"
            style={{
              height: 46,
              borderRadius: 24,
              backgroundColor: '#FFFFFF',
            }}
          >
            <Search size={18} color="#857F70" />
            <TextInput
              className="flex-1 text-base"
              style={{ color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
              placeholder="Tytuł, autor albo tag…"
              placeholderTextColor="#857F70"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <X size={16} color="#857F70" />
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
                label={`Wszystkie · ${allSongs.length}`}
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
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
            ItemSeparatorComponent={() => (
              <View style={{ backgroundColor: B.card }}>
                <View style={{ height: 1, marginLeft: 82, backgroundColor: B.line }} />
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#FFF8E1',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Music size={28} color="#8A6606" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Brak pieśni
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                >
                  {search || activeTag
                    ? 'Spróbuj zmienić filtr lub wyszukiwanie.'
                    : canCreate
                      ? 'Dodaj pierwszą pieśń przyciskiem +.'
                      : 'Baza pieśni jest pusta.'}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const first = index === 0;
              const last = index === filtered.length - 1;
              return (
                <Link push href={{ pathname: '/(app)/songs/[id]', params: { id: String(item.id) } }} asChild>
                  {/* Wiersz pieśni: na początku tonacja i tempo — to, czego zespół szuka najpierw. */}
                  <Pressable
                    className="active:opacity-80"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: B.card,
                      borderTopLeftRadius: first ? 22 : 0,
                      borderTopRightRadius: first ? 22 : 0,
                      borderBottomLeftRadius: last ? 22 : 0,
                      borderBottomRightRadius: last ? 22 : 0,
                    }}
                  >
                    <InfoBlock top={item.key || '—'} bottom={item.tempo ? `${item.tempo} bpm` : null} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: 'Manrope_600SemiBold' }}>
                        {item.title}
                      </Text>
                      {item.author || item.tags.length > 0 ? (
                        <Text numberOfLines={1} style={{ fontSize: 13, color: B.ink3, marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                          {[item.author, ...item.tags.slice(0, item.author ? 2 : 3)].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </Link>
              );
            }}
          />
        )}
      </View>

      {canCreate ? (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel="Nowa pieśń"
          className="active:opacity-80"
          style={{
            position: 'absolute',
            right: 18,
            bottom: 108,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#2A2312',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#2A2312',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Plus size={24} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
      ) : null}
      {canCreate ? (
        <SongFormModal
          visible={creating}
          song={null}
          allTags={tags.map((t) => t.tag)}
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push({ pathname: '/(app)/songs/[id]', params: { id: String(id) } })}
        />
      ) : null}
      {canEdit ? (
        <TagsSheet visible={managingTags} songs={allSongs} canDelete={canEdit} onClose={() => setManagingTags(false)} />
      ) : null}
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
      backgroundColor: active ? '#2A2312' : '#ECE8DE',
    }}
  >
    <Text
      className="text-[13px]"
      style={{
        color: active ? '#ffffff' : '#2A2312',
        fontFamily: 'Manrope_600SemiBold',
      }}
    >
      {label}
    </Text>
  </Pressable>
);
