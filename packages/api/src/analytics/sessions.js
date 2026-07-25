// Odwiedzający i sesje: find-or-create, dzienna sól (cookieless landing),
// powiązanie odwiedzającego z tożsamością zalogowanego użytkownika.
import crypto from 'node:crypto';
import { platformPool } from '../db.js';
import { config } from '../config.js';

export const SESSION_GAP_MINUTES = 30;

// Hash IP z sekretem serwera — dedup/anty-abuse bez przechowywania PII.
export const hashIp = (ip) =>
  crypto.createHash('sha256').update(`${config.JWT_SECRET}|ip|${ip || ''}`).digest('hex');

// Dzienna sól do cookieless visitor_key na landingu (model Plausible):
// hash(sól+ip+ua) jest stabilny w obrębie doby, nieodtwarzalny po skasowaniu soli.
let saltCache = { day: null, salt: null };

export async function getDailySalt() {
  const day = new Date().toISOString().slice(0, 10);
  if (saltCache.day === day) return saltCache.salt;
  const fresh = crypto.randomBytes(16).toString('hex');
  const { rows } = await platformPool.query(
    `INSERT INTO analytics_daily_salt (day, salt) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET salt = analytics_daily_salt.salt
     RETURNING salt`,
    [day, fresh]
  );
  saltCache = { day, salt: rows[0].salt };
  return saltCache.salt;
}

export const landingVisitorKey = (salt, ip, ua) =>
  'h:' + crypto.createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex');

// Znajdź lub załóż odwiedzającego; przy okazji odśwież snapshot urządzenia/geo.
export async function findOrCreateVisitor({ key, site, referrer, utm, ua, geo }) {
  const { rows } = await platformPool.query(
    `INSERT INTO analytics_visitors
       (visitor_key, site, first_referrer, first_utm, device_type, browser, os,
        country, region, city, asn_org, rdns_host, org_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
     ON CONFLICT (visitor_key) DO UPDATE SET
       last_seen = NOW(),
       device_type = COALESCE(EXCLUDED.device_type, analytics_visitors.device_type),
       browser = COALESCE(EXCLUDED.browser, analytics_visitors.browser),
       os = COALESCE(EXCLUDED.os, analytics_visitors.os),
       country = COALESCE(EXCLUDED.country, analytics_visitors.country),
       region = COALESCE(EXCLUDED.region, analytics_visitors.region),
       city = COALESCE(EXCLUDED.city, analytics_visitors.city),
       asn_org = COALESCE(EXCLUDED.asn_org, analytics_visitors.asn_org),
       org_source = COALESCE(analytics_visitors.org_source, EXCLUDED.org_source)
     RETURNING id, visitor_key, sessions_count`,
    [
      key, site, referrer || null, utm ? JSON.stringify(utm) : null,
      ua.deviceType, ua.browser, ua.os,
      geo.country, geo.region, geo.city, geo.asnOrg,
      geo.asnOrg ? 'asn' : null,
    ]
  );
  return rows[0];
}

// Otwarta sesja odwiedzającego (ostatnia aktywność < 30 min) albo nowa.
// Zwraca { id, isNew }.
export async function findOrCreateSession({ visitorId, site, tenantId, userId, entry, ua, geo, ipHash, scr, lang }) {
  const { rows: open } = await platformPool.query(
    `SELECT id FROM analytics_sessions
      WHERE visitor_id = $1 AND site = $2
        AND last_activity_at > NOW() - make_interval(mins => $3)
      ORDER BY last_activity_at DESC LIMIT 1`,
    [visitorId, site, SESSION_GAP_MINUTES]
  );
  if (open[0]) return { id: open[0].id, isNew: false };

  const [w, h] = /^\d{2,5}x\d{2,5}$/.test(scr || '') ? scr.split('x').map(Number) : [null, null];
  const refDomain = referrerDomain(entry.referrer);
  const { rows } = await platformPool.query(
    `INSERT INTO analytics_sessions
       (visitor_id, site, tenant_id, entry_path, referrer, referrer_domain,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        device_type, browser, browser_version, os, screen_w, screen_h, language,
        country, region, city, ip_hash, asn_org, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING id`,
    [
      visitorId, site, tenantId, entry.path || null, entry.referrer || null, refDomain,
      entry.utm?.source || null, entry.utm?.medium || null, entry.utm?.campaign || null,
      entry.utm?.term || null, entry.utm?.content || null,
      ua.deviceType, ua.browser, ua.browserVersion, ua.os, w, h, lang || null,
      geo.country, geo.region, geo.city, ipHash, geo.asnOrg, userId,
    ]
  );
  await platformPool.query(
    `UPDATE analytics_visitors SET sessions_count = sessions_count + 1 WHERE id = $1`,
    [visitorId]
  );
  return { id: rows[0].id, isNew: true };
}

// Domena referrera; wejścia z własnych domen (landing↔app) nie są źródłem zewnętrznym.
export function referrerDomain(referrer) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const base = config.APP_DOMAIN.toLowerCase();
    if (host === base || host.endsWith(`.${base}`)) return null;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Powiązanie odwiedzającego z zalogowanym użytkownikiem (idempotentne).
export async function linkIdentity({ visitorId, tenantId, userId, email, displayName, role }) {
  await platformPool.query(
    `INSERT INTO analytics_visitor_identities
       (visitor_id, tenant_id, user_id, email, display_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (visitor_id, tenant_id, user_id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = COALESCE(EXCLUDED.display_name, analytics_visitor_identities.display_name),
       role = COALESCE(EXCLUDED.role, analytics_visitor_identities.role),
       identified_at = NOW()`,
    [visitorId, tenantId, userId, email || null, displayName || null, role || null]
  );
}

// Uzupełnij rDNS po fakcie (fire-and-forget z routes.js — nie blokuje odpowiedzi).
export async function attachRdns({ visitorId, sessionId, host }) {
  if (!host) return;
  await platformPool.query(
    `UPDATE analytics_sessions SET rdns_host = $1 WHERE id = $2 AND rdns_host IS NULL`,
    [host, sessionId]
  );
  await platformPool.query(
    `UPDATE analytics_visitors
        SET rdns_host = $1,
            org_source = COALESCE(org_source, 'rdns')
      WHERE id = $2 AND rdns_host IS NULL`,
    [host, visitorId]
  );
}
