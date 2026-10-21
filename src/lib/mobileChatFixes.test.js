// Mobilka — Komunikator (poprawki z iPhone'a, 2026-10-21): plakietka ikony, tryb dźwięku
// (przełącznik wyciszenia), odtwarzanie głosówek; plus format nagrań głosowych w webie.
import { describe, it, expect } from 'vitest';
import {
  unreadConversationsBadge,
  voiceCacheName,
  voiceFileExt,
  voiceNeedsBrowserOnIos,
} from '../../packages/mobile/src/features/messenger/logic';
import { resolveAudioMode } from '../../packages/mobile/src/lib/audioModePolicy';
import { pickVoiceMimeType } from '../modules/Komunikator/components/AudioRecorder.jsx';

describe('mobilka — plakietka ikony', () => {
  it('liczy rozmowy z nieprzeczytanymi, bez archiwum (jak filtr „Nieprzeczytane” i serwer)', () => {
    expect(
      unreadConversationsBadge([
        { unread_count: 3 },
        { unread_count: 1, archived: false },
        { unread_count: 0 },
        { unread_count: 5, archived: true },
        { unread_count: null },
        {},
      ]),
    ).toBe(2);
    expect(unreadConversationsBadge([])).toBe(0);
    expect(unreadConversationsBadge(null)).toBe(0);
  });
});

describe('mobilka — tryb dźwięku', () => {
  it('bez odtwarzania głosu: dźwięki UI respektują przełącznik wyciszenia i nie przerywają muzyki', () => {
    const ui = resolveAudioMode([]);
    expect(ui.playsInSilentMode).toBe(false);
    expect(ui.allowsRecording).toBe(false);
    expect(ui.interruptionMode).toBe('mixWithOthers');
    expect(ui.shouldPlayInBackground).toBe(false);
  });
  it('głos słychać przy wyciszniku tylko na czas grania; nagrywanie wygrywa z odtwarzaniem', () => {
    expect(resolveAudioMode(['playback'])).toMatchObject({ playsInSilentMode: true, allowsRecording: false });
    expect(resolveAudioMode(['playback', 'record'])).toMatchObject({ playsInSilentMode: true, allowsRecording: true });
    expect(resolveAudioMode(['ui'])).toMatchObject({ playsInSilentMode: false });
  });
});

describe('mobilka — głosówki', () => {
  const url = 'https://schwro.avenit.pl/storage/messenger-attachments/feb0c0f3-42c1-4fe8-a363-7225d2001c6c/voice-1792605457196-4f0cjy-41s.m4a';
  it('rozszerzenie z adresu (bez podpisu w zapytaniu); nieznane → m4a', () => {
    expect(voiceFileExt(url)).toBe('m4a');
    expect(voiceFileExt(`${url}?exp=1&sig=abc`)).toBe('m4a');
    expect(voiceFileExt('https://x/storage/messenger-attachments/c/voice-1.webm')).toBe('webm');
    expect(voiceFileExt('https://x/plik')).toBe('m4a');
    expect(voiceFileExt(null)).toBe('m4a');
  });
  it('plik w pamięci: stała nazwa dla nagrania, inna dla innego, z rozszerzeniem', () => {
    const a = voiceCacheName(url);
    expect(a).toBe(voiceCacheName(url));
    expect(a).toMatch(/^voice-[a-z0-9]+-[a-z0-9]+\.m4a$/);
    expect(voiceCacheName(url.replace('41s', '42s'))).not.toBe(a);
  });
  it('WebM/Ogg z przeglądarki — na iOS przez Safari; m4a/mp4 — natywnie', () => {
    expect(voiceNeedsBrowserOnIos('audio/webm;codecs=opus', 'x.webm')).toBe(true);
    expect(voiceNeedsBrowserOnIos(undefined, 'https://x/voice-1.ogg')).toBe(true);
    expect(voiceNeedsBrowserOnIos('audio/mp4', url)).toBe(false);
    expect(voiceNeedsBrowserOnIos('audio/mp4;codecs=mp4a.40.2', 'https://x/voice-1.mp4')).toBe(false);
  });
});

describe('web — format nagrania głosowego', () => {
  it('najpierw MP4/AAC (zagra w aplikacji na iPhonie), potem WebM', () => {
    expect(pickVoiceMimeType(() => true)).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickVoiceMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickVoiceMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickVoiceMimeType(() => false)).toBe('');
    expect(pickVoiceMimeType(() => { throw new Error('x'); })).toBe('');
  });
});
