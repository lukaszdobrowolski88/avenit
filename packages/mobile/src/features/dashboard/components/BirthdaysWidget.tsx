import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cake } from 'lucide-react-native';
import { WidgetCard } from './WidgetCard';
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
    <WidgetCard title="Urodziny" Icon={Cake} iconTint="#a21caf" iconBg="#fae8ff" badge="2 tyg.">
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
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isToday ? '#a21caf' : '#fae8ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: isToday ? '#ffffff' : '#a21caf',
                    fontFamily: 'Inter_700Bold',
                  }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
              >
                {b.name}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: isToday ? '#a21caf' : '#78716c',
                  fontFamily: isToday ? 'Inter_700Bold' : 'Inter_500Medium',
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
