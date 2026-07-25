// Agregacja analityki (worker): rollupy dzienne, domykanie sesji, retencja.
//
// Rollup dnia = DELETE dnia + INSERT...SELECT w jednej transakcji — idempotentny
// recompute (można odpalać wielokrotnie; nigdy nie dubluje liczb). Dzień liczony
// w strefie serwera (UTC w prod) — spójnie między rollupem a odczytami admina.
import { config } from '../config.js';

const DAILY_TABLES = [
  'analytics_daily_site',
  'analytics_daily_pages',
  'analytics_daily_sources',
  'analytics_daily_geo',
  'analytics_daily_devices',
];

export async function rollupDay(pool, dayISO) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of DAILY_TABLES) {
      await client.query(`DELETE FROM ${t} WHERE day = $1`, [dayISO]);
    }

    // Ruch per site/tenant. Czas sesji: zsumowany z eventów 'leave' albo
    // (sesje bez 'leave' — apka SPA) różnica ostatnia aktywność − start.
    await client.query(
      `INSERT INTO analytics_daily_site
         (day, site, tenant_id, visitors, sessions, pageviews, bounces, total_duration_s)
       SELECT $1::date, site, tenant_id,
              COUNT(DISTINCT visitor_id),
              COUNT(*),
              COALESCE(SUM(pageviews), 0),
              COUNT(*) FILTER (WHERE pageviews <= 1),
              COALESCE(SUM(COALESCE(duration_seconds,
                GREATEST(EXTRACT(EPOCH FROM last_activity_at - started_at)::int, 0))), 0)
         FROM analytics_sessions
        WHERE started_at >= $1::date AND started_at < $1::date + 1 AND NOT is_bot
        GROUP BY site, tenant_id`,
      [dayISO]
    );

    await client.query(
      `INSERT INTO analytics_daily_pages
         (day, site, tenant_id, path, pageviews, visitors, entries, exits, total_duration_s)
       SELECT $1::date, site, tenant_id, path,
              COUNT(*) FILTER (WHERE name = 'pageview'),
              COUNT(DISTINCT visitor_id),
              0, 0,
              COALESCE(SUM(duration_ms) FILTER (WHERE name = 'leave') / 1000, 0)
         FROM analytics_events
        WHERE created_at >= $1::date AND created_at < $1::date + 1
          AND name IN ('pageview', 'leave') AND path IS NOT NULL
        GROUP BY site, tenant_id, path`,
      [dayISO]
    );
    // Wejścia/wyjścia dopisywane z sesji (entry_path/exit_path).
    await client.query(
      `UPDATE analytics_daily_pages p SET entries = s.n
         FROM (SELECT site, tenant_id, entry_path AS path, COUNT(*) AS n
                 FROM analytics_sessions
                WHERE started_at >= $1::date AND started_at < $1::date + 1
                  AND entry_path IS NOT NULL AND NOT is_bot
                GROUP BY site, tenant_id, entry_path) s
        WHERE p.day = $1::date AND p.site = s.site AND p.path = s.path
          AND p.tenant_id IS NOT DISTINCT FROM s.tenant_id`,
      [dayISO]
    );
    await client.query(
      `UPDATE analytics_daily_pages p SET exits = s.n
         FROM (SELECT site, tenant_id, exit_path AS path, COUNT(*) AS n
                 FROM analytics_sessions
                WHERE started_at >= $1::date AND started_at < $1::date + 1
                  AND exit_path IS NOT NULL AND NOT is_bot
                GROUP BY site, tenant_id, exit_path) s
        WHERE p.day = $1::date AND p.site = s.site AND p.path = s.path
          AND p.tenant_id IS NOT DISTINCT FROM s.tenant_id`,
      [dayISO]
    );

    // Źródła: NULL-e w komplecie = ruch bezpośredni (UI pokaże "Bezpośrednie").
    await client.query(
      `INSERT INTO analytics_daily_sources
         (day, site, tenant_id, referrer_domain, utm_source, utm_medium, utm_campaign, sessions, visitors)
       SELECT $1::date, site, tenant_id, referrer_domain, utm_source, utm_medium, utm_campaign,
              COUNT(*), COUNT(DISTINCT visitor_id)
         FROM analytics_sessions
        WHERE started_at >= $1::date AND started_at < $1::date + 1 AND NOT is_bot
        GROUP BY site, tenant_id, referrer_domain, utm_source, utm_medium, utm_campaign`,
      [dayISO]
    );

    await client.query(
      `INSERT INTO analytics_daily_geo (day, site, tenant_id, country, city, sessions, visitors)
       SELECT $1::date, site, tenant_id, country, city, COUNT(*), COUNT(DISTINCT visitor_id)
         FROM analytics_sessions
        WHERE started_at >= $1::date AND started_at < $1::date + 1 AND NOT is_bot
        GROUP BY site, tenant_id, country, city`,
      [dayISO]
    );

    await client.query(
      `INSERT INTO analytics_daily_devices
         (day, site, tenant_id, device_type, browser, os, sessions, visitors)
       SELECT $1::date, site, tenant_id, device_type, browser, os, COUNT(*), COUNT(DISTINCT visitor_id)
         FROM analytics_sessions
        WHERE started_at >= $1::date AND started_at < $1::date + 1 AND NOT is_bot
        GROUP BY site, tenant_id, device_type, browser, os`,
      [dayISO]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Sesje bez eventu 'leave' (apka, porzucone karty): po 30 min nieaktywności
// czas = ostatnia aktywność − start, wyjście = wejście gdy nieznane.
export async function closeStaleSessions(pool) {
  await pool.query(
    `UPDATE analytics_sessions
        SET duration_seconds = GREATEST(EXTRACT(EPOCH FROM last_activity_at - started_at)::int, 0),
            exit_path = COALESCE(exit_path, entry_path)
      WHERE duration_seconds IS NULL
        AND last_activity_at < NOW() - interval '30 minutes'`
  );
}

// Retencja surowych danych (RODO): rollupy zostają bezterminowo.
export async function runRetention(pool) {
  const days = config.ANALYTICS_RAW_RETENTION_DAYS;
  await pool.query(`DELETE FROM analytics_events WHERE created_at < NOW() - make_interval(days => $1)`, [days]);
  await pool.query(`DELETE FROM analytics_sessions WHERE started_at < NOW() - make_interval(days => $1)`, [days]);
  // Kaskada czyści też analytics_visitor_identities.
  await pool.query(`DELETE FROM analytics_visitors WHERE last_seen < NOW() - make_interval(days => $1)`, [days]);
  await pool.query(`DELETE FROM analytics_daily_salt WHERE day < CURRENT_DATE - 7`);
}

export const dayISO = (d = new Date()) => d.toISOString().slice(0, 10);
export const yesterdayISO = () => dayISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
