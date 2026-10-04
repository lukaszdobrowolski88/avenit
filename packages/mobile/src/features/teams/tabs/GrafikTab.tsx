import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import type { TeamKey } from '../config';
import { useTeamGrafik, type GrafikPerson, type GrafikRow } from '../data';
import { Card, DateBlock, Empty, Loading, SegmentChips, dayLabel } from './ui';

const STATUS_DOT: Record<string, string> = { accepted: '#16a34a', pending: '#8A6606', rejected: '#dc2626' };

const PersonChip = ({ p }: { p: GrafikPerson }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: p.isMe ? '#FFF1C2' : '#F6F4EE',
    }}
  >
    {p.status ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_DOT[p.status] }} /> : null}
    <Text
      style={{
        fontSize: 12,
        color: p.isMe ? '#8A6606' : '#2A2312',
        fontFamily: p.isMe ? 'Manrope_700Bold' : 'Manrope_500Medium',
        textDecorationLine: p.status === 'rejected' ? 'line-through' : 'none',
      }}
    >
      {p.isMe ? `${p.name} (Ty)` : p.name}
    </Text>
  </View>
);

export const GrafikTab = ({ teamKey, me }: { teamKey: TeamKey; me: { email: string | null; name: string | null } }) => {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const grafik = useTeamGrafik(teamKey, me);
  const rows = useMemo(
    (): GrafikRow[] => ((grafik.data ?? []) as GrafikRow[]).filter((r) => (filter === 'mine' ? r.involvesMe : true)),
    [grafik.data, filter],
  );

  return (
    <View>
      <SegmentChips
        options={[
          { key: 'all', label: 'Wszystkie' },
          { key: 'mine', label: 'Tylko moje' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {grafik.isLoading ? <Loading /> : null}
      {!grafik.isLoading && rows.length === 0 ? (
        <Empty
          Icon={ClipboardList}
          title={filter === 'mine' ? 'Nie masz zaplanowanych służb' : 'Grafik jest pusty'}
          hint="Lider układa grafik na webie (zakładka Grafik) — tu zobaczysz, kto i kiedy służy."
        />
      ) : null}

      {rows.map((row) => (
        <Card
          key={row.id}
          onPress={
            row.kind === 'program'
              ? () => router.push({ pathname: '/(app)/programs/[id]', params: { id: row.id.slice(1) } })
              : undefined
          }
        >
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <DateBlock ymd={row.date} tint={row.involvesMe ? '#8A6606' : '#2A2312'} bg={row.involvesMe ? '#FFF8E1' : '#F1EEE6'} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                {row.title}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium', marginTop: 2 }}>
                {dayLabel(row.date)}
                {row.time ? ` · ${row.time}` : ''}
              </Text>
            </View>
          </View>

          {row.roles.length > 0 ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              {row.roles.map((role) => (
                <View key={role.key} style={{ gap: 5 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: '#8A6606',
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      fontFamily: 'Manrope_600SemiBold',
                    }}
                  >
                    {role.label}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {role.people.map((p, i) => (
                      <PersonChip key={`${p.name}-${i}`} p={p} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ marginTop: 8, fontSize: 12, color: '#857F70', fontFamily: 'Manrope_500Medium' }}>
              Nikt jeszcze nie jest przypisany.
            </Text>
          )}

          {row.absent.length ? (
            <Text style={{ marginTop: 8, fontSize: 12, color: '#b91c1c', fontFamily: 'Manrope_500Medium' }}>
              Nieobecni: {row.absent.join(', ')}
            </Text>
          ) : null}
          {row.notes ? (
            <Text style={{ marginTop: 4, fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_400Regular' }}>{row.notes}</Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
};
