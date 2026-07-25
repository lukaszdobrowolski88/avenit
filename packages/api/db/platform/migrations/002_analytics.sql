-- Analityka first-party (panel admina): odwiedzający, sesje, zdarzenia + rollupy dzienne.
--
-- Jeden globalny magazyn w bazie platform (nie per-tenant): konsumentem jest panel
-- admina (zapytania cross-tenant), a landing nie ma bazy tenanta. Zakres wiersza
-- wyznaczają: site ('landing'|'app') oraz tenant_id (NULL dla landingu).
--
-- Prywatność: surowe IP nigdy nie trafia do bazy — tylko sha256(sekret+ip).
-- Landing jest cookieless: visitor_key = 'h:' + sha256(dzienna_sól+ip+ua),
-- sól rotowana codziennie i kasowana po 7 dniach (model Plausible).

-- ── ODWIEDZAJĄCY ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key TEXT UNIQUE NOT NULL,          -- app: UUID z localStorage; landing: 'h:'+hash
  site TEXT NOT NULL CHECK (site IN ('landing', 'app')),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_referrer TEXT,
  first_utm JSONB,
  device_type TEXT,                          -- ostatnio widziane urządzenie
  browser TEXT,
  os TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn_org TEXT,                              -- organizacja z bazy ASN (identyfikacja "czyje IP")
  rdns_host TEXT,                            -- reverse DNS
  org_source TEXT,                           -- 'asn' | 'rdns' | 'api' (slot pod płatne API)
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  sessions_count INT NOT NULL DEFAULT 0,     -- denormalizacja, aktualizowana przy sesji
  pageviews_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_visitors_last_seen ON analytics_visitors(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_an_visitors_site ON analytics_visitors(site, last_seen DESC);

-- Powiązanie odwiedzającego z tożsamością (po zalogowaniu w aplikacji).
CREATE TABLE IF NOT EXISTS analytics_visitor_identities (
  id BIGSERIAL PRIMARY KEY,
  visitor_id UUID NOT NULL REFERENCES analytics_visitors(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT,
  email TEXT,
  display_name TEXT,
  role TEXT,
  identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visitor_id, tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_an_identities_visitor ON analytics_visitor_identities(visitor_id);
CREATE INDEX IF NOT EXISTS idx_an_identities_tenant ON analytics_visitor_identities(tenant_id);

-- ── SESJE (30 min nieaktywności zamyka sesję) ────────────────────────
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES analytics_visitors(id) ON DELETE CASCADE,
  site TEXT NOT NULL CHECK (site IN ('landing', 'app')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry_path TEXT,
  exit_path TEXT,
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  device_type TEXT,                          -- 'desktop' | 'mobile' | 'tablet'
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  screen_w INT,
  screen_h INT,
  language TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  ip_hash TEXT,                              -- sha256(JWT_SECRET+ip) — dedup bez PII
  asn_org TEXT,
  rdns_host TEXT,
  user_id TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  pageviews INT NOT NULL DEFAULT 0,
  events INT NOT NULL DEFAULT 0,
  duration_seconds INT
);
CREATE INDEX IF NOT EXISTS idx_an_sessions_visitor ON analytics_sessions(visitor_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_sessions_site ON analytics_sessions(site, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_sessions_tenant ON analytics_sessions(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_sessions_open ON analytics_sessions(last_activity_at) WHERE duration_seconds IS NULL;

-- ── ZDARZENIA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  visitor_id UUID REFERENCES analytics_visitors(id) ON DELETE CASCADE,
  site TEXT NOT NULL CHECK (site IN ('landing', 'app')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- 'pageview'|'leave'|'click'|'identify'|'login'|'module_open'|...
  path TEXT,
  page_title TEXT,
  referrer TEXT,
  duration_ms INT,                           -- czas widoczności strony (event 'leave')
  user_id TEXT,
  props JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_an_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_events_site ON analytics_events(site, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_events_tenant ON analytics_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_an_events_visitor ON analytics_events(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_events_name ON analytics_events(name, created_at DESC);

-- ── DZIENNA SÓL (cookieless landing) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_daily_salt (
  day DATE PRIMARY KEY,
  salt TEXT NOT NULL
);

-- ── ROLLUPY DZIENNE ──────────────────────────────────────────────────
-- Strategia: rollup dnia = DELETE dnia + INSERT...SELECT (idempotentny recompute),
-- dlatego bez PRIMARY KEY (tenant_id bywa NULL); wystarczy indeks (day, site).
CREATE TABLE IF NOT EXISTS analytics_daily_site (
  day DATE NOT NULL,
  site TEXT NOT NULL,
  tenant_id UUID,
  visitors INT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 0,
  pageviews INT NOT NULL DEFAULT 0,
  bounces INT NOT NULL DEFAULT 0,            -- sesje z <=1 odsłoną
  total_duration_s BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_daily_site ON analytics_daily_site(day, site);

CREATE TABLE IF NOT EXISTS analytics_daily_pages (
  day DATE NOT NULL,
  site TEXT NOT NULL,
  tenant_id UUID,
  path TEXT NOT NULL,
  pageviews INT NOT NULL DEFAULT 0,
  visitors INT NOT NULL DEFAULT 0,
  entries INT NOT NULL DEFAULT 0,
  exits INT NOT NULL DEFAULT 0,
  total_duration_s BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_daily_pages ON analytics_daily_pages(day, site);

CREATE TABLE IF NOT EXISTS analytics_daily_sources (
  day DATE NOT NULL,
  site TEXT NOT NULL,
  tenant_id UUID,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  sessions INT NOT NULL DEFAULT 0,
  visitors INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_daily_sources ON analytics_daily_sources(day, site);

CREATE TABLE IF NOT EXISTS analytics_daily_geo (
  day DATE NOT NULL,
  site TEXT NOT NULL,
  tenant_id UUID,
  country TEXT,
  city TEXT,
  sessions INT NOT NULL DEFAULT 0,
  visitors INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_daily_geo ON analytics_daily_geo(day, site);

CREATE TABLE IF NOT EXISTS analytics_daily_devices (
  day DATE NOT NULL,
  site TEXT NOT NULL,
  tenant_id UUID,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  sessions INT NOT NULL DEFAULT 0,
  visitors INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_an_daily_devices ON analytics_daily_devices(day, site);
