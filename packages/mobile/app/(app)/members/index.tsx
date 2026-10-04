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
import { B, Monogram } from '../../../src/components/ui/brand';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  useMembers,
  useMemberFilters,
  fullName,
  initials,
  STATUS_META,
  MINISTRY_LABELS,
  type MemberStatus,
  type MemberRow,
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
    Członek: (data ?? []).filter((m: MemberRow) => m.status === 'Członek').length,
    Sympatyk: (data ?? []).filter((m: MemberRow) => m.status === 'Sympatyk').length,
    Gość: (data ?? []).filter((m: MemberRow) => m.status === 'Gość').length,
  };

  const ministriesInData: string[] = Array.from(
    new Set((data ?? []).flatMap((m: MemberRow) => m.ministries ?? [])),
  ).filter(Boolean) as string[];

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
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
              backgroundColor: '#F1EEE6',
              borderWidth: 1,
              borderColor: '#E6E1D5',
            }}
          >
            <Search size={18} color="#857F70" />
            <TextInput
              className="flex-1 text-base"
              style={{ color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
              placeholder="Szukaj po imieniu lub email…"
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
                    backgroundColor: active ? '#2A2312' : '#F1EEE6',
                    borderWidth: 1,
                    borderColor: active ? '#2A2312' : '#E6E1D5',
                  }}
                >
                  <Text
                    className="text-[13px]"
                    style={{
                      color: active ? '#ffffff' : '#2A2312',
                      fontFamily: 'Manrope_600SemiBold',
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
                style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}
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
                  backgroundColor: ministryFilter === null ? '#2A2312' : '#F1EEE6',
                  borderWidth: 1,
                  borderColor: ministryFilter === null ? '#2A2312' : '#E6E1D5',
                }}
              >
                <Text
                  className="text-[12px]"
                  style={{
                    color: ministryFilter === null ? '#ffffff' : '#2A2312',
                    fontFamily: 'Manrope_600SemiBold',
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
                      backgroundColor: active ? '#2A2312' : '#F1EEE6',
                      borderWidth: 1,
                      borderColor: active ? '#2A2312' : '#E6E1D5',
                    }}
                  >
                    <Text
                      className="text-[12px]"
                      style={{
                        color: active ? '#ffffff' : '#2A2312',
                        fontFamily: 'Manrope_600SemiBold',
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
                <View style={{ height: 1, marginLeft: 76, backgroundColor: B.line }} />
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
                  <Users size={28} color="#8A6606" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Brak osób
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                >
                  Spróbuj innego filtru.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const meta = item.status ? STATUS_META[item.status] : null;
              const itemCampus = getCampus((item as any).campus_id ?? null);
              const first = index === 0;
              const last = index === filtered.length - 1;
              const isMember = item.status === 'Członek';
              return (
                <Link
                  href={{ pathname: '/(app)/members/[id]', params: { id: String(item.id) } }}
                  asChild
                >
                  {/* Jedna biała grupa: zaokrąglone tylko pierwszy i ostatni wiersz. */}
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
                    <Monogram name={fullName(item)} size={46} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: 'Manrope_600SemiBold' }}>
                        {fullName(item)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        {item.email ? (
                          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
                            {item.email}
                          </Text>
                        ) : null}
                        {itemCampus ? <CampusBadge campus={itemCampus} /> : null}
                      </View>
                    </View>
                    {meta ? (
                      <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: isMember ? B.kurkumaSoft : B.paper2 }}>
                        <Text style={{ fontSize: 11, color: isMember ? B.goldDeep : B.ink2, fontFamily: 'Manrope_700Bold' }}>
                          {meta.label}
                        </Text>
                      </View>
                    ) : null}
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
