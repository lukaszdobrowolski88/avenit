import { useLocalSearchParams } from 'expo-router';
import { InterpretationEventLinkGate } from '../../../src/features/interpretation/LinkGate';

// Link „słuchaj z konta” (https://<kościół>.avenit.pl/tlumaczenie/sluchaj/<id>): zalogowany w tym
// kościele — słuchacz; niezalogowany — logowanie i powrót tutaj; inny kościół — przeglądarka.
export default function ListenEventRoute() {
  const { eventId, tenant } = useLocalSearchParams<{ eventId: string; tenant?: string }>();
  const slug = typeof tenant === 'string' && /^[a-z0-9-]+$/i.test(tenant) ? tenant.toLowerCase() : null;
  return <InterpretationEventLinkGate eventId={eventId ? String(eventId) : ''} tenant={slug} />;
}
