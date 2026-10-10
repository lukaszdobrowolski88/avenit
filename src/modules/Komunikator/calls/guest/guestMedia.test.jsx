import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../livekit', () => ({ mediaFailure: () => 'Other', loadLivekit: async () => ({}) }));
const { useGuestMedia } = await import('./GuestCallPage');

// Atrapa ścieżek i getUserMedia — liczymy, ile razy przeglądarka zapytałaby o zgodę.
function fakeTrack(kind) {
  return { kind, enabled: true, readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended'; }) };
}
class FakeStream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
}

let gum;
beforeEach(() => {
  gum = vi.fn(async (c) => new FakeStream([...(c.audio ? [fakeTrack('audio')] : []), ...(c.video ? [fakeTrack('video')] : [])]));
  vi.stubGlobal('MediaStream', FakeStream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('useGuestMedia — jedno pytanie o zgodę na wizytę', () => {
  it('jedno getUserMedia na mikrofon i kamerę; przełączniki nie pytają ponownie', async () => {
    const { result, rerender } = renderHook(({ prefs, active }) => useGuestMedia(prefs, active), { initialProps: { prefs: { mic: true, cam: true }, active: true } });
    await waitFor(() => expect(result.current.stream).toBeTruthy());
    expect(gum).toHaveBeenCalledTimes(1);
    expect(gum).toHaveBeenCalledWith({ audio: true, video: { facingMode: 'user' } });
    rerender({ prefs: { mic: false, cam: false }, active: true });
    rerender({ prefs: { mic: true, cam: true }, active: true });
    expect(gum).toHaveBeenCalledTimes(1);
    expect(result.current.stream.getAudioTracks()[0].enabled).toBe(true);
  });

  it('rozmowa przejmuje te same ścieżki; wyłączona kamera — zatrzymana (gaśnie lampka)', async () => {
    const { result, rerender } = renderHook(({ prefs, active }) => useGuestMedia(prefs, active), { initialProps: { prefs: { mic: true, cam: true }, active: true } });
    await waitFor(() => expect(result.current.stream).toBeTruthy());
    const [audio] = result.current.stream.getAudioTracks();
    const [video] = result.current.stream.getVideoTracks();
    rerender({ prefs: { mic: true, cam: false }, active: true });
    let tracks;
    act(() => { tracks = result.current.takeTracks(); });
    expect(tracks.audio).toBe(audio);
    expect(tracks.video).toBeNull();
    expect(video.stop).toHaveBeenCalled();
    expect(audio.stop).not.toHaveBeenCalled();
    rerender({ prefs: { mic: true, cam: false }, active: false });
    expect(audio.stop).not.toHaveBeenCalled(); // należy już do rozmowy
    expect(gum).toHaveBeenCalledTimes(1);
  });

  it('kamera dociągana dopiero po włączeniu (gość zaczął bez kamery)', async () => {
    const { result, rerender } = renderHook(({ prefs }) => useGuestMedia(prefs, true), { initialProps: { prefs: { mic: true, cam: false } } });
    await waitFor(() => expect(result.current.stream).toBeTruthy());
    expect(gum).toHaveBeenLastCalledWith({ audio: true, video: false });
    rerender({ prefs: { mic: true, cam: true } });
    await waitFor(() => expect(result.current.stream.getVideoTracks()).toHaveLength(1));
    expect(gum).toHaveBeenLastCalledWith({ audio: false, video: { facingMode: 'user' } });
    expect(result.current.stream.getAudioTracks()).toHaveLength(1);
  });
});
