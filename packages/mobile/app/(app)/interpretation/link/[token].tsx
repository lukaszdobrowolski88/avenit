import { useLocalSearchParams } from 'expo-router';
import { InterpretationListenerScreen } from '../../../../src/features/interpretation/ListenerScreen';
import { isPublicToken } from '../../../../src/features/interpretation/logic';

// Słuchanie z publicznego linku/QR tego kościoła — web /tlumaczenie/<token>.
export default function InterpretationTokenRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = token ? String(token) : '';
  return <InterpretationListenerScreen token={isPublicToken(t) ? t : null} />;
}
