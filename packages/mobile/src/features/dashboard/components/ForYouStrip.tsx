import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useModules } from '../../modules/useModules';

// „Dla Ciebie" — osobiste skróty (dawniej ukryte w Koncie): zaproszenia, dostępność,
// dawanie, moja praca, materiały… Powiadomienia mają dzwonek w nagłówku, więc tu ich nie ma.
export const ForYouStrip = () => {
  const router = useRouter();
  const { personal, ready } = useModules();
  const entries = personal.filter((p) => p.key !== 'notifications');
  if (!ready || entries.length === 0) return null;

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontSize: 13,
          color: '#78716c',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontFamily: 'Inter_700Bold',
          marginBottom: 10,
          marginLeft: 20,
        }}
      >
        Dla Ciebie
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {entries.map(({ key, label, Icon, tint, bg, route }) => (
          <Pressable
            key={key}
            onPress={() => router.push(route as never)}
            className="active:opacity-70"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 6,
              paddingRight: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: '#ffffff',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={15} color={tint} strokeWidth={2.3} />
            </View>
            <Text style={{ fontSize: 13, color: '#1c1917', fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
