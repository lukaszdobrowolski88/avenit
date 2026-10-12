import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { B } from '../../../src/components/ui/brand';
import { FONT as F } from '../../../src/lib/fonts';
import { goBack } from '../../../src/lib/navigation';
import { nativeCallsAvailable } from '../../../src/features/calls/native/modules';

// Ekran rozmowy audio/wideo. Właściwy widok (LiveKit) ładujemy dopiero tutaj i tylko w buildzie
// z modułami natywnymi — sam import @livekit/react-native bez WebRTC wywraca apkę przy starcie.
// Parametr callId jest informacyjny: ekran pokazuje zawsze bieżącą rozmowę z silnika.
export default function CallRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (nativeCallsAvailable()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CallScreen } = require('../../../src/features/calls/native/CallScreen') as typeof import('../../../src/features/calls/native/CallScreen');
    return <CallScreen />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: B.paper, paddingTop: insets.top + 40, paddingHorizontal: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, color: B.ink, fontFamily: F.bold }}>Rozmowy niedostępne</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: B.ink2, fontFamily: F.medium }}>
        Ta wersja aplikacji nie obsługuje jeszcze rozmów audio i wideo. Zaktualizuj aplikację albo dołącz do rozmowy w przeglądarce.
      </Text>
      <Pressable
        onPress={() => goBack(router)}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ alignSelf: 'flex-start', backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 }}
      >
        <Text style={{ fontSize: 14, color: B.onDark, fontFamily: F.bold }}>Wróć</Text>
      </Pressable>
    </View>
  );
}
