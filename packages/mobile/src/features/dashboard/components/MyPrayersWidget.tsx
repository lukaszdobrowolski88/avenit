import { Pressable, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Heart, Users } from 'lucide-react-native';
import { formatDate, plural } from '../../../lib/domain';
import { EmptyRow, WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import type { RecentPrayer } from '../api';

const CATEGORY_LABELS: Record<string, { label: string; bg: string; tint: string }> = {
  health: { label: 'Zdrowie', bg: '#fee2e2', tint: '#b91c1c' },
  family: { label: 'Rodzina', bg: '#ECE8DE', tint: '#2A2312' },
  work: { label: 'Praca', bg: '#FFF1C2', tint: '#8A6606' },
  finances: { label: 'Finanse', bg: '#ECE8DE', tint: '#2A2312' },
  spiritual: { label: 'Duchowe', bg: '#ECE8DE', tint: '#2A2312' },
  other: { label: 'Inne', bg: '#ECE8DE', tint: D.ink2 },
};

// Część intencji zapisuje kategorię po polsku (np. „rodzina”) — ten sam kolor co klucz angielski.
const PL_KEYS: Record<string, string> = {
  zdrowie: 'health', rodzina: 'family', praca: 'work', finanse: 'finances', duchowe: 'spiritual', inne: 'other',
};

const formatCategory = (key: string) =>
  CATEGORY_LABELS[key] ??
  CATEGORY_LABELS[PL_KEYS[(key || '').toLowerCase()] ?? ''] ?? { label: key || 'Inne', bg: '#ECE8DE', tint: D.ink2 };

export const MyPrayersWidget = ({ items }: { items: RecentPrayer[] }) => {
  const router = useRouter();
  return (
    <WidgetCard
      title="Moje modlitwy"
      count={items.length}
      actionLabel={items.length > 0 ? 'Wszystkie' : undefined}
      onAction={() => router.push('/(app)/prayers')}
    >
      {items.length === 0 ? (
        <EmptyRow
          text="Nie masz aktywnych intencji"
          hint="Podziel się prośbą — wspólnota będzie się modlić."
          actionLabel="Dodaj intencję"
          onAction={() => router.push('/(app)/prayers/new')}
        />
      ) : (
        <>
          {items.slice(0, 3).map((p, idx, arr) => {
            const meta = formatCategory(p.category);
            return (
              <Link push key={p.id} href={{ pathname: '/(app)/prayers' }} asChild>
                <Pressable
                  className="active:opacity-70"
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: idx === 0 ? 16 : 10,
                    paddingBottom: idx < arr.length - 1 ? 10 : 16,
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
                        gap: 6,
                        paddingHorizontal: 9,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: D.well,
                      }}
                    >
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.tint }} />
                      <Text style={{ fontSize: 11, color: D.ink, fontFamily: F.semibold }}>
                        {meta.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: D.ink3, fontFamily: F.medium }}>
                      {formatDate(p.created_at, 'd.MM.yyyy')}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: 14,
                      color: D.ink,
                      lineHeight: 20,
                      fontFamily: F.regular,
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
                    <Users size={10} color={D.ink2} />
                    <Text
                      style={{ fontSize: 11, color: D.ink2, fontFamily: F.medium }}
                    >
                      {p.prayer_count > 0
                        ? `${p.prayer_count} ${plural(p.prayer_count, 'osoba się modli', 'osoby się modlą', 'osób się modli')}`
                        : 'Nikt jeszcze się nie modli'}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </>
      )}
    </WidgetCard>
  );
};
