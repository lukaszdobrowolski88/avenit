// Mój profil → Kalendarz Google / Outlook (Faza 2: synchronizacja w obie strony, migracja 119).
// POST /api/fn/calendar-sync { action, provider, ... } — każda zalogowana osoba, tylko WŁASNY kalendarz:
//   status     — stan obu dostawców (bez tokenów): połączenie, kalendarz, preferencje, liczniki
//   connect    — adres autoryzacji (Google calendar.app.created / Microsoft Calendars.ReadWrite) + ciasteczko
//   disconnect — rozłączenie (kalendarz Avenit u dostawcy usuwany, chyba że keep_calendar)
//   save_prefs — wybór wydarzeń: { mode: 'mine'|'all', my_services, registered, my_groups, my_meetings, organized }
//   set_enabled — wstrzymanie / wznowienie
//   sync_now   — pełne uzgodnienie teraz (inline)
// Worker co minutę: runForTenant → calendarSync.runCalendarSync (kolejka, zmiany od dostawców co ~5 min,
// pełne uzgodnienie co 24 h) — osobiste kalendarze i kalendarze kościoła.
import { config, isProd } from '../config.js';
import { isProvider, resolveIntegrationCreds } from '../integrations/providers.js';
import { IntegrationError } from '../integrations/tokens.js';
import { startConnect, NONCE_COOKIE, STATE_TTL_MS } from '../integrations/oauth.js';
import {
  userCalendarStatus, saveUserPrefs, removeUserCalendar, loadUserTarget, setTargetEnabled, syncTarget, runCalendarSync,
  calendarCtx, calendarCtxFromRequest, publicTarget,
} from '../integrations/calendarSync.js';

export const name = 'calendar-sync';
export const isPublic = false;
export const rateLimit = { max: 60, timeWindow: '10 minutes' };

export async function calendarAction(req, deps = {}) {
  const db = req.db;
  const b = req.body || {};
  const action = String(b.action || 'status');
  const provider = String(b.provider || '');
  const { rows } = await db.query(`SELECT id, email, COALESCE(is_active, true) AS is_active FROM app_users WHERE id::text = $1`, [String(req.user.id)]);
  const me = rows[0];
  if (!me || me.is_active === false) throw new IntegrationError('Brak konta.', { status: 403, code: 'forbidden' });
  if (action === 'status') return { providers: await userCalendarStatus(db, me.id) };
  if (!isProvider(provider)) throw new IntegrationError('Nieznany dostawca.', { status: 400 });

  if (action === 'connect') {
    const creds = await resolveIntegrationCreds(db, provider);
    const { url, nonce } = await startConnect(db, {
      provider, purpose: 'calendar', tenant: req.tenant.subdomain, user: { id: me.id, email: me.email }, creds,
    });
    return { url, __cookie: nonce };
  }
  if (action === 'disconnect') {
    return { success: true, removed: await removeUserCalendar(db, me.id, provider, { removeRemote: b.keep_calendar !== true }) };
  }
  if (action === 'save_prefs') {
    return { success: true, prefs: await saveUserPrefs(db, me.id, provider, b.prefs) };
  }
  const target = await loadUserTarget(db, me.id, provider);
  if (!target) throw new IntegrationError('Najpierw połącz kalendarz.', { status: 409, code: 'not_connected' });
  if (action === 'set_enabled') {
    await setTargetEnabled(db, target, b.enabled !== false);
    return { success: true };
  }
  if (action === 'sync_now') {
    const ctx = calendarCtxFromRequest(req, deps);
    const fresh = await loadUserTarget(db, me.id, provider);
    const result = await syncTarget(db, { ...fresh, backoff_until: null }, ctx, { forceFull: true, forcePull: true });
    return { success: !result.error, result, target: await publicTarget(db, await loadUserTarget(db, me.id, provider)) };
  }
  throw new IntegrationError('Nieznana akcja.', { status: 400 });
}

export default async function handler(req, reply) {
  try {
    const out = await calendarAction(req);
    if (out.__cookie) {
      reply.setCookie(NONCE_COOKIE, out.__cookie, {
        httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', domain: `.${config.APP_DOMAIN}`, maxAge: Math.floor(STATE_TTL_MS / 1000),
      });
      delete out.__cookie;
    }
    return reply.send(out);
  } catch (e) {
    if (e instanceof IntegrationError) return reply.code(e.status || 400).send({ error: e.message, code: e.code });
    req.log.error({ err: e }, 'calendar-sync failed');
    return reply.code(500).send({ error: 'Błąd synchronizacji kalendarza.' });
  }
}

// Worker (co minutę).
export async function runForTenant(pool, ctx = {}) {
  const r = await runCalendarSync(pool, calendarCtx({
    tenantSlug: ctx.tenantSlug, tenantSubdomain: ctx.tenantSubdomain, tenantName: ctx.tenantName, tenantDbName: ctx.tenantDbName,
    log: ctx.log,
  }));
  const errs = (r.targets || []).filter((t) => t.error);
  if (errs.length) ctx.log?.(`calendar-sync: błędy w ${errs.length} kalendarzach`);
  return r;
}
