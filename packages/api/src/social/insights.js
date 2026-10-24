// Social Media — analityka (migracja 125). Worker social-insights (co 3 h):
//   • metryki opublikowanych publikacji z ostatnich 60 dni — świeże (do 3 dni) przy każdym przebiegu,
//     starsze raz na ~20 h; reakcje/komentarze/udostępnienia z pól obiektu (pages_read_engagement),
//     wyświetlenia i zasięg z /insights (read_insights / instagram_manage_insights). Brak zgody na
//     insights nie blokuje reszty — zapisujemy to, co się udało.
//   • obserwujący kanału — raz dziennie (social_account_stats).
// Nazwy metryk Meta zmieniają się (v25/v26: post_impressions_unique → post_total_media_view_unique,
// IG impressions → views) — o nieznaną metrykę pytamy pojedynczo i ją pomijamy.
import { graph, SocialError } from './meta.js';
import { decryptToken } from './accounts.js';

const FB_INSIGHTS = ['post_total_media_view_unique', 'post_media_view', 'post_clicks'];
const IG_INSIGHTS = ['views', 'reach', 'saved', 'shares', 'total_interactions'];
const BATCH = 80;
const num = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'object') return Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0);
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

async function fetchInsights(token, id, metrics) {
  const read = (out) => Object.fromEntries((out.data || []).map((d) => [d.name, num(d.values?.[0]?.value ?? d.total_value?.value)]));
  try {
    return read(await graph('GET', `/${id}/insights`, { token, params: { metric: metrics.join(',') } }));
  } catch (e) {
    if (e.tokenInvalid || e.retryable) throw e;
    if (e.code === 'permission') return {}; // brak zgody na insights — tylko pola obiektu
    const out = {};
    for (const m of metrics) {
      try { Object.assign(out, read(await graph('GET', `/${id}/insights`, { token, params: { metric: m } }))); } catch (err) {
        if (err.tokenInvalid || err.retryable) throw err;
      }
    }
    return out;
  }
}

export async function fetchTargetMetrics(account, token, externalId) {
  if (account.provider === 'instagram') {
    const obj = await graph('GET', `/${externalId}`, { token, params: { fields: 'like_count,comments_count' } });
    const ins = await fetchInsights(token, externalId, IG_INSIGHTS);
    const likes = num(obj.like_count) ?? 0;
    const comments = num(obj.comments_count) ?? 0;
    const shares = ins.shares ?? null;
    const saves = ins.saved ?? null;
    return {
      likes, comments, shares, saves, views: ins.views ?? null, reach: ins.reach ?? null, clicks: null,
      interactions: ins.total_interactions ?? (likes + comments + (shares || 0) + (saves || 0)), raw: { ...obj, insights: ins },
    };
  }
  const obj = await graph('GET', `/${externalId}`, {
    token, params: { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' },
  });
  const ins = await fetchInsights(token, externalId, FB_INSIGHTS);
  const likes = num(obj.reactions?.summary?.total_count) ?? 0;
  const comments = num(obj.comments?.summary?.total_count) ?? 0;
  const shares = num(obj.shares?.count) ?? 0;
  return {
    likes, comments, shares, saves: null, views: ins.post_media_view ?? null, reach: ins.post_total_media_view_unique ?? null,
    clicks: ins.post_clicks ?? null, interactions: likes + comments + shares, raw: { insights: ins },
  };
}

async function upsertMetrics(db, t, m) {
  await db.query(
    `INSERT INTO social_metrics (target_id, account_id, provider, likes, comments, shares, saves, views, reach, clicks, interactions, raw, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
     ON CONFLICT (target_id) DO UPDATE SET likes = EXCLUDED.likes, comments = EXCLUDED.comments, shares = EXCLUDED.shares,
       saves = EXCLUDED.saves, views = EXCLUDED.views, reach = EXCLUDED.reach, clicks = EXCLUDED.clicks,
       interactions = EXCLUDED.interactions, raw = EXCLUDED.raw, fetched_at = now()`,
    [t.id, t.account_id, t.provider, m.likes, m.comments, m.shares, m.saves, m.views, m.reach, m.clicks, m.interactions, JSON.stringify(m.raw || {})]);
}

async function tokensFor(db) {
  const { rows } = await db.query(`SELECT * FROM social_accounts WHERE status <> 'revoked'`);
  const out = new Map();
  for (const a of rows) {
    const token = await decryptToken(a.access_token_enc).catch(() => null);
    if (token) out.set(a.id, { account: a, token });
  }
  return out;
}

async function followersOf(account, token) {
  const r = await graph('GET', `/${account.external_id}`, { token, params: { fields: account.provider === 'instagram' ? 'followers_count' : 'followers_count,fan_count' } });
  return num(r.followers_count ?? r.fan_count);
}

export async function runInsights(ctx) {
  const stats = { metrics: 0, followers: 0, errors: 0 };
  const accounts = await tokensFor(ctx.db);
  if (!accounts.size) return stats;
  const { rows: due } = await ctx.db.query(
    `SELECT t.id, t.account_id, t.provider, t.external_id, t.published_at FROM social_post_targets t
       LEFT JOIN social_metrics m ON m.target_id = t.id
      WHERE t.status = 'published' AND t.external_id IS NOT NULL AND t.account_id IS NOT NULL
        AND t.published_at > now() - interval '60 days'
        AND (m.target_id IS NULL
             OR (t.published_at > now() - interval '3 days' AND m.fetched_at < now() - interval '2 hours')
             OR m.fetched_at < now() - interval '20 hours')
      ORDER BY m.fetched_at NULLS FIRST, t.published_at DESC LIMIT ${BATCH}`);
  for (const t of due) {
    const a = accounts.get(t.account_id);
    if (!a) continue;
    try {
      await upsertMetrics(ctx.db, t, await fetchTargetMetrics(a.account, a.token, t.external_id));
      stats.metrics += 1;
    } catch (e) {
      stats.errors += 1;
      if (!(e instanceof SocialError)) ctx.log?.error?.({ err: e }, 'social-insights: metryki');
    }
  }
  const { rows: haveToday } = await ctx.db.query(
    `SELECT account_id FROM social_account_stats WHERE day = (now() AT TIME ZONE 'Europe/Warsaw')::date`);
  const done = new Set(haveToday.map((r) => r.account_id));
  for (const { account, token } of accounts.values()) {
    if (done.has(account.id)) continue;
    try {
      const followers = await followersOf(account, token);
      await ctx.db.query(
        `INSERT INTO social_account_stats (account_id, day, followers) VALUES ($1, (now() AT TIME ZONE 'Europe/Warsaw')::date, $2)
         ON CONFLICT (account_id, day) DO UPDATE SET followers = EXCLUDED.followers`, [account.id, followers]);
      stats.followers += 1;
    } catch { stats.errors += 1; }
  }
  return stats;
}

// ── Podsumowanie dla zakładki Analityka ─────────────────────────────────────
const sumOf = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

export async function analyticsSummary(ctx, { days = 30, account_ids: accountIds = [] } = {}) {
  const d = Math.min(Math.max(parseInt(days, 10) || 30, 7), 365);
  const ids = (Array.isArray(accountIds) ? accountIds : []).filter((v) => /^[0-9a-f-]{36}$/i.test(String(v)));
  const accCond = ids.length ? 'AND t.account_id = ANY($2::uuid[])' : '';
  const params = ids.length ? [d, ids] : [d];
  const { rows: targets } = await ctx.db.query(
    `SELECT t.id, t.post_id, t.provider, t.account_id, t.account_name, t.permalink, t.published_at,
            m.likes, m.comments, m.shares, m.saves, m.views, m.reach, m.clicks, m.interactions
       FROM social_post_targets t LEFT JOIN social_metrics m ON m.target_id = t.id
      WHERE t.status = 'published' AND t.published_at > now() - ($1::int * interval '1 day') ${accCond}`, params);
  const postIds = [...new Set(targets.map((t) => t.post_id))];
  const { rows: linkRows } = postIds.length
    ? await ctx.db.query(`SELECT post_id, COALESCE(SUM(clicks), 0)::int AS clicks FROM social_links WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`, [postIds]).catch(() => ({ rows: [] }))
    : { rows: [] };
  const linkClicks = new Map(linkRows.map((r) => [r.post_id, r.clicks]));

  const totals = {
    posts: postIds.length, publications: targets.length,
    views: sumOf(targets, 'views'), reach: sumOf(targets, 'reach'), interactions: sumOf(targets, 'interactions'),
    likes: sumOf(targets, 'likes'), comments: sumOf(targets, 'comments'), shares: sumOf(targets, 'shares'), saves: sumOf(targets, 'saves'),
    link_clicks: [...linkClicks.values()].reduce((a, b) => a + b, 0),
    with_metrics: targets.filter((t) => t.interactions != null).length,
  };
  totals.avg_interactions = totals.with_metrics ? Math.round((totals.interactions / totals.with_metrics) * 10) / 10 : 0;

  // Tygodnie (poniedziałek, czas polski): interakcje i liczba publikacji.
  const { rows: weeks } = await ctx.db.query(
    `SELECT to_char(date_trunc('week', t.published_at AT TIME ZONE 'Europe/Warsaw'), 'YYYY-MM-DD') AS week,
            COUNT(*)::int AS publications, COALESCE(SUM(m.interactions), 0)::int AS interactions, COALESCE(SUM(m.views), 0)::int AS views
       FROM social_post_targets t LEFT JOIN social_metrics m ON m.target_id = t.id
      WHERE t.status = 'published' AND t.published_at > now() - ($1::int * interval '1 day') ${accCond}
      GROUP BY 1 ORDER BY 1`, params);

  // Najlepsze pory: dzień tygodnia (ISO) × przedział 3 h, średnie interakcje (ostatnie 180 dni).
  const { rows: slots } = await ctx.db.query(
    `SELECT EXTRACT(ISODOW FROM t.published_at AT TIME ZONE 'Europe/Warsaw')::int AS weekday,
            (EXTRACT(HOUR FROM t.published_at AT TIME ZONE 'Europe/Warsaw')::int / 3) AS bucket,
            COUNT(*)::int AS publications, ROUND(AVG(m.interactions)::numeric, 1)::float AS avg_interactions
       FROM social_post_targets t JOIN social_metrics m ON m.target_id = t.id
      WHERE t.status = 'published' AND t.published_at > now() - interval '180 days' AND m.interactions IS NOT NULL
        ${ids.length ? 'AND t.account_id = ANY($1::uuid[])' : ''}
      GROUP BY 1, 2`, ids.length ? [ids] : []);

  // Najlepsze posty okresu (suma interakcji ze wszystkich kanałów posta).
  const byPost = new Map();
  for (const t of targets) {
    const cur = byPost.get(t.post_id) || { post_id: t.post_id, interactions: 0, views: 0, reach: 0, targets: [] };
    cur.interactions += Number(t.interactions) || 0;
    cur.views += Number(t.views) || 0;
    cur.reach += Number(t.reach) || 0;
    cur.targets.push({ id: t.id, provider: t.provider, account_id: t.account_id, account_name: t.account_name, permalink: t.permalink,
      likes: t.likes, comments: t.comments, shares: t.shares, saves: t.saves, views: t.views, reach: t.reach, interactions: t.interactions });
    byPost.set(t.post_id, cur);
  }
  const top = [...byPost.values()].sort((a, b) => b.interactions - a.interactions).slice(0, 10);
  if (top.length) {
    const { rows: posts } = await ctx.db.query(`SELECT id, content, media, published_at FROM social_posts WHERE id = ANY($1::uuid[])`, [top.map((p) => p.post_id)]);
    const pm = new Map(posts.map((p) => [p.id, p]));
    for (const p of top) {
      const post = pm.get(p.post_id);
      Object.assign(p, { content: post?.content || '', media: post?.media || [], published_at: post?.published_at, link_clicks: linkClicks.get(p.post_id) || 0 });
    }
  }

  // Obserwujący: seria dzienna per kanał (okres) + zmiana.
  const { rows: fr } = await ctx.db.query(
    `SELECT account_id, to_char(day, 'YYYY-MM-DD') AS day, followers FROM social_account_stats
      WHERE day > (now() AT TIME ZONE 'Europe/Warsaw')::date - $1::int ${ids.length ? 'AND account_id = ANY($2::uuid[])' : ''}
      ORDER BY day`, params).catch(() => ({ rows: [] }));
  const followers = {};
  for (const r of fr) (followers[r.account_id] ||= []).push({ day: r.day, followers: r.followers });

  return { days: d, totals, weeks, slots, top, followers };
}

export async function targetMetrics(db, postId) {
  const { rows } = await db.query(
    `SELECT m.* FROM social_metrics m JOIN social_post_targets t ON t.id = m.target_id WHERE t.post_id = $1`, [postId]).catch(() => ({ rows: [] }));
  return rows;
}
