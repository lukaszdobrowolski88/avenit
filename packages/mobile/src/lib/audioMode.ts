import { setAudioModeAsync } from 'expo-audio';
import { callOwnsAudioSession } from '../features/calls/native/modules';
import { resolveAudioMode, type AudioUse } from './audioModePolicy';

// Jedno miejsce, które ustawia tryb dźwięku apki (expo-audio → AVAudioSession na iOS).
//
// Błąd: odtwarzacz głosówki / kazania i nagrywanie ustawiały playsInSilentMode: true (kategoria
// „playback”) i NIGDY jej nie cofały — po pierwszym odsłuchaniu lub nagraniu dźwięki wysłania
// i przyjścia wiadomości grały mimo przełącznika wyciszenia. Teraz:
//   • głos (głosówka, kazanie, podgląd nagrania) bierze „blokadę” playback tylko na czas grania,
//   • nagrywanie — blokadę record,
//   • bez blokad wracamy do trybu UI: ambient (respektuje wyciszenie, nie przerywa muzyki),
//   • dźwięki UI ustawiają tryb UI tuż przed zagraniem (inne moduły — tłumaczenie, rozmowy —
//     potrafią zmienić kategorię za plecami expo-audio).
// Tłumaczenie na żywo (LiveKit AudioSession) i rozmowy (CallKit) same rządzą sesją — wtedy nic
// nie przestawiamy (zgasilibyśmy im dźwięk), a dźwięki UI milczą.

const holds = new Map<number, AudioUse>();
let nextId = 1;
let external = false; // tłumaczenie na żywo (sesja LiveKit)
let applied: string | null = null;

const busyElsewhere = () => external || callOwnsAudioSession();

async function apply(force = false): Promise<void> {
  if (busyElsewhere()) return;
  const mode = resolveAudioMode([...holds.values()]);
  const key = JSON.stringify(mode);
  if (!force && key === applied) return;
  try {
    await setAudioModeAsync(mode);
    applied = key;
  } catch (e) {
    applied = null;
    if (__DEV__) console.warn('[audio] setAudioModeAsync:', (e as Error)?.message);
  }
}

/**
 * Blokada trybu na czas grania głosu ('playback') albo nagrywania ('record'). Zwraca funkcję
 * zwalniającą (idempotentną) — po zwolnieniu ostatniej blokady apka wraca do trybu UI.
 */
export async function acquireAudio(use: Exclude<AudioUse, 'ui'>): Promise<() => Promise<void>> {
  const id = nextId++;
  holds.set(id, use);
  await apply(true);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    holds.delete(id);
    await apply(true);
  };
}

/** Czy można teraz zagrać dźwięk UI (żaden głos nie gra, nie trwa rozmowa ani tłumaczenie). */
export function uiSoundsAllowed(): boolean {
  return holds.size === 0 && !busyElsewhere();
}

/** Tryb UI tuż przed dźwiękiem interfejsu (ambient — cisza przy przełączniku wyciszenia). */
export async function prepareUiSound(): Promise<boolean> {
  if (!uiSoundsAllowed()) return false;
  await apply(true);
  return true;
}

/** Tłumaczenie na żywo przejmuje / oddaje sesję audio (LiveKit) — w tym czasie nie ruszamy trybu. */
export function setExternalAudioOwner(active: boolean): void {
  external = active;
  applied = null; // po oddaniu sesji kategoria mogła być dowolna — następny apply ustawi ją od nowa
}
