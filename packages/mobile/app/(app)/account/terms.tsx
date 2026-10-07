import { ScrollView, StatusBar, Text, View } from 'react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { TermsContent, useTermsStatus } from '../../../src/features/account/terms';

// Podgląd zaakceptowanych zasad społeczności (Konto → Prywatność).
export default function TermsScreen() {
  const status = useTermsStatus(true);
  const at = status.data?.accepted_at ? new Date(status.data.accepted_at) : null;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Zasady społeczności" subtitle="Prywatność i bezpieczeństwo" showBack />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <TermsContent />
          {at && Number.isFinite(at.getTime()) ? (
            <Text style={{ marginTop: 18, fontSize: 12, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
              Zaakceptowano {at.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
