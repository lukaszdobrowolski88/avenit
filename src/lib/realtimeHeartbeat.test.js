import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '@avenit/shared/src/lib/apiClient.js';

// Atrapa WebSocket: zapamiętuje wysłane ramki; test sam „otwiera” gniazdo i odpowiada (albo nie).
class FakeSocket {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.all.push(this);
  }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.closed = true; }
  open() { this.readyState = 1; this.onopen?.(); }
  reply(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const memoryStorage = (session) => {
  const m = new Map([['avenit.auth.session', JSON.stringify(session)]]);
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
};

async function connectedClient() {
  const client = createApiClient({ apiUrl: 'https://x.test', realtime: true, storage: memoryStorage({ access_token: 'tok' }) });
  await client.auth.getSession();
  client.channel('t').on('postgres_changes', { event: '*', table: 'calls' }, () => {}).subscribe();
  const sock = FakeSocket.all.at(-1);
  sock.open();
  return { client, sock };
}

describe('realtime: sprawdzanie, czy gniazdo żyje', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ping co 25 s; odpowiedź pong utrzymuje gniazdo', async () => {
    const { sock } = await connectedClient();
    expect(sock.sent).toContainEqual({ type: 'subscribe', table: 'calls' });
    vi.advanceTimersByTime(25000);
    expect(sock.sent).toContainEqual({ type: 'ping' });
    sock.reply({ type: 'pong' });
    vi.advanceTimersByTime(15000);
    expect(sock.closed).toBeFalsy();
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('brak pong = martwe gniazdo: nowe połączenie, ponowne subskrypcje i zdarzenie reconnect', async () => {
    const onReconnect = vi.fn();
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    const { sock } = await connectedClient();
    vi.advanceTimersByTime(25000 + 10000);
    expect(sock.closed).toBe(true);
    vi.advanceTimersByTime(1); // ponowne połączenie od razu (bez 3 s czekania)
    expect(FakeSocket.all).toHaveLength(2);
    const next = FakeSocket.all[1];
    next.open();
    expect(next.sent).toContainEqual({ type: 'subscribe', table: 'calls' });
    expect(onReconnect).toHaveBeenCalledTimes(1);
    // Spóźnione zdarzenia starego gniazda już nic nie robią.
    sock.onclose?.();
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.all).toHaveLength(2);
    window.removeEventListener('avenit:realtime-reconnect', onReconnect);
  });
});
