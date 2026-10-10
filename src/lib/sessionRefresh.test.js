import { describe, it, expect } from 'vitest';
import { createApiClient } from '@avenit/shared/src/lib/apiClient.js';

// Odświeżanie sesji: wylogowanie tylko przy jednoznacznym odrzuceniu refresh tokenu; brak sieci
// i błędy serwera zostawiają sesję (mobilka nie loguje się od nowa po wyjściu z aplikacji).
const SESSION = { access_token: 'old', refresh_token: 'r0', user: { email: 'ja@x.pl' } };
function storage() {
  const m = new Map([['avenit.auth.session', JSON.stringify(SESSION)]]);
  return { m, getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, clone() { return this; } });

function clientWith(refreshBehaviour) {
  const st = storage();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/api/auth/refresh')) return refreshBehaviour();
    if (url.endsWith('/api/fn/ping')) return calls.filter((c) => c.endsWith('/api/fn/ping')).length === 1 ? json(401, {}) : json(200, { ok: true });
    return json(200, {});
  };
  return { st, calls, client: createApiClient({ apiUrl: 'https://api.test', tenant: 'k', storage: st, fetchImpl }) };
}
const stored = (st) => JSON.parse(st.m.get('avenit.auth.session') || 'null');

describe('odświeżanie sesji', () => {
  it('brak sieci przy odświeżaniu — sesja zostaje', async () => {
    const { st, client } = clientWith(() => { throw new TypeError('Network request failed'); });
    await client.functions.invoke('ping', { body: {}, silent: true });
    expect(stored(st)?.refresh_token).toBe('r0');
    expect((await client.auth.getSession()).data.session).not.toBeNull();
  });

  it('błąd serwera (503) — sesja zostaje', async () => {
    const { st, client } = clientWith(() => json(503, { error: 'deploy' }));
    await client.functions.invoke('ping', { body: {}, silent: true });
    expect(stored(st)?.refresh_token).toBe('r0');
  });

  it('serwer odrzuca refresh token (401) — wylogowanie', async () => {
    const { st, client } = clientWith(() => json(401, { error: 'Sesja wygasła' }));
    await client.functions.invoke('ping', { body: {}, silent: true });
    expect(stored(st)).toBeNull();
  });

  it('udane odświeżenie — nowy token zapisany, żądanie ponowione', async () => {
    const { st, client, calls } = clientWith(() => json(200, { access_token: 'new', refresh_token: 'r1', user: { email: 'ja@x.pl' } }));
    await client.functions.invoke('ping', { body: {}, silent: true });
    expect(stored(st)).toMatchObject({ access_token: 'new', refresh_token: 'r1' });
    expect(calls.filter((c) => c.endsWith('/api/fn/ping')).length).toBe(2);
  });
});
