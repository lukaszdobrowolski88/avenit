import { Pressable, StatusBar, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import { B } from '../src/components/ui/brand';

// Nieznana trasa / głęboki link do ekranu, którego nie ma (jak strona 404 na webie) —
// mówimy, co się stało, i dajemy drogi dalej zamiast pustego ekranu.
export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View
        style={{
          flex: 1,
          backgroundColor: B.paper,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: B.kurkumaSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Compass size={28} color={B.goldDeep} strokeWidth={2} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 24, color: B.ink, textAlign: 'center', letterSpacing: -0.6, fontFamily: 'Manrope_700Bold' }}
        >
          Nie znaleziono ekranu
        </Text>
        <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 21, color: B.ink3, textAlign: 'center', fontFamily: 'Manrope_500Medium' }}>
          Ten link prowadzi do miejsca, którego nie ma w aplikacji. Mógł się zdezaktualizować albo moduł został
          wyłączony lub przemianowany.
        </Text>
        {pathname && pathname !== '/' ? (
          <Text
            numberOfLines={2}
            style={{ marginTop: 10, fontSize: 12, color: B.ink4, textAlign: 'center', fontFamily: 'Manrope_500Medium' }}
          >
            Adres: {pathname}
          </Text>
        ) : null}

        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 28 }}>
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{ height: 52, borderRadius: 26, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_700Bold' }}>Wróć do pulpitu</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(app)/modules' as never)}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{ height: 52, borderRadius: 26, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_600SemiBold' }}>Wszystkie moduły</Text>
          </Pressable>
          {router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              className="active:opacity-70"
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, color: B.ink3, fontFamily: 'Manrope_600SemiBold' }}>Wstecz</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );
}
