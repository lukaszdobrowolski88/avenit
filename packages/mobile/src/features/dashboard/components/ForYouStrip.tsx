import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ItemsConfig } from '../layout';
import { useShortcutCatalog, visibleShortcuts } from '../shortcuts';
import { SectionHeading } from './WidgetCard';
import { D, F } from '../theme';

// „Dla Ciebie" — osobiste skróty: białe kwadraty z czarną ikoną, krótki podpis pod spodem.
// Powiadomienia mają dzwonek w nagłówku, więc tu ich nie ma.
export const ForYouStrip = ({ config }: { config: ItemsConfig }) => {
  const router = useRouter();
  const { catalog, ready } = useShortcutCatalog();
  // Skróty osobiste i dodane moduły — kolejność i widoczność z ustawień pulpitu.
  const entries = visibleShortcuts(catalog, config);
  if (!ready || entries.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeading title="Dla Ciebie" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {entries.map(({ key, label, short, Icon, open }) => (
          <Pressable
            key={key}
            onPress={() => open(router)}
            accessibilityLabel={label}
            className="active:opacity-70"
            style={{ width: 74, alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 70,
                height: 70,
                borderRadius: 22,
                backgroundColor: D.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={24} color={D.ink} strokeWidth={1.8} />
            </View>
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{ fontSize: 12, lineHeight: 15, color: D.ink2, fontFamily: F.medium, textAlign: 'center' }}
            >
              {short}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
