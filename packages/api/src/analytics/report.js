// Tygodniowy raport analityki e-mailem (worker, poniedziałek rano).
// Zakres: poprzedni pełny tydzień pon–niedz, porównanie z tygodniem wcześniej.
// Adresat: LANDING_CONTACT_EMAIL (właściciel platformy).
import { sendEmail } from '../lib/email.js';
import { config } from '../config.js';

const iso = (d) => d.toISOString().slice(0, 10);
const plDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

function lastFullWeek() {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // 0 = poniedziałek
  const monThis = new Date(now);
  monThis.setUTCDate(now.getUTCDate() - dow);
  const to = new Date(monThis); to.setUTCDate(monThis.getUTCDate() - 1);
  const from = new Date(monThis); from.setUTCDate(monThis.getUTCDate() - 7);
  const prevTo = new Date(from); prevTo.setUTCDate(from.getUTCDate() - 1);
  const prevFrom = new Date(from); prevFrom.setUTCDate(from.getUTCDate() - 7);
  return { from: iso(from), to: iso(to), prevFrom: iso(prevFrom), prevTo: iso(prevTo) };
}

async function siteKpi(pool, from, to) {
  const { rows } = await pool.query(
    `SELECT site, SUM(visitors)::int AS visitors, SUM(sessions)::int AS sessions,
            SUM(pageviews)::int AS pageviews
       FROM analytics_daily_site WHERE day >= $1::date AND day <= $2::date
      GROUP BY site`,
    [from, to]
  );
  const out = { landing: { visitors: 0, sessions: 0, pageviews: 0 }, app: { visitors: 0, sessions: 0, pageviews: 0 } };
  for (const r of rows) out[r.site] = { visitors: r.visitors, sessions: r.sessions, pageviews: r.pageviews };
  return out;
}

const delta = (now, prev) => {
  if (!prev) return '';
  const pct = Math.round(((now - prev) / prev) * 100);
  if (!isFinite(pct) || pct === 0) return ' (±0%)';
  return ` (${pct > 0 ? '+' : ''}${pct}%)`;
};

const rowsHtml = (rows, render) =>
  rows.length
    ? rows.map((r) => `<tr><td style="padding:4px 10px 4px 0;color:#334155">${render(r)}</td></tr>`).join('')
    : '<tr><td style="padding:4px 0;color:#94a3b8">brak danych</td></tr>';

export async function sendWeeklyReport(pool, { log = console.log } = {}) {
  const w = lastFullWeek();
  const [kpi, prev, pages, sources, leads, tenants] = await Promise.all([
    siteKpi(pool, w.from, w.to),
    siteKpi(pool, w.prevFrom, w.prevTo),
    pool.query(
      `SELECT path, SUM(pageviews)::int AS n FROM analytics_daily_pages
        WHERE day >= $1::date AND day <= $2::date AND site = 'landing'
        GROUP BY path ORDER BY n DESC LIMIT 5`, [w.from, w.to]),
    pool.query(
      `SELECT COALESCE(referrer_domain, utm_source) AS src, SUM(sessions)::int AS n
         FROM analytics_daily_sources
        WHERE day >= $1::date AND day <= $2::date AND site = 'landing'
          AND COALESCE(referrer_domain, utm_source) IS NOT NULL
        GROUP BY 1 ORDER BY n DESC LIMIT 5`, [w.from, w.to]),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM landing_leads
        WHERE created_at >= $1::date AND created_at < $2::date + 1`, [w.from, w.to]),
    pool.query(
      `SELECT t.name, COUNT(s.id)::int AS sessions,
              COUNT(DISTINCT s.user_id) FILTER (WHERE s.user_id IS NOT NULL)::int AS users
         FROM analytics_sessions s JOIN tenants t ON t.id = s.tenant_id
        WHERE s.started_at >= $1::date AND s.started_at < $2::date + 1 AND NOT s.is_bot
        GROUP BY t.name ORDER BY sessions DESC LIMIT 5`, [w.from, w.to]),
  ]);

  const period = `${plDate(w.from)} – ${plDate(w.to)}`;
  const h2 = 'margin:22px 0 8px;font-size:15px;color:#0f172a';
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <h1 style="font-size:20px;margin:0 0 4px">Avenit — raport tygodniowy</h1>
    <p style="margin:0 0 18px;color:#64748b">${period}</p>

    <h2 style="${h2}">Strona avenit.pl</h2>
    <p style="margin:0;color:#334155">
      Odwiedzający: <b>${kpi.landing.visitors}</b>${delta(kpi.landing.visitors, prev.landing.visitors)} ·
      Sesje: <b>${kpi.landing.sessions}</b>${delta(kpi.landing.sessions, prev.landing.sessions)} ·
      Odsłony: <b>${kpi.landing.pageviews}</b>${delta(kpi.landing.pageviews, prev.landing.pageviews)}<br/>
      Zgłoszenia z formularza: <b>${leads.rows[0].n}</b>
    </p>

    <h2 style="${h2}">Aplikacja (wszystkie kościoły)</h2>
    <p style="margin:0;color:#334155">
      Odwiedzający: <b>${kpi.app.visitors}</b>${delta(kpi.app.visitors, prev.app.visitors)} ·
      Sesje: <b>${kpi.app.sessions}</b>${delta(kpi.app.sessions, prev.app.sessions)} ·
      Odsłony: <b>${kpi.app.pageviews}</b>${delta(kpi.app.pageviews, prev.app.pageviews)}
    </p>

    <h2 style="${h2}">Najpopularniejsze strony (landing)</h2>
    <table style="border-collapse:collapse;font-size:14px">${rowsHtml(pages.rows, (r) => `${r.path} — <b>${r.n}</b>`)}</table>

    <h2 style="${h2}">Źródła ruchu</h2>
    <table style="border-collapse:collapse;font-size:14px">${rowsHtml(sources.rows, (r) => `${r.src} — <b>${r.n}</b> sesji`)}</table>

    <h2 style="${h2}">Najaktywniejsze kościoły</h2>
    <table style="border-collapse:collapse;font-size:14px">${rowsHtml(tenants.rows, (r) => `${r.name} — <b>${r.sessions}</b> sesji, ${r.users} użytk.`)}</table>

    <p style="margin:26px 0 0;font-size:13px;color:#94a3b8">
      Pełne dane: <a href="https://admin.${config.APP_DOMAIN}/analytics" style="color:#d97706">panel administracyjny → Analityka</a>
    </p>
  </div>`;

  await sendEmail({
    to: config.LANDING_CONTACT_EMAIL,
    subject: `Avenit — raport tygodniowy (${period})`,
    html,
  });
  log(`raport tygodniowy wysłany do ${config.LANDING_CONTACT_EMAIL} (${w.from}–${w.to})`);
}
