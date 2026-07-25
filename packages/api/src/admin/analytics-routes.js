// API analityki dla panelu admina (/api/admin/analytics/*).
//
// Odczyty: przegląd i realtime liczone z surowych sesji/zdarzeń (zawsze
// aktualne, ruch jest umiarkowany, indeksy po czasie); rankingi (strony,
// źródła, geo, urządzenia) z rollupów dziennych (odświeżane co 10 min
// przez workera). Wszystko za requireAdmin.
import { platformPool } from '../db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_DAYS = 366;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dayISO, n) => iso(new Date(new Date(`${dayISO}T00:00:00Z`).getTime() + n * 86_400_000));

// Wspólne filtry: ?from=YYYY-MM-DD&to=YYYY-MM-DD&site=landing|app&tenantId=uuid
function parseFilters(req) {
  const q = req.query || {};
  const today = iso(new Date());
  let from = DATE_RE.test(q.from || '') ? q.from : addDays(today, -29);
  let to = DATE_RE.test(q.to || '') ? q.to : today;
  if (from > to) [from, to] = [to, from];
  const days = Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  const site = q.site === 'landing' || q.site === 'app' ? q.site : null;
  const tenantId = UUID_RE.test(q.tenantId || '') ? q.tenantId : null;
  return { from, to, days: Math.min(days, MAX_RANGE_DAYS), site, tenantId };
}

// WHERE dla surowych sesji/zdarzeń ($1=from, $2=to zawsze zajęte).
function rawWhere({ site, tenantId }, timeCol) {
  const cond = [`${timeCol} >= $1::date`, `${timeCol} < $2::date + 1`];
  const params = [];
  let i = 2;
  if (site) { cond.push(`site = $${++i}`); params.push(site); }
  if (tenantId) { cond.push(`tenant_id = $${++i}`); params.push(tenantId); }
  return { cond: cond.join(' AND '), params };
}

// WHERE dla tabel dziennych.
function dailyWhere({ site, tenantId }) {
  const cond = ['day >= $1::date', 'day <= $2::date'];
  const params = [];
  let i = 2;
  if (site) { cond.push(`site = $${++i}`); params.push(site); }
  if (tenantId) { cond.push(`tenant_id = $${++i}`); params.push(tenantId); }
  return { cond: cond.join(' AND '), params };
}

async function kpiForRange(from, to, f) {
  const { cond, params } = rawWhere(f, 'started_at');
  const { rows } = await platformPool.query(
    `SELECT COUNT(DISTINCT visitor_id)::int AS visitors,
            COUNT(*)::int AS sessions,
            COALESCE(SUM(pageviews), 0)::int AS pageviews,
            COUNT(*) FILTER (WHERE pageviews <= 1)::int AS bounces,
            COALESCE(SUM(COALESCE(duration_seconds,
              GREATEST(EXTRACT(EPOCH FROM last_activity_at - started_at)::int, 0))), 0)::bigint AS duration_s
       FROM analytics_sessions WHERE ${cond} AND NOT is_bot`,
    [from, to, ...params]
  );
  const r = rows[0];
  return {
    visitors: r.visitors,
    sessions: r.sessions,
    pageviews: r.pageviews,
    avgDurationS: r.sessions ? Math.round(Number(r.duration_s) / r.sessions) : 0,
    bounceRate: r.sessions ? Math.round((r.bounces / r.sessions) * 100) : 0,
  };
}

async function onlineNow(f) {
  const cond = [`created_at > NOW() - interval '5 minutes'`];
  const params = [];
  let i = 0;
  if (f.site) { cond.push(`site = $${++i}`); params.push(f.site); }
  if (f.tenantId) { cond.push(`tenant_id = $${++i}`); params.push(f.tenantId); }
  const { rows } = await platformPool.query(
    `SELECT COUNT(DISTINCT visitor_id)::int AS n FROM analytics_events WHERE ${cond.join(' AND ')}`,
    params
  );
  return rows[0].n;
}

export default async function adminAnalyticsRoutes(app) {
  const opts = { preHandler: app.requireAdmin };

  // ── PRZEGLĄD: KPI + porównanie z poprzednim okresem + seria dzienna ──
  app.get('/api/admin/analytics/overview', opts, async (req, reply) => {
    const f = parseFilters(req);
    const prevTo = addDays(f.from, -1);
    const prevFrom = addDays(prevTo, -(f.days - 1));
    const { cond, params } = rawWhere(f, 'started_at');
    const [kpi, prev, series, online] = await Promise.all([
      kpiForRange(f.from, f.to, f),
      kpiForRange(prevFrom, prevTo, f),
      platformPool.query(
        `SELECT started_at::date AS day,
                COUNT(DISTINCT visitor_id)::int AS visitors,
                COUNT(*)::int AS sessions,
                COALESCE(SUM(pageviews), 0)::int AS pageviews
           FROM analytics_sessions WHERE ${cond} AND NOT is_bot
          GROUP BY 1 ORDER BY 1`,
        [f.from, f.to, ...params]
      ),
      onlineNow(f),
    ]);
    return reply.send({ filters: f, kpi: { ...kpi, onlineNow: online }, prev, series: series.rows });
  });

  // ── REALTIME: kto jest teraz na stronie/w aplikacji ──────────────────
  app.get('/api/admin/analytics/realtime', opts, async (req, reply) => {
    const f = parseFilters(req);
    const cond = [`e.created_at > NOW() - interval '5 minutes'`];
    const params = [];
    let i = 0;
    if (f.site) { cond.push(`e.site = $${++i}`); params.push(f.site); }
    if (f.tenantId) { cond.push(`e.tenant_id = $${++i}`); params.push(f.tenantId); }
    const { rows } = await platformPool.query(
      `SELECT DISTINCT ON (e.visitor_id)
              e.visitor_id AS "visitorId", e.path, e.site, e.created_at AS "lastSeenAt",
              v.country, v.city, v.device_type AS "deviceType", v.asn_org AS "orgName",
              t.name AS "tenantName",
              ident.email AS "userEmail", ident.display_name AS "userName"
         FROM analytics_events e
         JOIN analytics_visitors v ON v.id = e.visitor_id
         LEFT JOIN tenants t ON t.id = e.tenant_id
         LEFT JOIN LATERAL (
           SELECT email, display_name FROM analytics_visitor_identities x
            WHERE x.visitor_id = e.visitor_id ORDER BY identified_at DESC LIMIT 1
         ) ident ON true
        WHERE ${cond.join(' AND ')}
        ORDER BY e.visitor_id, e.created_at DESC`,
      params
    );
    rows.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
    return reply.send({ onlineNow: rows.length, active: rows.slice(0, 50) });
  });

  // ── ŹRÓDŁA: referrery + UTM (z rollupów) ─────────────────────────────
  app.get('/api/admin/analytics/sources', opts, async (req, reply) => {
    const f = parseFilters(req);
    const { cond, params } = dailyWhere(f);
    const base = [f.from, f.to, ...params];
    const top = (col) => platformPool.query(
      `SELECT ${col} AS name, SUM(sessions)::int AS sessions, SUM(visitors)::int AS visitors
         FROM analytics_daily_sources WHERE ${cond} AND ${col} IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 30`,
      base
    );
    const [referrers, utmSources, utmMediums, utmCampaigns, direct] = await Promise.all([
      top('referrer_domain'), top('utm_source'), top('utm_medium'), top('utm_campaign'),
      platformPool.query(
        `SELECT SUM(sessions)::int AS sessions FROM analytics_daily_sources
          WHERE ${cond} AND referrer_domain IS NULL AND utm_source IS NULL`,
        base
      ),
    ]);
    return reply.send({
      referrers: referrers.rows,
      utmSources: utmSources.rows,
      utmMediums: utmMediums.rows,
      utmCampaigns: utmCampaigns.rows,
      directSessions: direct.rows[0]?.sessions || 0,
    });
  });

  // ── STRONY: ranking ścieżek (z rollupów) ─────────────────────────────
  app.get('/api/admin/analytics/pages', opts, async (req, reply) => {
    const f = parseFilters(req);
    const { cond, params } = dailyWhere(f);
    const { rows } = await platformPool.query(
      `SELECT path,
              SUM(pageviews)::int AS pageviews,
              SUM(visitors)::int AS visitors,
              SUM(entries)::int AS entries,
              SUM(exits)::int AS exits,
              CASE WHEN SUM(pageviews) > 0
                   THEN (SUM(total_duration_s) / SUM(pageviews))::int ELSE 0 END AS "avgDurationS"
         FROM analytics_daily_pages WHERE ${cond}
        GROUP BY path ORDER BY 2 DESC LIMIT 100`,
      [f.from, f.to, ...params]
    );
    return reply.send({ pages: rows });
  });

  // ── GEOGRAFIA (z rollupów) ───────────────────────────────────────────
  app.get('/api/admin/analytics/geo', opts, async (req, reply) => {
    const f = parseFilters(req);
    const { cond, params } = dailyWhere(f);
    const base = [f.from, f.to, ...params];
    const [countries, cities] = await Promise.all([
      platformPool.query(
        `SELECT country, SUM(sessions)::int AS sessions, SUM(visitors)::int AS visitors
           FROM analytics_daily_geo WHERE ${cond} AND country IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC LIMIT 50`, base),
      platformPool.query(
        `SELECT country, city, SUM(sessions)::int AS sessions, SUM(visitors)::int AS visitors
           FROM analytics_daily_geo WHERE ${cond} AND city IS NOT NULL
          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50`, base),
    ]);
    return reply.send({ countries: countries.rows, cities: cities.rows });
  });

  // ── URZĄDZENIA (z rollupów) ──────────────────────────────────────────
  app.get('/api/admin/analytics/devices', opts, async (req, reply) => {
    const f = parseFilters(req);
    const { cond, params } = dailyWhere(f);
    const base = [f.from, f.to, ...params];
    const top = (col) => platformPool.query(
      `SELECT ${col} AS name, SUM(sessions)::int AS sessions, SUM(visitors)::int AS visitors
         FROM analytics_daily_devices WHERE ${cond} AND ${col} IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      base
    );
    const [deviceTypes, browsers, os] = await Promise.all([top('device_type'), top('browser'), top('os')]);
    return reply.send({ deviceTypes: deviceTypes.rows, browsers: browsers.rows, os: os.rows });
  });

  // ── ODWIEDZAJĄCY: feed w stylu bazo.io ───────────────────────────────
  app.get('/api/admin/analytics/visitors', opts, async (req, reply) => {
    const f = parseFilters(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 50;
    const q = String(req.query.q || '').trim().slice(0, 100);

    const cond = ['NOT v.is_bot', 'v.last_seen >= $1::date', 'v.last_seen < $2::date + 1'];
    const params = [f.from, f.to];
    let i = 2;
    if (f.site) { cond.push(`v.site = $${++i}`); params.push(f.site); }
    if (f.tenantId) {
      cond.push(`EXISTS (SELECT 1 FROM analytics_sessions s WHERE s.visitor_id = v.id AND s.tenant_id = $${++i})`);
      params.push(f.tenantId);
    }
    if (q) {
      cond.push(`(
        v.asn_org ILIKE $${++i} OR v.rdns_host ILIKE $${i} OR v.city ILIKE $${i}
        OR EXISTS (SELECT 1 FROM analytics_visitor_identities x
                    WHERE x.visitor_id = v.id AND (x.email ILIKE $${i} OR x.display_name ILIKE $${i}))
      )`);
      params.push(`%${q}%`);
    }
    const where = cond.join(' AND ');

    const [total, list] = await Promise.all([
      platformPool.query(`SELECT COUNT(*)::int AS n FROM analytics_visitors v WHERE ${where}`, params),
      platformPool.query(
        `SELECT v.id, v.site, v.first_seen AS "firstSeen", v.last_seen AS "lastSeen",
                v.country, v.city, v.device_type AS "deviceType", v.browser, v.os,
                v.asn_org AS "orgName", v.rdns_host AS "rdnsHost", v.org_source AS "orgSource",
                v.sessions_count AS "sessionsCount", v.pageviews_count AS "pageviewsCount",
                ident.email AS "userEmail", ident.display_name AS "userName", t.name AS "tenantName",
                lastev.path AS "lastPath"
           FROM analytics_visitors v
           LEFT JOIN LATERAL (
             SELECT email, display_name, tenant_id FROM analytics_visitor_identities x
              WHERE x.visitor_id = v.id ORDER BY identified_at DESC LIMIT 1
           ) ident ON true
           LEFT JOIN tenants t ON t.id = ident.tenant_id
           LEFT JOIN LATERAL (
             SELECT path FROM analytics_events e
              WHERE e.visitor_id = v.id AND e.path IS NOT NULL
              ORDER BY e.created_at DESC LIMIT 1
           ) lastev ON true
          WHERE ${where}
          ORDER BY v.last_seen DESC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params
      ),
    ]);
    return reply.send({ total: total.rows[0].n, page, pageSize, visitors: list.rows });
  });

  // ── ODWIEDZAJĄCY: pełna oś czasu ─────────────────────────────────────
  app.get('/api/admin/analytics/visitors/:id', opts, async (req, reply) => {
    const id = String(req.params.id || '');
    if (!UUID_RE.test(id)) return reply.code(400).send({ error: 'Nieprawidłowe id' });
    const { rows: vrows } = await platformPool.query(
      `SELECT v.*, v.device_type AS "deviceType", v.asn_org AS "orgName", v.rdns_host AS "rdnsHost"
         FROM analytics_visitors v WHERE v.id = $1`, [id]);
    if (!vrows[0]) return reply.code(404).send({ error: 'Odwiedzający nie istnieje' });

    const [identities, sessions] = await Promise.all([
      platformPool.query(
        `SELECT x.email, x.display_name AS "displayName", x.role, x.identified_at AS "identifiedAt",
                t.name AS "tenantName", t.subdomain
           FROM analytics_visitor_identities x
           LEFT JOIN tenants t ON t.id = x.tenant_id
          WHERE x.visitor_id = $1 ORDER BY x.identified_at DESC`, [id]),
      platformPool.query(
        `SELECT s.id, s.site, s.started_at AS "startedAt", s.last_activity_at AS "lastActivityAt",
                s.entry_path AS "entryPath", s.exit_path AS "exitPath",
                s.referrer_domain AS "referrerDomain", s.utm_source AS "utmSource",
                s.device_type AS "deviceType", s.browser, s.os, s.country, s.city,
                s.pageviews, s.duration_seconds AS "durationSeconds", t.name AS "tenantName"
           FROM analytics_sessions s
           LEFT JOIN tenants t ON t.id = s.tenant_id
          WHERE s.visitor_id = $1
          ORDER BY s.started_at DESC LIMIT 50`, [id]),
    ]);

    // Zdarzenia dla pobranych sesji (limit chroni przed gigantycznymi odpowiedziami).
    const sessionIds = sessions.rows.map((s) => s.id);
    let events = [];
    if (sessionIds.length) {
      const { rows } = await platformPool.query(
        `SELECT session_id AS "sessionId", name, path, page_title AS "pageTitle",
                duration_ms AS "durationMs", props, created_at AS "createdAt"
           FROM analytics_events WHERE session_id = ANY($1)
          ORDER BY created_at ASC LIMIT 1000`, [sessionIds]);
      events = rows;
    }
    const bySession = new Map(sessions.rows.map((s) => [s.id, { ...s, events: [] }]));
    for (const e of events) bySession.get(e.sessionId)?.events.push(e);

    return reply.send({
      visitor: vrows[0],
      identities: identities.rows,
      sessions: [...bySession.values()],
    });
  });

  // ── KOŚCIOŁY: kto z czego korzysta ("kto co kiedy" per tenant) ───────
  app.get('/api/admin/analytics/tenants', opts, async (req, reply) => {
    const f = parseFilters(req);
    const [stats, modules] = await Promise.all([
      platformPool.query(
        `SELECT t.id AS "tenantId", t.name, t.subdomain, t.status,
                COUNT(s.id)::int AS sessions,
                COALESCE(SUM(s.pageviews), 0)::int AS pageviews,
                COUNT(DISTINCT s.user_id) FILTER (WHERE s.user_id IS NOT NULL)::int AS "activeUsers",
                MAX(s.last_activity_at) AS "lastActivityAt"
           FROM tenants t
           LEFT JOIN analytics_sessions s
             ON s.tenant_id = t.id AND s.started_at >= $1::date AND s.started_at < $2::date + 1
                AND NOT s.is_bot
          GROUP BY t.id ORDER BY sessions DESC, t.name`,
        [f.from, f.to]
      ),
      platformPool.query(
        `SELECT tenant_id AS "tenantId", props->>'module' AS module, COUNT(*)::int AS n
           FROM analytics_events
          WHERE name = 'module_open' AND tenant_id IS NOT NULL
            AND created_at >= $1::date AND created_at < $2::date + 1
            AND props->>'module' IS NOT NULL
          GROUP BY 1, 2 ORDER BY 3 DESC`,
        [f.from, f.to]
      ),
    ]);
    const topByTenant = new Map();
    for (const m of modules.rows) {
      const list = topByTenant.get(m.tenantId) || [];
      if (list.length < 3) { list.push({ module: m.module, n: m.n }); topByTenant.set(m.tenantId, list); }
    }
    return reply.send({
      tenants: stats.rows.map((t) => ({ ...t, topModules: topByTenant.get(t.tenantId) || [] })),
    });
  });
}
