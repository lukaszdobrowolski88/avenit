import { useLocalSearchParams } from 'expo-router';
import { InterpretationListenerScreen } from '../../../src/features/interpretation/ListenerScreen';

// Słuchanie tłumaczenia wydarzenia (zalogowany, który widzi wydarzenie) — web /tlumaczenie/sluchaj/<id>.
export default function InterpretationEventRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <InterpretationListenerScreen eventId={eventId ? String(eventId) : null} />;
}
