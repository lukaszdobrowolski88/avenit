import { useLocalSearchParams } from 'expo-router';
import { InterpretationListenerScreen } from '../../src/features/interpretation/ListenerScreen';
import { isPublicToken } from '../../src/features/interpretation/logic';

// Publiczny link/QR tłumaczenia (https://<kościół>.avenit.pl/tlumaczenie/<token>) — bez logowania;
// kościół z linku (?tenant=), więc działa też dla zalogowanych w innym kościele.
export default function PublicListenRoute() {
  const { token, tenant } = useLocalSearchParams<{ token: string; tenant?: string }>();
  const t = token ? String(token) : '';
  const slug = typeof tenant === 'string' && /^[a-z0-9-]+$/i.test(tenant) ? tenant.toLowerCase() : null;
  return <InterpretationListenerScreen token={isPublicToken(t) ? t : null} tenant={slug} />;
}
