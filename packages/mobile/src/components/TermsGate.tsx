import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GradientButton } from './ui/GradientButton';
import { B } from './ui/brand';
import { TermsContent, useAcceptTerms, useTermsStatus } from '../features/account/terms';
import { signOut } from '../lib/auth';
import { showError } from '../lib/errors';

// Bramka zasad społeczności: po zalogowaniu, dopóki osoba nie zaakceptuje bieżącej wersji zasad.
// Gdy serwer nie odpowie (offline, starszy backend) — nie blokujemy aplikacji.
export const TermsGate = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const status = useTermsStatus(true);
  const accept = useAcceptTerms();
  const visible = status.data ? !status.data.accepted : false;

  const decline = async () => {
    try {
      await signOut();
    } finally {
      router.replace('/(auth)/login');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: B.paper, paddingTop: insets.top + 12 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text style={{ fontSize: 12, letterSpacing: 1.4, color: B.gold, fontFamily: 'Manrope_700Bold', marginBottom: 6 }}>
            ZANIM ZACZNIESZ
          </Text>
          <Text style={{ fontSize: 30, lineHeight: 34, color: B.ink, fontFamily: 'Manrope_800ExtraBold' }}>Zasady</Text>
          <Text style={{ fontSize: 30, lineHeight: 36, color: B.ink, fontFamily: 'Manrope_300Light', marginBottom: 18 }}>
            społeczności<Text style={{ color: B.kurkuma, fontFamily: 'Manrope_800ExtraBold' }}>.</Text>
          </Text>
          <TermsContent />
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 10 }}>
          <GradientButton
            loading={accept.isPending}
            onPress={() => accept.mutate(undefined, { onError: (e) => showError('Nie udało się zapisać akceptacji', e) })}
          >
            Akceptuję zasady
          </GradientButton>
          <Pressable onPress={decline} disabled={accept.isPending} className="active:opacity-60" style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: B.ink3, fontFamily: 'Manrope_600SemiBold' }}>Nie akceptuję — wyloguj</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};
