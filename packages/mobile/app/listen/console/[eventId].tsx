import { useLocalSearchParams } from 'expo-router';
import { InterpretationConsoleLinkGate } from '../../../src/features/interpretation/LinkGate';

// Link do konsoli tłumacza z systemu (avenit://tlumaczenie/konsola/<id>): zalogowany w tym
// kościele — konsola w aplikacji; niezalogowany — logowanie i powrót tutaj; inny kościół — przeglądarka.
export default function ListenConsoleRoute() {
  const { eventId, tenant } = useLocalSearchParams<{ eventId: string; tenant?: string }>();
  const slug = typeof tenant === 'string' && /^[a-z0-9-]+$/i.test(tenant) ? tenant.toLowerCase() : null;
  return <InterpretationConsoleLinkGate eventId={eventId ? String(eventId) : ''} tenant={slug} />;
}
