import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

// Dźwięk wysłania: miękki „szum wysłania” (filtrowany szum w górę, ~0,16 s; wybrany przez właściciela) + lekka wibracja.
// Na iPhonie respektuje przełącznik wyciszenia (playsInSilentModeIOS domyślnie false).
// Błędy odtwarzania ignorujemy — dźwięk to dodatek, nie może psuć wysyłki.
let sendSound: Audio.Sound | null = null;
let loading: Promise<Audio.Sound | null> | null = null;

const loadSendSound = () => {
  if (sendSound) return Promise.resolve(sendSound);
  if (!loading) {
    loading = Audio.Sound.createAsync(require('../../assets/sounds/send.wav'), { volume: 0.45 })
      .then(({ sound }) => {
        sendSound = sound;
        return sound;
      })
      .catch(() => null)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

export const playSendSound = async (): Promise<void> => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  try {
    const sound = await loadSendSound();
    await sound?.replayAsync();
  } catch {
    // brak dźwięku — bez znaczenia dla wysyłki
  }
};

// Wczytaj z wyprzedzeniem (wejście w rozmowę), żeby pierwszy dźwięk nie miał opóźnienia.
export const preloadSendSound = () => {
  loadSendSound().catch(() => undefined);
};

// ── Dźwięk przyjścia (aplikacja otwarta) ────────────────────────────────────────
// Powiadomienie przy otwartej apce: zamiast dźwięku systemowego gramy własny (assets/sounds/
// receive.wav), dobrany do dźwięku wysłania. Gdy osoba jest w tej samej rozmowie — tylko dźwięk,
// bez banera (activeConversation ustawia ekran rozmowy).
let receiveSound: Audio.Sound | null = null;
let receiveLoading: Promise<Audio.Sound | null> | null = null;
let lastReceiveAt = 0;

const loadReceiveSound = () => {
  if (receiveSound) return Promise.resolve(receiveSound);
  if (!receiveLoading) {
    receiveLoading = Audio.Sound.createAsync(require('../../assets/sounds/receive.wav'), { volume: 0.5 })
      .then(({ sound }) => {
        receiveSound = sound;
        return sound;
      })
      .catch(() => null)
      .finally(() => {
        receiveLoading = null;
      });
  }
  return receiveLoading;
};

export const playReceiveSound = async (): Promise<void> => {
  // Seria wiadomości naraz (np. kilka zdjęć) — jeden dźwięk na ~1,5 s.
  const now = Date.now();
  if (now - lastReceiveAt < 1500) return;
  lastReceiveAt = now;
  try {
    const sound = await loadReceiveSound();
    await sound?.replayAsync();
  } catch {
    // bez dźwięku
  }
};

let activeConversation: string | null = null;
export const setActiveConversation = (id: string | null) => {
  activeConversation = id;
};
export const getActiveConversation = () => activeConversation;
