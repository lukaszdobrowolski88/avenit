import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import type { Birthday } from '../extras';

const when = (days: number) => {
  if (days === 0) return 'dziś';
  if (days === 1) return 'jutro';
  return `za ${days} dni`;
};

export const BirthdaysWidget = ({ items }: { items: Birthday[] }) => {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <WidgetCard title="Urodziny" count={items.length}>
      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        {items.map((b) => {
          const isToday = b.daysUntil === 0;
          return (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: '/(app)/members/[id]', params: { id: b.id } })}
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                paddingHorizontal: 8,
                borderRadius: 14,
                backgroundColor: 'transparent',
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: isToday ? D.ink : D.well,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: isToday ? '#ffffff' : D.ink,
                    fontFamily: F.bold,
                  }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 15, color: D.ink, fontFamily: F.semibold }}
              >
                {b.name}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: isToday ? D.gold : D.ink2,
                  fontFamily: isToday ? F.bold : F.medium,
                }}
              >
                {when(b.daysUntil)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </WidgetCard>
  );
};
