import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Atrapy: baza (Data API), funkcje serwera, realtime, LiveKit, dzwonek ──────────
const h = vi.hoisted(() => ({ rooms: [], handlers: [], db: {}, fns: {} }));

vi.mock('../../../lib/supabase', () => {
  const result = (table, single) => {
    const v = h.db[table];
    if (single) return { data: Array.isArray(v) ? (v[0] ?? null) : (v ?? null), error: null };
    return { data: Array.isArray(v) ? v : (v ? [v] : []), error: null };
  };
  const builder = (table) => {
    let single = false;
    const b = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (res, rej) => Promise.resolve(result(table, single)).then(res, rej);
        if (prop === 'maybeSingle' || prop === 'single') return () => { single = true; return b; };
        return () => b;
      },
    });
    return b;
  };
  const invoke = vi.fn(async (name, opts) => {
    const fn = h.fns[name];
    if (typeof fn === 'function') return fn(opts?.body);
    return fn || { data: { ok: true }, error: null };
  });
  return {
    supabase: {
      from: (table) => builder(table),
      functions: { invoke },
      channel: () => {
        const chan = {
          on(_type, filter, cb) { h.handlers.push({ table: filter.table, cb }); return chan; },
          subscribe() { return chan; },
        };
        return chan;
      },
      removeChannel: () => {},
    },
  };
});

vi.mock('./ringtone', () => ({ startRingtone: () => () => {}, unlockAudio: () => {} }));

vi.mock('livekit-client', () => {
  const RoomEvent = {
    ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed', TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted', LocalTrackPublished: 'localTrackPublished', LocalTrackUnpublished: 'localTrackUnpublished',
    ActiveSpeakersChanged: 'activeSpeakersChanged', ConnectionQualityChanged: 'connectionQualityChanged',
    ConnectionStateChanged: 'connectionStateChanged', Reconnecting: 'reconnecting', Reconnected: 'reconnected',
    SignalReconnecting: 'signalReconnecting', AudioPlaybackStatusChanged: 'audioPlaybackChanged',
    ParticipantNameChanged: 'participantNameChanged', ParticipantMetadataChanged: 'participantMetadataChanged',
    TrackPublished: 'trackPublished', TrackUnpublished: 'trackUnpublished', MediaDevicesError: 'mediaDevicesError',
    Disconnected: 'disconnected',
  };
  class Room {
    constructor(opts) {
      this.opts = opts;
      this.handlers = {};
      this.remoteParticipants = new Map();
      this.activeSpeakers = [];
      this.state = 'connected';
      this.canPlaybackAudio = true;
      this.localParticipant = {
        identity: 'ja@x.pl', name: 'Ja', metadata: '{}',
        isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false,
        getTrackPublication: () => undefined,
        setMicrophoneEnabled: vi.fn(async function setMic(v) { this.isMicrophoneEnabled = v; }),
        setCameraEnabled: vi.fn(async function setCam(v) { this.isCameraEnabled = v; }),
        setScreenShareEnabled: vi.fn(async () => {}),
      };
      this.connect = vi.fn(async () => {});
      this.disconnect = vi.fn(async () => { this.emit(RoomEvent.Disconnected, 1); });
      h.rooms.push(this);
    }
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
    emit(ev, ...a) { (this.handlers[ev] || []).forEach((f) => f(...a)); }
    prepareConnection() {}
    getActiveDevice() { return ''; }
  }
  Room.getLocalDevices = async () => [];
  return {
    Room, RoomEvent,
    Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share', Microphone: 'microphone' } },
    VideoPresets: {}, ScreenSharePresets: {},
    MediaDeviceFailure: { getFailure: () => 'Other' },
  };
});

const { supabase } = await import('../../../lib/supabase');
const { CallProvider, useCalls } = await import('./CallProvider');
const { default: CallButtons } = await import('./CallButtons');
const { default: ActiveCallBanner } = await import('./ActiveCallBanner');

const emit = (table, eventType, row) => act(async () => {
  h.handlers.filter((x) => x.table === table).forEach((x) => x.cb({ eventType, new: row, old: null, table }));
});

const ringRow = (over = {}) => ({
  id: 'k1', conversation_id: 'c1', room_name: 'avn_t_k1', kind: 'audio', status: 'ringing', is_group: false,
  started_by_email: 'ola@x.pl', started_at: new Date().toISOString(), ...over,
});

function Probe() {
  const calls = useCalls();
  return <div data-testid="phase">{calls.state.phase}</div>;
}

function renderApp(children = null) {
  return render(
    <MemoryRouter>
      <CallProvider userEmail="ja@x.pl">
        <Probe />
        {children}
      </CallProvider>
    </MemoryRouter>
  );
}

const invokedNames = () => supabase.functions.invoke.mock.calls.map((c) => c[0]);

beforeEach(() => {
  h.rooms.length = 0;
  h.handlers.length = 0;
  try { localStorage.clear(); } catch { /* ignore */ }
  h.db = {
    calls: [],
    conversations: { id: 'c1', name: null, type: 'direct', avatar_url: null },
    conversation_participants: [
      { user_email: 'ja@x.pl', muted: false, muted_until: null },
      { user_email: 'ola@x.pl', muted: false, muted_until: null },
    ],
    app_users: { email: 'ola@x.pl', full_name: 'Ola Nowak', avatar_url: null },
    call_participants: null,
  };
  h.fns = {
    'call-config': { data: { enabled: true, url: 'wss://rtc.test' }, error: null },
    'call-join': (body) => ({ data: { token: 'tok', url: 'wss://rtc.test', room: 'avn_t_k1', can_publish: true, call: ringRow({ id: body.call_id, status: 'active' }) }, error: null }),
  };
  supabase.functions.invoke.mockClear();
});

describe('CallProvider — maszyna stanów z atrapą LiveKit', () => {
  it('dzwonek → odbierz → rozmowa → zakończ', async () => {
    renderApp();
    await emit('calls', 'INSERT', ringRow());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Ola Nowak');
    expect(dialog.textContent).toContain('Połączenie głosowe przychodzące');

    fireEvent.click(screen.getByRole('button', { name: 'Odbierz' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('active'));
    expect(supabase.functions.invoke).toHaveBeenCalledWith('call-join', expect.objectContaining({ body: { call_id: 'k1' } }));
    const room = h.rooms[0];
    expect(room.opts).toMatchObject({ adaptiveStream: true, dynacast: true });
    expect(room.opts.publishDefaults.simulcast).toBe(true);
    expect(room.connect).toHaveBeenCalledWith('wss://rtc.test', 'tok', expect.anything());
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Rozmowa: Ola Nowak/ })).toBeTruthy();

    // Ktoś dołącza — komunikat dla czytnika ekranu.
    await act(async () => { room.emit('participantConnected', { identity: 'ola@x.pl', name: 'Ola Nowak' }); });
    await waitFor(() => expect(screen.getByText('Ola Nowak dołączył(a) do rozmowy')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Zakończ rozmowę' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('idle'));
    expect(room.disconnect).toHaveBeenCalled();
    await waitFor(() => expect(invokedNames()).toContain('call-leave'));
    expect(screen.queryByRole('dialog', { name: /Rozmowa:/ })).toBeNull();
  });

  it('odrzucenie: call-decline, okno znika i ten sam wiersz nie dzwoni ponownie', async () => {
    renderApp();
    await emit('calls', 'INSERT', ringRow());
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(supabase.functions.invoke).toHaveBeenCalledWith('call-decline', expect.objectContaining({ body: { call_id: 'k1' } }));
    await emit('calls', 'UPDATE', ringRow());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.rooms).toHaveLength(0);
  });

  it('„Dołącz” w rozmowę, która już się skończyła: baner znika, bez łączenia', async () => {
    h.db.calls = [ringRow({ status: 'active', started_by_email: 'ola@x.pl' })];
    h.fns['call-join'] = { data: null, error: { message: 'To połączenie już się zakończyło', status: 410, context: { code: 'CALL_ENDED' } } };
    renderApp(<ActiveCallBanner conversation={{ id: 'c1', type: 'direct' }} />);
    const join = await screen.findByRole('button', { name: 'Dołącz' });
    h.db.calls = [];
    fireEvent.click(join);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dołącz' })).toBeNull());
    expect(screen.getByTestId('phase').textContent).toBe('idle');
    expect(h.rooms).toHaveLength(0);
  });

  it('dzwoniący rezygnuje: wiersz „cancelled” zatrzymuje dzwonek', async () => {
    renderApp();
    await emit('calls', 'INSERT', ringRow());
    await screen.findByRole('alertdialog');
    await emit('calls', 'UPDATE', ringRow({ status: 'cancelled' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('phase').textContent).toBe('idle');
  });

  it('wyciszona rozmowa nie dzwoni (zostaje tylko baner)', async () => {
    h.db.conversation_participants = [{ user_email: 'ja@x.pl', muted: true, muted_until: null }, { user_email: 'ola@x.pl' }];
    renderApp();
    await emit('calls', 'INSERT', ringRow());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('dzwonię: call-start → czekam → druga osoba dołącza → rozmowa', async () => {
    h.fns['call-start'] = { data: { token: 'tok', url: 'wss://rtc.test', room: 'r', can_publish: true, call: ringRow({ id: 'k9', started_by_email: 'ja@x.pl' }) }, error: null };
    const conversation = { id: 'c1', type: 'direct', displayName: 'Ola Nowak', participants: [], posting_policy: 'everyone' };
    renderApp(<CallButtons conversation={conversation} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Połączenie wideo' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('outgoing'));
    expect(supabase.functions.invoke).toHaveBeenCalledWith('call-start', expect.objectContaining({ body: { conversation_id: 'c1', kind: 'video' } }));
    expect(h.rooms[0].localParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Anuluj połączenie' })).toBeTruthy();
    await act(async () => { h.rooms[0].emit('participantConnected', { identity: 'ola@x.pl', name: 'Ola' }); });
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('active'));
  });

  it('poczekalnia gości: prośba w mojej rozmowie (realtime) → „Wpuść” → call-guest-admit, karta znika', async () => {
    h.db.call_guest_requests = [];
    h.fns['call-guest-admit'] = { data: { ok: true }, error: null };
    renderApp();
    await emit('calls', 'INSERT', ringRow());
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Odbierz' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('active'));
    // Prośba z innej rozmowy — nie dla mnie w tej rozmowie.
    await emit('call_guest_requests', 'INSERT', { id: 'g0', conversation_id: 'c9', guest_name: 'Obcy', status: 'pending', created_at: new Date().toISOString() });
    expect(screen.queryByText('Gość chce dołączyć')).toBeNull();
    await emit('call_guest_requests', 'INSERT', { id: 'g1', conversation_id: 'c1', guest_name: 'Anna', status: 'pending', created_at: new Date().toISOString() });
    expect(await screen.findByText('Gość chce dołączyć')).toBeTruthy();
    expect(await screen.findByText('Gość chce dołączyć: Anna')).toBeTruthy(); // komunikat dla czytnika ekranu
    fireEvent.click(screen.getByRole('button', { name: 'Wpuść: Anna' }));
    await waitFor(() => expect(screen.queryByText('Gość chce dołączyć')).toBeNull());
    expect(supabase.functions.invoke).toHaveBeenCalledWith('call-guest-admit', expect.objectContaining({ body: { request_id: 'g1' } }));
    // Ktoś inny odrzucił prośbę — znika też u mnie.
    await emit('call_guest_requests', 'INSERT', { id: 'g2', conversation_id: 'c1', guest_name: 'Piotr', status: 'pending', created_at: new Date().toISOString() });
    await screen.findByText('Piotr');
    await emit('call_guest_requests', 'UPDATE', { id: 'g2', conversation_id: 'c1', guest_name: 'Piotr', status: 'denied' });
    await waitFor(() => expect(screen.queryByText('Gość chce dołączyć')).toBeNull());
  });

  it('połączenia wyłączone (call-config) — przycisków nie ma', async () => {
    h.fns['call-config'] = { data: { enabled: false, url: null }, error: null };
    const conversation = { id: 'c1', type: 'direct', displayName: 'Ola', posting_policy: 'everyone' };
    renderApp(<CallButtons conversation={conversation} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Zadzwoń' })).toBeNull());
  });

  it('503 calls_disabled z call-start chowa przyciski', async () => {
    h.fns['call-config'] = { data: null, error: { status: 404, message: 'HTTP 404' } };
    h.fns['call-start'] = { data: null, error: { status: 503, message: 'Połączenia są wyłączone', context: { error: 'Połączenia są wyłączone', code: 'calls_disabled' } } };
    const conversation = { id: 'c1', type: 'direct', displayName: 'Ola', posting_policy: 'everyone' };
    renderApp(<CallButtons conversation={conversation} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Zadzwoń' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Zadzwoń' })).toBeNull());
    expect(screen.getByTestId('phase').textContent).toBe('idle');
    expect(h.rooms).toHaveLength(0);
  });
});
