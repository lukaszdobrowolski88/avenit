import { useLocalSearchParams } from 'expo-router';
import { InterpreterConsoleScreen } from '../../../../src/features/interpretation/ConsoleScreen';

// Konsola tłumacza (przypisany tłumacz kanału albo zarządzający) — web /tlumaczenie/konsola/<id>.
export default function InterpreterConsoleRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <InterpreterConsoleScreen eventId={eventId ? String(eventId) : null} />;
}
