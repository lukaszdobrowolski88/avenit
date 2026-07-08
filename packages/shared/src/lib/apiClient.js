// Klient Avenit API o interfejsie zgodnym z używanym podzbiorem supabase-js.
// Dzięki temu ~240 plików modułów działa bez zmian — podmieniamy tylko fabrykę.
//
// Obsługiwane: from().select/insert/update/upsert/delete + filtry
// (eq, neq, gt, gte, lt, lte, like, ilike, is, in, contains, or, not, match),
// order/limit/range, single/maybeSingle, count/head, zagnieżdżone selecty;
// auth.* (signInWithPassword, getUser, getSession, onAuthStateChange, signOut,
// updateUser, resetPasswordForEmail, setSession, signUp); storage.*
// (upload, getPublicUrl, remove, list); functions.invoke; rpc; channel (WS lub no-op).

const SESSION_KEY = 'avenit.auth.session';

export function createApiClient({
  apiUrl = '',
  tenant = null,
  storage = null,
  realtime = false,
  fetchImpl = null,
} = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const base = String(apiUrl || '').replace(/\/$/, '');

  // ── Sesja ──────────────────────────────────────────────────────────────
  let session = null;
  let sessionLoaded = false;
  const authListeners = new Set();

  async function loadSession() {
    if (sessionLoaded) return session;
    sessionLoaded = true;
    try {
      const raw = await storage?.getItem(SESSION_KEY);
      if (raw) session = JSON.parse(raw);
    } catch {
      session = null;
    }
    return session;
  }

  async function saveSession(next, event) {
    session = next;
    sessionLoaded = true;
    try {
      if (next) await storage?.setItem(SESSION_KEY, JSON.stringify(next));
      else await storage?.removeItem(SESSION_KEY);
    } catch {
      // brak storage (SSR itp.) — sesja tylko w pamięci
    }
    for (const cb of authListeners) {
      try {
        cb(event || (next ? 'SIGNED_IN' : 'SIGNED_OUT'), next);
      } catch {}
    }
  }

  function authHeaders() {
    const h = {};
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    if (tenant) h['X-Tenant'] = tenant;
    return h;
  }

  let refreshPromise = null;
  async function tryRefresh() {
    if (!session?.refresh_token) return false;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await doFetch(`${base}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(tenant ? { 'X-Tenant': tenant } : {}) },
            credentials: 'include',
            body: JSON.stringify({ refresh_token: session.refresh_token }),
          });
          if (!res.ok) throw new Error('refresh failed');
          const data = await res.json();
          await saveSession(
            { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user },
            'TOKEN_REFRESHED'
          );
          return true;
        } catch {
          await saveSession(null, 'SIGNED_OUT');
          return false;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    return refreshPromise;
  }

  // Żądanie z automatycznym odświeżeniem tokena przy 401 (raz).
  async function request(path, options = {}, retried = false) {
    await loadSession();
    const res = await doFetch(`${base}${path}`, {
      credentials: 'include',
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
    if (res.status === 401 && !retried && session?.refresh_token) {
      const ok = await tryRefresh();
      if (ok) return request(path, options, true);
    }
    return res;
  }

  async function requestJson(path, body) {
    const res = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {}
    return { res, payload };
  }

  // ── Query builder ──────────────────────────────────────────────────────
  class QueryBuilder {
    constructor(table) {
      this._q = { table, op: 'select', filters: [], order: [] };
    }
    select(columns = '*', opts = {}) {
      if (this._q.op === 'select') {
        this._q.select = columns;
      } else {
        this._q.returning = columns || '*';
      }
      if (opts.count) this._q.count = opts.count;
      if (opts.head) this._q.head = true;
      return this;
    }
    insert(values) { this._q.op = 'insert'; this._q.values = values; return this; }
    upsert(values, opts = {}) {
      this._q.op = 'upsert';
      this._q.values = values;
      if (opts.onConflict) this._q.onConflict = opts.onConflict;
      if (opts.ignoreDuplicates) this._q.ignoreDuplicates = true;
      return this;
    }
    update(values) { this._q.op = 'update'; this._q.values = values; return this; }
    delete() { this._q.op = 'delete'; return this; }

    eq(c, v) { return this._f('eq', c, v); }
    neq(c, v) { return this._f('neq', c, v); }
    gt(c, v) { return this._f('gt', c, v); }
    gte(c, v) { return this._f('gte', c, v); }
    lt(c, v) { return this._f('lt', c, v); }
    lte(c, v) { return this._f('lte', c, v); }
    like(c, v) { return this._f('like', c, v); }
    ilike(c, v) { return this._f('ilike', c, v); }
    is(c, v) { return this._f('is', c, v); }
    in(c, v) { return this._f('in', c, v); }
    contains(c, v) { return this._f('contains', c, v); }
    or(expr) { this._q.filters.push({ type: 'or', value: expr }); return this; }
    not(c, operator, v) { this._q.filters.push({ type: 'not', column: c, operator, value: v }); return this; }
    match(obj) { this._q.filters.push({ type: 'match', value: obj }); return this; }
    filter(c, operator, v) { return this._f(operator, c, v); }
    _f(type, column, value) { this._q.filters.push({ type, column, value }); return this; }

    order(column, opts = {}) {
      this._q.order.push({
        column,
        ascending: opts.ascending !== false,
        nullsFirst: opts.nullsFirst,
      });
      return this;
    }
    limit(n) { this._q.limit = n; return this; }
    range(from, to) { this._q.offset = from; this._q.limit = to - from + 1; return this; }
    single() { this._q.single = true; return this; }
    maybeSingle() { this._q.single = 'maybe'; return this; }
    throwOnError() { this._throw = true; return this; }

    async _run() {
      const q = this._q;
      // insert/update/delete bez .select() => nie zwracaj wierszy
      const { res, payload } = await requestJson('/api/db', q);
      if (!res.ok || payload?.error) {
        const error = {
          message: payload?.error || `HTTP ${res.status}`,
          code: payload?.code || String(res.status),
          details: payload?.details || null,
          hint: null,
        };
        if (this._throw) throw Object.assign(new Error(error.message), error);
        // single() z 0 wierszy: supabase zwraca data:null + error PGRST116 — już tak jest z API.
        return { data: q.single ? null : null, error, count: null, status: res.status, statusText: '' };
      }
      return {
        data: payload.data ?? (q.single ? null : []),
        error: null,
        count: payload.count ?? null,
        status: res.status,
        statusText: 'OK',
      };
    }
    then(onFulfilled, onRejected) { return this._run().then(onFulfilled, onRejected); }
    catch(onRejected) { return this._run().catch(onRejected); }
    finally(cb) { return this._run().finally(cb); }
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  const auth = {
    async signInWithPassword({ email, password, totpCode }) {
      const { res, payload } = await requestJson('/api/auth/login', {
        email,
        password,
        totpCode,
      });
      if (!res.ok) {
        return { data: { user: null, session: null }, error: { message: payload?.error || 'Błąd logowania', status: res.status } };
      }
      if (payload.requires2fa) {
        return { data: { user: null, session: null, requires2fa: true }, error: null };
      }
      const next = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        user: payload.user,
      };
      await saveSession(next, 'SIGNED_IN');
      return { data: { user: payload.user, session: next }, error: null };
    },

    async signUp({ email, password }) {
      // Samodzielna rejestracja użytkowników nie jest wspierana w modelu tenantowym —
      // konta zakłada admin kościoła (lub panel platformy).
      return {
        data: { user: null, session: null },
        error: { message: 'Rejestracja odbywa się przez administratora' },
      };
    },

    async signOut() {
      try {
        await requestJson('/api/auth/logout', { refresh_token: session?.refresh_token });
      } catch {}
      await saveSession(null, 'SIGNED_OUT');
      return { error: null };
    },

    async getUser() {
      await loadSession();
      if (!session) return { data: { user: null }, error: null };
      return { data: { user: session.user }, error: null };
    },

    async getSession() {
      await loadSession();
      return { data: { session }, error: null };
    },

    async setSession({ access_token, refresh_token }) {
      await saveSession({ access_token, refresh_token, user: session?.user || null }, 'SIGNED_IN');
      // Dociągnij usera dla spójności.
      try {
        const res = await request('/api/auth/me');
        if (res.ok) {
          const { user } = await res.json();
          await saveSession({ access_token, refresh_token, user }, 'USER_UPDATED');
        }
      } catch {}
      return { data: { session }, error: null };
    },

    async updateUser(attrs) {
      if (attrs?.password) {
        const { res, payload } = await requestJson('/api/auth/update-password', {
          password: attrs.password,
        });
        if (!res.ok) return { data: { user: null }, error: { message: payload?.error || 'Błąd' } };
      }
      return { data: { user: session?.user || null }, error: null };
    },

    async resetPasswordForEmail(email, _opts = {}) {
      const { res, payload } = await requestJson('/api/auth/reset-password', { email });
      if (!res.ok) return { data: null, error: { message: payload?.error || 'Błąd' } };
      return { data: {}, error: null };
    },

    // Wymiana jednorazowego biletu SSO (z app.<domena>) na sesję kościoła.
    async loginWithTicket(ticket) {
      const { res, payload } = await requestJson('/api/auth/ticket', { ticket });
      if (!res.ok) {
        return { data: { session: null }, error: { message: payload?.error || 'Bilet nieprawidłowy' } };
      }
      const next = { access_token: payload.access_token, refresh_token: payload.refresh_token, user: payload.user };
      await saveSession(next, 'SIGNED_IN');
      return { data: { user: payload.user, session: next }, error: null };
    },

    onAuthStateChange(callback) {
      authListeners.add(callback);
      // Emituj stan początkowy (jak supabase-js INITIAL_SESSION).
      loadSession().then((s) => callback('INITIAL_SESSION', s));
      return {
        data: {
          subscription: { unsubscribe: () => authListeners.delete(callback) },
        },
      };
    },
  };

  // ── Storage ────────────────────────────────────────────────────────────
  function storageOrigin() {
    if (base) return base;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }

  const storageApi = {
    from(bucket) {
      return {
        async upload(path, file, opts = {}) {
          const form = new FormData();
          form.append('file', file);
          const res = await request(
            `/api/storage/${bucket}/${String(path).replace(/^\//, '')}`,
            {
              method: 'POST',
              headers: opts.upsert ? { 'X-Upsert': 'true' } : {},
              body: form,
            }
          );
          const payload = await res.json().catch(() => null);
          if (!res.ok) {
            return { data: null, error: { message: payload?.error || `HTTP ${res.status}` } };
          }
          return { data: payload, error: null };
        },
        getPublicUrl(path) {
          const clean = String(path).replace(/^\//, '');
          return { data: { publicUrl: `${storageOrigin()}/storage/${bucket}/${clean}` } };
        },
        async remove(paths) {
          const { res, payload } = await (async () => {
            const r = await request(`/api/storage/${bucket}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paths }),
            });
            return { res: r, payload: await r.json().catch(() => null) };
          })();
          if (!res.ok) return { data: null, error: { message: payload?.error || 'Błąd' } };
          return { data: payload?.data || [], error: null };
        },
        async list(prefix = '', _opts = {}) {
          const { res, payload } = await requestJson(`/api/storage/${bucket}/list`, { prefix });
          if (!res.ok) return { data: [], error: { message: payload?.error || 'Błąd' } };
          return { data: payload?.data || [], error: null };
        },
        async download(path) {
          const clean = String(path).replace(/^\//, '');
          const res = await request(`/storage/${bucket}/${clean}`);
          if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}` } };
          return { data: await res.blob(), error: null };
        },
      };
    },
  };

  // ── Functions ──────────────────────────────────────────────────────────
  const functions = {
    async invoke(name, opts = {}) {
      const { res, payload } = await requestJson(`/api/fn/${name}`, opts.body || {});
      if (!res.ok) {
        return { data: null, error: { message: payload?.error || `HTTP ${res.status}`, status: res.status, context: payload } };
      }
      return { data: payload, error: null };
    },
  };

  // ── Realtime ───────────────────────────────────────────────────────────
  let ws = null;
  let wsHandlers = []; // { table, event, cb, channelName }
  let wsReconnectTimer = null;

  function ensureWs() {
    if (!realtime) return null;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return ws;
    const origin = storageOrigin().replace(/^http/, 'ws');
    if (!origin || !session?.access_token) return null;
    ws = new WebSocket(`${origin}/api/realtime?token=${encodeURIComponent(session.access_token)}`);
    ws.onopen = () => {
      const tables = new Set(wsHandlers.map((h) => h.table));
      for (const table of tables) ws.send(JSON.stringify({ type: 'subscribe', table }));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type !== 'postgres_changes') return;
        for (const h of wsHandlers) {
          if (h.table !== msg.table && h.table !== '*') continue;
          if (h.event !== '*' && h.event !== msg.eventType) continue;
          h.cb({ eventType: msg.eventType, new: msg.new, old: msg.old, table: msg.table });
        }
      } catch {}
    };
    ws.onclose = () => {
      ws = null;
      if (wsHandlers.length && !wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          ensureWs();
        }, 3000);
      }
    };
    return ws;
  }

  const noopChannel = {
    on: () => noopChannel,
    subscribe: () => noopChannel,
    unsubscribe: () => {},
    send: () => {},
  };

  function channel(channelName) {
    if (!realtime) return noopChannel;
    const chan = {
      _handlers: [],
      on(type, filterOrCb, maybeCb) {
        const filter = typeof filterOrCb === 'object' ? filterOrCb : {};
        const cb = typeof filterOrCb === 'function' ? filterOrCb : maybeCb;
        if (type === 'postgres_changes' && cb) {
          const h = { table: filter.table || '*', event: filter.event || '*', cb, channelName };
          chan._handlers.push(h);
        }
        return chan;
      },
      subscribe(statusCb) {
        wsHandlers.push(...chan._handlers);
        const sock = ensureWs();
        if (sock?.readyState === 1) {
          for (const h of chan._handlers) sock.send(JSON.stringify({ type: 'subscribe', table: h.table }));
        }
        if (statusCb) statusCb('SUBSCRIBED');
        return chan;
      },
      unsubscribe() {
        wsHandlers = wsHandlers.filter((h) => !chan._handlers.includes(h));
        return Promise.resolve('ok');
      },
    };
    return chan;
  }

  function removeChannel(chan) {
    chan?.unsubscribe?.();
  }

  // ── RPC ────────────────────────────────────────────────────────────────
  async function rpc(name, args = {}) {
    const { res, payload } = await requestJson(`/api/rpc/${name}`, args);
    if (!res.ok) {
      return { data: null, error: { message: payload?.error || `HTTP ${res.status}`, code: payload?.code } };
    }
    return { data: payload?.data ?? null, error: null };
  }

  return {
    from: (table) => new QueryBuilder(table),
    auth,
    storage: storageApi,
    functions,
    rpc,
    channel,
    removeChannel,
    removeAllChannels: () => {
      wsHandlers = [];
      ws?.close();
    },
    // Dostęp do surowego requesta (dla nietypowych wywołań).
    _request: request,
  };
}
