import { useState } from 'react';
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
import { Search, Users, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { CampusBadge, useCampusBadge } from '../../../src/components/CampusBadge';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  useMembers,
  useMemberFilters,
  fullName,
  initials,
  STATUS_META,
  MINISTRY_LABELS,
  type MemberStatus,
} from '../../../src/features/members/api';

const STATUSES: { key: MemberStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Wszyscy' },
  { key: 'Członek', label: 'Członkowie' },
  { key: 'Sympatyk', label: 'Sympatycy' },
  { key: 'Gość', label: 'Goście' },
];

export default function MembersScreen() {
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const { getCampus } = useCampusBadge();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemberStatus | 'all'>('all');
  const [ministryFilter, setMinistryFilter] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch, isRefetching } = useMembers({
    selectedCampusId,
    withCampusFilter,
  });
  const filtered = useMemberFilters(data, search, statusFilter, ministryFilter);

  const counts = {
    all: data?.length ?? 0,
    Członek: (data ?? []).filter((m) => m.status === 'Członek').length,
    Sympatyk: (data ?? []).filter((m) => m.status === 'Sympatyk').length,
    Gość: (data ?? []).filter((m) => m.status === 'Gość').length,
  };

  const ministriesInData = Array.from(
    new Set((data ?? []).flatMap((m) => m.ministries ?? [])),
  ).filter(Boolean);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Społeczność"
          subtitle={`${filtered.length} z ${data?.length ?? 0}`}
          showBack
          Icon={Users}
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
              placeholder="Szukaj po imieniu lub email…"
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
            {STATUSES.map((s) => {
              const active = statusFilter === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setStatusFilter(s.key)}
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
                    {s.label} · {counts[s.key]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {ministriesInData.length > 0 && (
          <View style={{ height: 40 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 6,
                gap: 6,
                alignItems: 'center',
              }}
            >
              <Text
                className="text-[12px] mr-1 self-center"
                style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
              >
                Służba:
              </Text>
              <Pressable
                onPress={() => setMinistryFilter(null)}
                className="active:opacity-80"
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: ministryFilter === null ? '#1c1917' : '#fafaf9',
                  borderWidth: 1,
                  borderColor: ministryFilter === null ? '#1c1917' : '#eef0f3',
                }}
              >
                <Text
                  className="text-[12px]"
                  style={{
                    color: ministryFilter === null ? '#ffffff' : '#1c1917',
                    fontFamily: 'Inter_600SemiBold',
                  }}
                >
                  Wszystkie
                </Text>
              </Pressable>
              {ministriesInData.map((m) => {
                const active = ministryFilter === m;
                const label = MINISTRY_LABELS[m] || m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMinistryFilter(active ? null : m)}
                    className="active:opacity-80"
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: active ? '#1c1917' : '#fafaf9',
                      borderWidth: 1,
                      borderColor: active ? '#1c1917' : '#eef0f3',
                    }}
                  >
                    <Text
                      className="text-[12px]"
                      style={{
                        color: active ? '#ffffff' : '#1c1917',
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
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
                  <Users size={28} color="#ec4899" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak osób
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  Spróbuj innego filtru.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const meta = item.status ? STATUS_META[item.status] : null;
              const itemCampus = getCampus((item as any).campus_id ?? null);
              return (
                <Link
                  href={{ pathname: '/(app)/members/[id]', params: { id: String(item.id) } }}
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
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: meta?.bg ?? '#fef3f2',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: meta?.tint ?? '#ec4899',
                            fontFamily: 'Inter_700Bold',
                          }}
                        >
                          {initials(item)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-[15px]"
                          style={{
                            color: '#0c0a09',
                            letterSpacing: -0.2,
                            fontFamily: 'Inter_600SemiBold',
                          }}
                          numberOfLines={1}
                        >
                          {fullName(item)}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-0.5">
                          {item.email ? (
                            <Text
                              className="text-[12px]"
                              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                              numberOfLines={1}
                            >
                              {item.email}
                            </Text>
                          ) : null}
                          {itemCampus ? <CampusBadge campus={itemCampus} /> : null}
                        </View>
                      </View>
                      {meta ? (
                        <View
                          className="px-2 py-0.5"
                          style={{ borderRadius: 999, backgroundColor: meta.bg }}
                        >
                          <Text
                            className="text-[11px]"
                            style={{ color: meta.tint, fontFamily: 'Inter_700Bold' }}
                          >
                            {meta.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </Link>
              );
            }}
          />
        )}
      </View>
    </>
  );
}
