import { useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';
import { ModuleTile } from '../../modules/ModuleTile';
import { openModule, useModules, type ModuleItem } from '../../modules/useModules';

// Kolejność skrótów: najpierw służby, do których należę, potem to, co członek otwiera
// najczęściej. Kalendarz i Czat są na dolnym pasku, więc ich tu nie dublujemy.
const PRIORITY = [
  'programs', 'homegroups', 'prayer', 'sermons', 'teaching', 'worship', 'media',
  'atmosfera', 'kids', 'mlodziezowka', 'members', 'boards', 'songs', 'forms',
];
const SKIP = new Set(['calendar', 'komunikator']);
const MAX = 7; // + kafel „Wszystkie" = 2 rzędy po 4

export const QuickAccess = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { items, perms, ready } = useModules();
  const tile = Math.floor((width - 32 - 8 * 3) / 4);

  const picks = useMemo(() => {
    const byKey = new Map<string, ModuleItem>(items.map((it) => [it.key, it]));
    const order = [...perms.ministries.map((m) => m.ministry_key), ...PRIORITY, ...items.map((it) => it.key)];
    const out: ModuleItem[] = [];
    const seen = new Set<string>();
    for (const key of order) {
      if (out.length >= MAX) break;
      if (seen.has(key) || SKIP.has(key)) continue;
      seen.add(key);
      const it = byKey.get(key);
      if (it && !it.isWeb) out.push(it);
    }
    return out;
  }, [items, perms.ministries]);

  if (!ready) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <Text
        style={{
          fontSize: 13,
          color: '#78716c',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontFamily: 'Inter_700Bold',
          marginBottom: 10,
          marginLeft: 4,
        }}
      >
        Na skróty
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {picks.map((it) => (
          <ModuleTile
            key={it.key}
            width={tile}
            label={it.label}
            Icon={it.Icon}
            tint={it.tint}
            bg={it.bg}
            surface="#ffffff"
            onPress={() => openModule(it, router)}
          />
        ))}
        <ModuleTile
          width={tile}
          label="Wszystkie"
          Icon={LayoutGrid}
          tint="#44403c"
          bg="#f5f5f4"
          surface="#ffffff"
          onPress={() => router.push('/(app)/modules')}
        />
      </View>
    </View>
  );
};
