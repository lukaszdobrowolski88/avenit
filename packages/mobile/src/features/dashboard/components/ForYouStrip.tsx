import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useModules } from '../../modules/useModules';
import { applyItems, type ItemsConfig } from '../layout';
import { SectionHeading } from './WidgetCard';
import { D, F } from '../theme';

// „Dla Ciebie" — osobiste skróty: białe kwadraty z czarną ikoną, krótki podpis pod spodem.
// Powiadomienia mają dzwonek w nagłówku, więc tu ich nie ma.
export const ForYouStrip = ({ config }: { config: ItemsConfig }) => {
  const router = useRouter();
  const { personal, ready } = useModules();
  const available = personal.filter((p) => p.key !== 'notifications');
  // Kolejność i widoczność z ustawień pulpitu (nowe skróty dochodzą na końcu).
  const entries = applyItems(available, config, available);
  if (!ready || entries.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeading title="Dla Ciebie" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {entries.map(({ key, label, short, Icon, route }) => (
          <Pressable
            key={key}
            onPress={() => router.push(route as never)}
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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 12, color: D.ink2, fontFamily: F.medium }}>
              {short}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
