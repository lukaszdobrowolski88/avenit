import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Mail, MessageSquare, Phone, Search, Star, Users } from 'lucide-react-native';
import { useTeamPeople, useTeamRoles, type TeamPerson, type TeamRoleWithPeople } from '../data';
import type { TeamKey } from '../config';
import { Card, Empty, Loading } from './ui';

const open = (url: string) =>
  Linking.openURL(url).catch(() => Alert.alert('Nie udało się otworzyć', 'Ta akcja nie jest dostępna na tym urządzeniu.'));

const Action = ({ Icon, onPress, label }: { Icon: typeof Phone; onPress: () => void; label: string }) => (
  <Pressable
    onPress={onPress}
    accessibilityLabel={label}
    hitSlop={6}
    className="active:opacity-60"
    style={{
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Icon size={15} color="#1c1917" strokeWidth={2.2} />
  </Pressable>
);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

// Członkowie / Liderzy / Nauczyciele — z tabel zespołu jak na webie (worship_team itd.).
export const PeopleTab = ({
  table,
  rolesFor,
  emptyLabel,
}: {
  table: string | undefined;
  rolesFor?: TeamKey;
  emptyLabel: string;
}) => {
  const people = useTeamPeople(table, rolesFor);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all: TeamPerson[] = people.data ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((p) => p.name.toLowerCase().includes(s) || (p.email ?? '').toLowerCase().includes(s)) : all;
  }, [people.data, q]);

  return (
    <View>
      {(people.data?.length ?? 0) > 6 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: '#f5f5f4',
            marginBottom: 12,
          }}
        >
          <Search size={16} color="#a8a29e" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Szukaj osoby"
            placeholderTextColor="#a8a29e"
            style={{ flex: 1, fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_400Regular' }}
          />
        </View>
      ) : null}

      {people.isLoading ? <Loading /> : null}
      {people.isError ? (
        <Empty Icon={Users} title="Nie udało się wczytać listy" hint="Możesz nie mieć dostępu do tej listy." />
      ) : null}
      {!people.isLoading && !people.isError && list.length === 0 ? <Empty Icon={Users} title={emptyLabel} /> : null}

      {list.map((p) => (
        <Card key={p.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: p.isLeader ? '#fef3c7' : '#fce7f3',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 13, color: p.isLeader ? '#a16207' : '#be185d', fontFamily: 'Inter_700Bold' }}>
                {initials(p.name) || '?'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                  {p.name}
                </Text>
                {p.isLeader ? <Star size={12} color="#d97706" fill="#d97706" /> : null}
              </View>
              {[p.roles.length ? p.roles.join(', ') : p.role, p.groupName].filter(Boolean).length ? (
                <Text numberOfLines={1} style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                  {[p.roles.length ? p.roles.join(', ') : p.role, p.groupName].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {p.phone ? <Action Icon={Phone} label={`Zadzwoń: ${p.name}`} onPress={() => open(`tel:${p.phone}`)} /> : null}
              {p.phone ? <Action Icon={MessageSquare} label={`SMS: ${p.name}`} onPress={() => open(`sms:${p.phone}`)} /> : null}
              {p.email ? <Action Icon={Mail} label={`E-mail: ${p.name}`} onPress={() => open(`mailto:${p.email}`)} /> : null}
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
};

// Służby (team_roles + team_member_roles) — kto pełni którą funkcję.
export const RolesTab = ({ teamKey, memberTable }: { teamKey: TeamKey; memberTable: string | undefined }) => {
  const roles = useTeamRoles(teamKey, memberTable);
  if (roles.isLoading) return <Loading />;
  const list: TeamRoleWithPeople[] = roles.data ?? [];
  if (!list.length) {
    return <Empty Icon={Users} title="Brak zdefiniowanych służb" hint="Lider dodaje służby (np. wokal, nagłośnienie) na webie." />;
  }
  return (
    <View>
      {list.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>{r.name}</Text>
          {r.description ? (
            <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2, fontFamily: 'Inter_400Regular' }}>{r.description}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {r.people.length ? (
              r.people.map((n) => (
                <View key={n} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#ffffff' }}>
                  <Text style={{ fontSize: 12, color: '#1c1917', fontFamily: 'Inter_500Medium' }}>{n}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 12, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>Nikt nie jest przypisany</Text>
            )}
          </View>
        </Card>
      ))}
    </View>
  );
};
