import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { prepareUiSound } from './audioMode';

// Dźwięk wysłania: miękki „szum wysłania” (filtrowany szum w górę, ~0,16 s; wybrany przez właściciela) + lekka wibracja.
// Na iPhonie respektuje przełącznik wyciszenia: tuż przed zagraniem tryb UI (ambient) —
// src/lib/audioMode.ts (dawniej głosówka/nagrywanie zostawiały „playback” na stałe i dźwięki
// grały mimo wyciszenia). Gdy gra głos, trwa rozmowa albo tłumaczenie — bez dźwięku UI.
// Błędy odtwarzania ignorujemy — dźwięk to dodatek, nie może psuć wysyłki.
let sendSound: AudioPlayer | null = null;

// Odtwarzacz tworzony raz i trzymany przez całą sesję (createAudioPlayer nie zwalnia się sam).
const makePlayer = (asset: number, volume: number): AudioPlayer | null => {
  try {
    const p = createAudioPlayer(asset);
    p.volume = volume;
    return p;
  } catch {
    return null;
  }
};

// Od początku — ten sam dźwięk może grać kilka razy pod rząd.
const replay = async (p: AudioPlayer | null) => {
  if (!p) return;
  if (!(await prepareUiSound().catch(() => false))) return;
  p.seekTo(0)
    .catch(() => undefined)
    .finally(() => p.play());
};

const loadSendSound = () => {
  if (!sendSound) sendSound = makePlayer(require('../../assets/sounds/send.wav'), 0.45);
  return sendSound;
};

export const playSendSound = async (): Promise<void> => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  try {
    replay(loadSendSound()).catch(() => undefined);
  } catch {
    // brak dźwięku — bez znaczenia dla wysyłki
  }
};

// Wczytaj z wyprzedzeniem (wejście w rozmowę), żeby pierwszy dźwięk nie miał opóźnienia.
export const preloadSendSound = () => {
  loadSendSound();
};

// ── Dźwięk przyjścia (aplikacja otwarta) ────────────────────────────────────────
// Powiadomienie przy otwartej apce: zamiast dźwięku systemowego gramy własny (assets/sounds/
// receive.wav), dobrany do dźwięku wysłania. Gdy osoba jest w tej samej rozmowie — tylko dźwięk,
// bez banera (activeConversation ustawia ekran rozmowy).
let receiveSound: AudioPlayer | null = null;
let lastReceiveAt = 0;

const loadReceiveSound = () => {
  if (!receiveSound) receiveSound = makePlayer(require('../../assets/sounds/receive.wav'), 0.5);
  return receiveSound;
};

export const playReceiveSound = async (): Promise<void> => {
  // Seria wiadomości naraz (np. kilka zdjęć) — jeden dźwięk na ~1,5 s.
  const now = Date.now();
  if (now - lastReceiveAt < 1500) return;
  lastReceiveAt = now;
  try {
    replay(loadReceiveSound()).catch(() => undefined);
  } catch {
    // bez dźwięku
  }
};

let activeConversation: string | null = null;
export const setActiveConversation = (id: string | null) => {
  activeConversation = id;
};
export const getActiveConversation = () => activeConversation;
