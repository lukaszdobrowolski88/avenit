// Kalendarz Google / Outlook (Faza 2) — adaptery API dostawców (zwykły fetch, bez SDK).
//
//   Google Calendar API v3 — kalendarz pomocniczy tworzony przez Avenit (zakres calendar.app.created),
//     przyrost: events.list z syncToken (410 GONE → pełna synchronizacja od nowa).
//   Microsoft Graph v1.0 — /me (osoba, token delegowany) albo /users/<skrzynka> (kalendarz kościoła,
//     token aplikacji), przyrost: calendars/{id}/calendarView/delta (deltaLink; paginacja nextLink).
// Wspólne: 401 → jedno wymuszone odświeżenie tokenu; 429/503 → RateLimitError z Retry-After
// (wołający odkłada kalendarz — backoff_until); inne błędy → CalendarApiError.
import { getAccessToken, describeOAuthError } from './tokens.js';
import { MICROSOFT, GOOGLE_CALENDAR_BASE } from './providers.js';
import { googleBody, googleEventId, googleFields, microsoftBody, microsoftFields, TZ, MS_TZ } from './calendarLogic.js';

export class RateLimitError extends Error {
  constructor(retryAfterSec, provider) {
    super(`${provider === 'google' ? 'Google' : 'Microsoft'}: limit zapytań — ponowimy za ${retryAfterSec} s`);
    this.code = 'rate_limited';
    this.retryAfterSec = retryAfterSec;
  }
}
export class CalendarApiError extends Error {
  constructor(message, status, code = 'api_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function retryAfterSeconds(res) {
  const h = res.headers?.get?.('retry-after');
  if (!h) return 60;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.min(3600, Math.max(5, Math.round(n)));
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.min(3600, Math.max(5, Math.round((at - Date.now()) / 1000))) : 60;
}

// Jedno wywołanie API z tokenem połączenia. allow: statusy zwracane bez wyjątku (np. 404).
async function call(db, conn, method, url, { body, headers = {}, allow = [] } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(db, conn, { force: attempt > 0 });
    const res = await globalThis.fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 429 || res.status === 503) throw new RateLimitError(retryAfterSeconds(res), conn.provider);
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok && !allow.includes(res.status)) {
      const who = conn.provider === 'google' ? 'Google' : 'Microsoft';
      throw new CalendarApiError(`${who}: ${describeOAuthError(data || {})} (${res.status})`, res.status,
        res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'api_error');
    }
    return { status: res.status, data };
  }
  throw new CalendarApiError('Token odrzucony przez dostawcę.', 401, 'unauthorized');
}

const enc = encodeURIComponent;

// ── Google ──────────────────────────────────────────────────────────────────
export function googleApi(db, conn) {
  const B = GOOGLE_CALENDAR_BASE;
  return {
    provider: 'google',
    async createCalendar(name, description = '') {
      const { data } = await call(db, conn, 'POST', `${B}/calendars`, { body: { summary: name, description, timeZone: TZ } });
      return { id: data.id, name: data.summary || name };
    },
    async calendarExists(id) {
      const { status } = await call(db, conn, 'GET', `${B}/calendars/${enc(id)}`, { allow: [404, 410] });
      return status !== 404 && status !== 410;
    },
    async deleteCalendar(id) {
      await call(db, conn, 'DELETE', `${B}/calendars/${enc(id)}`, { allow: [403, 404, 410] });
    },
    // Udostępnienie do odczytu domenie organizacji (kalendarz kościoła). Bez uprawnień → false.
    async shareWithDomain(id, domain) {
      const { status } = await call(db, conn, 'POST', `${B}/calendars/${enc(id)}/acl`, {
        body: { role: 'reader', scope: { type: 'domain', value: domain } }, allow: [400, 403, 409],
      });
      return status >= 200 && status < 300;
    },
    // → { externalId, etag }
    async upsertEvent(calId, externalId, payload, { targetId, eventId }) {
      const body = googleBody(payload, { targetId, eventId });
      if (externalId) {
        const r = await call(db, conn, 'PUT', `${B}/calendars/${enc(calId)}/events/${enc(externalId)}`, { body, allow: [404, 410] });
        if (r.status < 300) return { externalId: r.data.id, etag: r.data.etag };
      }
      for (let gen = 0; gen < 3; gen++) {
        const id = googleEventId(targetId, eventId, gen ? `${gen}-${Date.now()}` : '');
        const r = await call(db, conn, 'POST', `${B}/calendars/${enc(calId)}/events`, { body: { ...body, id }, allow: [409] });
        if (r.status < 300) return { externalId: r.data.id, etag: r.data.etag };
        // 409: ten identyfikator już istnieje (ponowienie po awarii albo wcześniej usunięte) → aktualizacja.
        const u = await call(db, conn, 'PUT', `${B}/calendars/${enc(calId)}/events/${enc(id)}`, { body, allow: [404, 410] });
        if (u.status < 300) return { externalId: u.data.id, etag: u.data.etag };
      }
      throw new CalendarApiError('Google: nie udało się zapisać wydarzenia.', 409);
    },
    async deleteEvent(calId, externalId) {
      await call(db, conn, 'DELETE', `${B}/calendars/${enc(calId)}/events/${enc(externalId)}`, { allow: [404, 410] });
    },
    // Zmiany od ostatniego kursora → { reset?, items: [{ externalId, removed, etag, fields, updated, avenitEventId }], cursor }.
    async listChanges(calId, cursor) {
      const items = [];
      let pageToken = null;
      for (let page = 0; page < 200; page++) {
        const q = new URLSearchParams({ showDeleted: 'true', maxResults: '250' });
        if (cursor && !pageToken) q.set('syncToken', cursor);
        if (pageToken) q.set('pageToken', pageToken);
        const { status, data } = await call(db, conn, 'GET', `${B}/calendars/${enc(calId)}/events?${q}`, { allow: [410] });
        if (status === 410) return { reset: true, items: [], cursor: null };
        for (const e of data.items || []) {
          const removed = e.status === 'cancelled';
          items.push({
            externalId: e.id, removed, etag: e.etag || null, updated: e.updated || null,
            recurring: !!(e.recurrence?.length || e.recurringEventId),
            avenitEventId: e.extendedProperties?.private?.avenit_event_id || null,
            fields: removed ? null : googleFields(e),
          });
        }
        if (data.nextPageToken) { pageToken = data.nextPageToken; continue; }
        return { items, cursor: data.nextSyncToken || cursor || null };
      }
      return { items, cursor: cursor || null };
    },
  };
}

// ── Microsoft ───────────────────────────────────────────────────────────────
// base: '/me' (osoba) albo '/users/<skrzynka>' (kalendarz kościoła).
export function microsoftApi(db, conn, { mailbox = null } = {}) {
  const G = MICROSOFT.graphBase;
  const base = mailbox ? `${G}/users/${enc(mailbox)}` : `${G}/me`;
  const PREFER = `outlook.timezone="${MS_TZ}", outlook.body-content-type="text"`;
  return {
    provider: 'microsoft',
    async createCalendar(name) {
      const r = await call(db, conn, 'POST', `${base}/calendars`, { body: { name }, allow: [409] });
      if (r.status < 300) return { id: r.data.id, name: r.data.name || name };
      // Kalendarz o tej nazwie już jest (np. po ponownym połączeniu) — użyj go.
      const { data } = await call(db, conn, 'GET', `${base}/calendars?$top=200&$select=id,name`);
      const found = (data?.value || []).find((c) => c.name === name);
      if (!found) throw new CalendarApiError('Microsoft: nie udało się utworzyć kalendarza.', 409);
      return { id: found.id, name: found.name };
    },
    async primaryCalendar() {
      const { data } = await call(db, conn, 'GET', `${base}/calendar?$select=id,name`);
      return { id: data.id, name: data.name || 'Kalendarz' };
    },
    async calendarExists(id) {
      const { status } = await call(db, conn, 'GET', `${base}/calendars/${enc(id)}?$select=id`, { allow: [404] });
      return status !== 404;
    },
    async shareWithDomain() { return false; },
    async deleteCalendar(id) {
      await call(db, conn, 'DELETE', `${base}/calendars/${enc(id)}`, { allow: [403, 404] });
    },
    async upsertEvent(calId, externalId, payload) {
      const body = microsoftBody(payload);
      if (externalId) {
        const r = await call(db, conn, 'PATCH', `${base}/events/${enc(externalId)}`, { body, allow: [404] });
        if (r.status < 300) return { externalId: r.data.id, etag: r.data.changeKey || null };
      }
      const { data } = await call(db, conn, 'POST', `${base}/calendars/${enc(calId)}/events`, { body });
      return { externalId: data.id, etag: data.changeKey || null };
    },
    async deleteEvent(calId, externalId) {
      await call(db, conn, 'DELETE', `${base}/events/${enc(externalId)}`, { allow: [404] });
    },
    async listChanges(calId, cursor, { from, to } = {}) {
      const items = [];
      let url = cursor || `${base}/calendars/${enc(calId)}/calendarView/delta?${new URLSearchParams({
        startDateTime: `${from}T00:00:00`, endDateTime: `${to}T00:00:00`,
      })}`;
      for (let page = 0; page < 200; page++) {
        const { status, data } = await call(db, conn, 'GET', url, { headers: { Prefer: `${PREFER}, odata.maxpagesize=100` }, allow: [400, 404, 410] });
        // Wygasły/nieprawidłowy stan delty → od nowa (jak 410 w Google).
        if (status === 410 || ((status === 400 || status === 404) && cursor)) return { reset: true, items: [], cursor: null };
        if (status >= 400) throw new CalendarApiError(`Microsoft: ${describeOAuthError(data || {})} (${status})`, status);
        for (const e of data.value || []) {
          const removed = !!e['@removed'];
          items.push({
            externalId: e.id, removed, etag: e.changeKey || null, updated: e.lastModifiedDateTime || null,
            recurring: e.type === 'occurrence' || e.type === 'seriesMaster' || e.type === 'exception',
            avenitEventId: null,
            fields: removed ? null : microsoftFields(e),
          });
        }
        if (data['@odata.nextLink']) { url = data['@odata.nextLink']; continue; }
        return { items, cursor: data['@odata.deltaLink'] || cursor || null };
      }
      return { items, cursor: cursor || null };
    },
  };
}

export function apiFor(db, conn, target) {
  if (conn.provider === 'google') return googleApi(db, conn);
  return microsoftApi(db, conn, { mailbox: target.kind === 'church' ? target.mailbox : null });
}
