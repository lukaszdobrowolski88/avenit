// Publiczny endpoint ingestii analityki: POST /api/track.
//
// Zbiera zdarzenia z landingu (avenit.pl, cookieless) i aplikacji tenantów
// (*.avenit.pl, UUID w localStorage). Zawsze odpowiada 204 — analityka nigdy
// nie może psuć UX-u ani zdradzać botom, co zostało odfiltrowane.
//
// Tożsamość zalogowanego użytkownika bierzemy WYŁĄCZNIE z cookie/Bearer po
// stronie serwera (weryfikacja JWT) — klient nie może podszyć się pod innego
// użytkownika ani kościół. Drabinka identyfikacji (styl bazo.io):
//   1. zalogowany użytkownik (dokładna tożsamość + kościół),
//   2. tenant z subdomeny (konkretny kościół, nawet bez logowania),
//   3. organizacja z ASN (czyje łącze), 4. reverse DNS.
import { z } from 'zod';
import { platformPool } from '../db.js';
import { verifyAccessToken, AUD_TENANT } from '../auth/tokens.js';
import { lookupIp, reverseDns, parseUa, isBotUa } from './enrich.js';
import {
  hashIp, getDailySalt, landingVisitorKey,
  findOrCreateVisitor, findOrCreateSession, linkIdentity, attachRdns,
} from './sessions.js';

const eventSchema = z.object({
  n: z.string().min(1).max(40),              // nazwa: pageview|leave|click|identify|login|module_open|...
  path: z.string().max(512).optional(),
  title: z.string().max(256).optional(),
  ref: z.string().max(1024).optional(),
  dur: z.number().int().min(0).max(86_400_000).optional(), // ms widoczności (event 'leave')
  props: z.record(z.any()).optional(),
});

const trackSchema = z.object({
  v: z.literal(1),
  site: z.enum(['landing', 'app']),
  vid: z.string().uuid().nullish(),          // tylko app; landing jest cookieless
  scr: z.string().max(12).optional(),        // "1440x900"
  lang: z.string().max(16).optional(),
  utm: z.object({
    source: z.string().max(100), medium: z.string().max(100), campaign: z.string().max(100),
    term: z.string().max(100), content: z.string().max(100),
  }).partial().optional(),
  events: z.array(eventSchema).min(1).max(20),
});

const propsJson = (props) => {
  if (!props) return null;
  const s = JSON.stringify(props);
  return s.length > 2000 ? null : s; // za duże propsy odpadają w całości (nie tniemy JSON-a)
};

async function verifiedUser(req) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.cookies?.avenit_at;
  if (!token) return null;
  try {
    const p = await verifyAccessToken(token, AUD_TENANT);
    // Cookie z innego tenanta (np. stara sesja) → traktuj jak anonima.
    if (req.tenant && p.ten !== req.tenant.slug && p.ten !== req.tenant.subdomain) return null;
    return { id: p.sub, email: p.email || null, role: p.role || null };
  } catch {
    return null;
  }
}

async function ingest(req) {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) return;
  const body = parsed.data;

  const ua = String(req.headers['user-agent'] || '');
  if (isBotUa(ua)) return;

  const ip = req.ip || '';
  const tenantId = req.tenant?.id || null;
  const user = await verifiedUser(req);
  const uaParsed = parseUa(ua);
  const geo = await lookupIp(ip);

  // Klucz odwiedzającego: app → UUID klienta; landing (i app bez UUID) → dzienny hash.
  let key;
  if (body.site === 'app' && body.vid) {
    key = body.vid;
  } else {
    key = landingVisitorKey(await getDailySalt(), ip, ua);
  }

  const firstPage = body.events.find((e) => e.n === 'pageview') || body.events[0];
  const visitor = await findOrCreateVisitor({
    key,
    site: body.site,
    referrer: firstPage.ref || null,
    utm: body.utm || null,
    ua: uaParsed,
    geo,
  });

  const session = await findOrCreateSession({
    visitorId: visitor.id,
    site: body.site,
    tenantId,
    userId: user?.id || null,
    entry: { path: firstPage.path, referrer: firstPage.ref, utm: body.utm },
    ua: uaParsed,
    geo,
    ipHash: hashIp(ip),
    scr: body.scr,
    lang: body.lang,
  });

  // rDNS nie blokuje odpowiedzi — dociera do wiersza po fakcie.
  if (session.isNew) {
    reverseDns(ip)
      .then((host) => attachRdns({ visitorId: visitor.id, sessionId: session.id, host }))
      .catch(() => {});
  }

  // Zdarzenia jednym INSERT-em.
  const cols = [];
  const params = [];
  let i = 0;
  for (const e of body.events) {
    cols.push(`($${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i}, $${++i})`);
    params.push(
      session.id, visitor.id, body.site, tenantId, e.n,
      e.path || null, e.title || null, e.ref || null,
      e.dur ?? null, user?.id || null, propsJson(e.props)
    );
  }
  await platformPool.query(
    `INSERT INTO analytics_events
       (session_id, visitor_id, site, tenant_id, name, path, page_title, referrer, duration_ms, user_id, props)
     VALUES ${cols.join(', ')}`,
    params
  );

  const pageviews = body.events.filter((e) => e.n === 'pageview').length;
  const lastPv = [...body.events].reverse().find((e) => e.n === 'pageview');
  const leaveMs = body.events.filter((e) => e.n === 'leave').reduce((s, e) => s + (e.dur || 0), 0);

  await platformPool.query(
    `UPDATE analytics_sessions SET
       last_activity_at = NOW(),
       pageviews = pageviews + $2,
       events = events + $3,
       exit_path = COALESCE($4, exit_path),
       -- czas tylko z realnych eventów 'leave'; inaczej NULL → domknie go worker
       duration_seconds = CASE WHEN $5 > 0 THEN COALESCE(duration_seconds, 0) + $5
                               ELSE duration_seconds END,
       user_id = COALESCE(user_id, $6)
     WHERE id = $1`,
    [session.id, pageviews, body.events.length, lastPv?.path || null, Math.round(leaveMs / 1000), user?.id || null]
  );
  if (pageviews > 0) {
    await platformPool.query(
      `UPDATE analytics_visitors SET pageviews_count = pageviews_count + $2, last_seen = NOW() WHERE id = $1`,
      [visitor.id, pageviews]
    );
  }

  // Powiązanie tożsamości (dokładna identyfikacja "kto") — tylko zweryfikowany user.
  if (user && tenantId) {
    const identifyEvent = body.events.find((e) => e.n === 'identify');
    await linkIdentity({
      visitorId: visitor.id,
      tenantId,
      userId: user.id,
      email: user.email,
      displayName: typeof identifyEvent?.props?.name === 'string'
        ? identifyEvent.props.name.slice(0, 255) : null,
      role: user.role,
    });
  }
}

export default async function analyticsRoutes(app) {
  app.post(
    '/api/track',
    // Limit luźny: całe zbory potrafią siedzieć za jednym NAT-em.
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      try {
        await ingest(req);
      } catch (err) {
        req.log.warn({ err }, 'track: błąd ingestii');
      }
      return reply.code(204).send();
    }
  );
}
