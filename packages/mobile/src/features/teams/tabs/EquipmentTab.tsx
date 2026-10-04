import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Package } from 'lucide-react-native';
import type { TeamKey } from '../config';
import { useTeamEquipment, type EquipmentItem } from '../data';
import { Card, Empty, Loading, Pill, money } from './ui';

const CONDITION: Record<string, { tint: string; bg: string }> = {
  nowy: { tint: '#15803d', bg: '#dcfce7' },
  dobry: { tint: '#15803d', bg: '#dcfce7' },
  sredni: { tint: '#a16207', bg: '#fef3c7' },
  średni: { tint: '#a16207', bg: '#fef3c7' },
  zly: { tint: '#b91c1c', bg: '#fee2e2' },
  zły: { tint: '#b91c1c', bg: '#fee2e2' },
  naprawa: { tint: '#b91c1c', bg: '#fee2e2' },
};

// Wyposażenie zespołu (equipment, team_type = klucz modułu) — podgląd jak na webie.
export const EquipmentTab = ({ teamKey }: { teamKey: TeamKey }) => {
  const eq = useTeamEquipment(teamKey);
  if (eq.isLoading) return <Loading />;
  const items: EquipmentItem[] = eq.data ?? [];
  if (!items.length) return <Empty Icon={Package} title="Brak sprzętu na liście" hint="Sprzęt dodaje się na webie (zakładka Wyposażenie)." />;
  const total = items.reduce((s, i) => s + (i.unitValue ?? 0) * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, borderRadius: 16, backgroundColor: '#f7f6f5', padding: 12 }}>
          <Text style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Sztuk
          </Text>
          <Text style={{ fontSize: 22, color: '#0c0a09', fontFamily: 'Inter_700Bold', marginTop: 2 }}>{count}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 16, backgroundColor: '#f7f6f5', padding: 12 }}>
          <Text style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Wartość
          </Text>
          <Text style={{ fontSize: 22, color: '#0c0a09', fontFamily: 'Inter_700Bold', marginTop: 2 }}>{money(total)}</Text>
        </View>
      </View>

      {items.map((it) => {
        const cond = it.condition ? CONDITION[it.condition.toLowerCase()] : null;
        return (
          <Card key={it.id}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {it.photoUrl ? (
                <Image
                  source={{ uri: it.photoUrl }}
                  style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#e7e5e4' }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Package size={20} color="#a8a29e" />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                  {it.name}
                  {it.quantity > 1 ? <Text style={{ color: '#78716c' }}>{`  ×${it.quantity}`}</Text> : null}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                  {[it.unitValue != null ? money(it.unitValue) : null, it.responsible, it.location].filter(Boolean).join(' · ') ||
                    it.description ||
                    ' '}
                </Text>
              </View>
              {it.condition ? (
                <Pill text={it.condition} tint={cond?.tint ?? '#57534e'} bg={cond?.bg ?? '#ece9e6'} />
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
};
