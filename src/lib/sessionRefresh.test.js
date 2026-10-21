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

// Odczyt sesji przy starcie: SecureStore odpowiada asynchronicznie, a kilka miejsc naraz pyta
// o sesję (ekran startowy, push, nasłuch logowania). Wcześniej drugie i kolejne zapytanie
// dostawało PUSTĄ sesję (znacznik „wczytane” ustawiony przed odczytem) → ekran logowania.
describe('odczyt sesji i kościoła przy starcie (wyścig)', () => {
  const slowStorage = () => {
    const m = new Map([['avenit.auth.session', JSON.stringify(SESSION)], ['avenit.tenant', 'schwro']]);
    return { getItem: (k) => new Promise((r) => setTimeout(() => r(m.get(k) ?? null), 20)), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
  };

  it('równoczesne getSession / getUser / onAuthStateChange — wszystkie widzą zapisaną sesję', async () => {
    const client = createApiClient({ apiUrl: 'https://api.test', storage: slowStorage(), fetchImpl: async () => json(200, {}) });
    let initial = 'nie wywołano';
    client.auth.onAuthStateChange((event, s) => { if (event === 'INITIAL_SESSION') initial = s; });
    const [a, b, c] = await Promise.all([client.auth.getSession(), client.auth.getSession(), client.auth.getUser()]);
    expect(a.data.session?.refresh_token).toBe('r0');
    expect(b.data.session?.refresh_token).toBe('r0');
    expect(c.data.user?.email).toBe('ja@x.pl');
    await new Promise((r) => setTimeout(r, 30));
    expect(initial?.refresh_token).toBe('r0');
  });

  it('pierwsze żądania przy starcie mają już nagłówek kościoła (X-Tenant)', async () => {
    const seen = [];
    const client = createApiClient({ apiUrl: 'https://api.test', storage: slowStorage(), fetchImpl: async (url, opts) => { seen.push(opts?.headers?.['X-Tenant'] || null); return json(200, {}); } });
    await Promise.all([client.functions.invoke('a', { body: {} }), client.functions.invoke('b', { body: {} })]);
    expect(seen).toEqual(['schwro', 'schwro']);
  });
});

describe('wylogowanie w trakcie pierwszego odczytu', () => {
  it('nie wraca stara sesja z pamięci', async () => {
    const m = new Map([['avenit.auth.session', JSON.stringify(SESSION)]]);
    const st = { getItem: (k) => new Promise((r) => setTimeout(() => r(m.get(k) ?? null), 20)), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
    const client = createApiClient({ apiUrl: 'https://api.test', storage: st, fetchImpl: async () => json(200, {}) });
    const pending = client.auth.getSession();
    await client.auth.signOut();
    await pending;
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

// Funkcja publiczna w INNYM kościele niż sesja (link/QR tłumaczenia z innego kościoła): X-Tenant
// z linku, bez tokenu sesji; ten sam kościół — zwykłe wywołanie z sesją.
describe('functions.invoke z opcją tenant', () => {
  function client() {
    const st = storage();
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, headers: opts?.headers || {}, credentials: opts?.credentials });
      return json(200, { ok: true });
    };
    return { calls, client: createApiClient({ apiUrl: 'https://api.test', tenant: 'k', storage: st, fetchImpl }) };
  }

  it('inny kościół — X-Tenant z opcji, bez Authorization i ciasteczek', async () => {
    const { calls, client: c } = client();
    const r = await c.functions.invoke('interp-public-info', { body: { token: 't' }, silent: true, tenant: 'inny' });
    expect(r.data).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/api/fn/interp-public-info');
    expect(calls[0].headers['X-Tenant']).toBe('inny');
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].credentials).toBe('omit');
  });

  it('ten sam kościół albo bez opcji — z sesją', async () => {
    const { calls, client: c } = client();
    await c.functions.invoke('interp-public-info', { body: {}, silent: true, tenant: 'k' });
    await c.functions.invoke('interp-public-info', { body: {}, silent: true });
    for (const call of calls) {
      expect(call.headers['X-Tenant']).toBe('k');
      expect(call.headers.Authorization).toBe('Bearer old');
    }
  });
});
