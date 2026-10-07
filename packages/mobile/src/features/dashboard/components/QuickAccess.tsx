import { useMemo } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { openModule, useModules, type ModuleItem } from '../../modules/useModules';
import type { ItemsConfig } from '../layout';
import { SectionHeading } from './WidgetCard';
import { D, F } from '../theme';
import { goToTab } from '../../../lib/navigation';

// Kolejność skrótów: najpierw służby, do których należę, potem to, co członek otwiera
// najczęściej. Kalendarz i Czat są na dolnym pasku, więc ich tu nie dublujemy.
const PRIORITY = [
  'programs', 'homegroups', 'prayer', 'teaching', 'worship', 'media',
  'atmosfera', 'kids', 'mlodziezowka', 'members', 'boards', 'songs', 'forms',
];
const SKIP = new Set(['calendar', 'komunikator']);
const MAX = 6; // 3 rzędy po 2 — reszta pod „Wszystkie”

// Moduły, które da się postawić na pulpicie (natywne, bez Kalendarza i Czatu z paska).
export const useDashboardModules = () => {
  const { items, perms, ready } = useModules();
  const candidates = useMemo(() => items.filter((it) => !it.isWeb && !SKIP.has(it.key)), [items]);
  // Dobór automatyczny: najpierw służby, do których należę, potem PRIORITY, potem reszta.
  const auto = useMemo(() => {
    const byKey = new Map<string, ModuleItem>(candidates.map((it) => [it.key, it]));
    const order = [...perms.ministries.map((m) => m.ministry_key), ...PRIORITY, ...candidates.map((it) => it.key)];
    const out: ModuleItem[] = [];
    const seen = new Set<string>();
    for (const key of order) {
      if (out.length >= MAX) break;
      if (seen.has(key)) continue;
      seen.add(key);
      const it = byKey.get(key);
      if (it) out.push(it);
    }
    return out;
  }, [candidates, perms.ministries]);
  return { candidates, auto, items, perms, ready };
};

const ModuleCard = ({
  item,
  width,
  role,
  onPress,
}: {
  item: ModuleItem;
  width: number;
  role: 'leader' | 'member' | null;
  onPress: () => void;
}) => {
  const { Icon } = item;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      className="active:opacity-70"
      style={{
        width,
        height: 128,
        borderRadius: 24,
        backgroundColor: D.card,
        padding: 14,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: D.well,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={D.ink} strokeWidth={1.9} />
        </View>
        {role ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: D.well }}>
            <Text style={{ fontSize: 11, color: D.ink2, fontFamily: F.semibold }}>
              {role === 'leader' ? 'Lider' : 'Twój zespół'}
            </Text>
          </View>
        ) : (
          <ArrowUpRight size={16} color={D.ink3} strokeWidth={2} />
        )}
      </View>
      <Text
        numberOfLines={2}
        style={{ fontSize: 15, lineHeight: 19, color: D.ink, letterSpacing: -0.3, fontFamily: F.semibold }}
      >
        {item.label}
      </Text>
    </Pressable>
  );
};

export const QuickAccess = ({ config }: { config: ItemsConfig }) => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { candidates, auto, items, perms, ready } = useDashboardModules();
  const tile = Math.floor((width - 32 - 10) / 2);

  const roleByKey = useMemo(() => {
    const map = new Map<string, 'leader' | 'member'>();
    for (const m of perms.ministries) {
      if (map.get(m.ministry_key) !== 'leader') map.set(m.ministry_key, m.role);
    }
    return map;
  }, [perms.ministries]);

  // Własny wybór (kolejność z ustawień) albo dobór automatyczny.
  const picks = useMemo(() => {
    if (!config.order) return auto;
    const byKey = new Map<string, ModuleItem>(candidates.map((it) => [it.key, it]));
    return config.order.map((k) => byKey.get(k)).filter(Boolean) as ModuleItem[];
  }, [config.order, candidates, auto]);

  if (!ready || picks.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeading
        title="Twoje moduły"
        count={items.length}
        actionLabel="Wszystkie"
        onAction={() => goToTab(router, 'modules')}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 }}>
        {picks.map((it) => (
          <ModuleCard
            key={it.key}
            item={it}
            width={tile}
            role={roleByKey.get(it.key) ?? null}
            onPress={() => openModule(it, router)}
          />
        ))}
      </View>
    </View>
  );
};
