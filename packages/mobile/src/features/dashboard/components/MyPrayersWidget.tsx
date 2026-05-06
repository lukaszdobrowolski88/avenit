import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Heart, Users } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { WidgetCard } from './WidgetCard';
import type { RecentPrayer } from '../api';

const CATEGORY_LABELS: Record<string, { label: string; bg: string; tint: string }> = {
  health: { label: 'Zdrowie', bg: '#fee2e2', tint: '#b91c1c' },
  family: { label: 'Rodzina', bg: '#dbeafe', tint: '#1d4ed8' },
  work: { label: 'Praca', bg: '#fef3c7', tint: '#b45309' },
  finances: { label: 'Finanse', bg: '#d1fae5', tint: '#047857' },
  spiritual: { label: 'Duchowe', bg: '#ede9fe', tint: '#6d28d9' },
  other: { label: 'Inne', bg: '#f5f5f4', tint: '#57534e' },
};

const formatCategory = (key: string) =>
  CATEGORY_LABELS[key] ?? { label: key || 'Inne', bg: '#f5f5f4', tint: '#57534e' };

export const MyPrayersWidget = ({ items }: { items: RecentPrayer[] }) => {
  return (
    <WidgetCard
      title="Moje Modlitwy"
      Icon={Heart}
      badge={items.length > 0 ? String(items.length) : undefined}
    >
      {items.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: '#fef3f2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Heart size={20} color="#ec4899" />
          </View>
          <Text style={{ fontSize: 13, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
            Nie masz aktywnych intencji
          </Text>
          <Link href="/(app)/prayers" asChild>
            <Pressable
              className="active:opacity-80"
              style={{
                marginTop: 12,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: '#ec4899',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: 'Inter_700Bold' }}>
                Dodaj intencję
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          {items.slice(0, 3).map((p, idx, arr) => {
            const meta = formatCategory(p.category);
            return (
              <Link key={p.id} href={{ pathname: '/(app)/prayers' }} asChild>
                <Pressable
                  className="active:opacity-70"
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                    borderBottomColor: '#f5f5f4',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: meta.bg,
                      }}
                    >
                      <Heart size={9} color={meta.tint} fill={meta.tint} />
                      <Text style={{ fontSize: 10, color: meta.tint, fontFamily: 'Inter_700Bold' }}>
                        {meta.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
                      {formatDate(p.created_at, 'd.MM.yyyy')}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: 14,
                      color: '#0c0a09',
                      lineHeight: 20,
                      fontFamily: 'Inter_400Regular',
                    }}
                  >
                    {p.content}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 6,
                    }}
                  >
                    <Users size={10} color="#78716c" />
                    <Text
                      style={{ fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium' }}
                    >
                      {p.prayer_count}{' '}
                      {p.prayer_count === 1 ? 'osoba się modli' : 'osób się modli'}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            );
          })}
          <Link href="/(app)/prayers" asChild>
            <Pressable
              className="active:opacity-70"
              style={{ paddingHorizontal: 16, paddingVertical: 12 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: '#be185d',
                  textAlign: 'center',
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                Zobacz wszystkie intencje →
              </Text>
            </Pressable>
          </Link>
        </>
      )}
    </WidgetCard>
  );
};
