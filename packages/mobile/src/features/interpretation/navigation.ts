import type { ImperativeRouter as Router } from 'expo-router';
import { openOnWeb } from '../modules/useModules';
import type { InterpretationTarget } from './logic';

// Cel linku /tlumaczenie/… → ekran słuchacza w apce; konsola tłumacza i „Oryginał” — web (zalogowany).
export function openInterpretation(router: Router, target: InterpretationTarget) {
  if (target.kind === 'event') {
    router.push({ pathname: '/(app)/interpretation/[eventId]', params: { eventId: target.eventId } } as never);
  } else if (target.kind === 'token') {
    router.push({ pathname: '/(app)/interpretation/link/[token]', params: { token: target.token } } as never);
  } else {
    void openOnWeb(target.path);
  }
}
