import { useLocalSearchParams } from 'expo-router';
import { InterpretationWebLinkGate } from '../../src/features/interpretation/LinkGate';

// Konsola tłumacza / „Oryginał” (/tlumaczenie/konsola|oryginal/<id>) — zawsze w przeglądarce.
export default function ListenWebRoute() {
  const { path, tenant } = useLocalSearchParams<{ path?: string; tenant?: string }>();
  const slug = typeof tenant === 'string' && /^[a-z0-9-]+$/i.test(tenant) ? tenant.toLowerCase() : null;
  return <InterpretationWebLinkGate path={typeof path === 'string' ? path : ''} tenant={slug} />;
}
