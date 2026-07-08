// POST /api/db — pojedynczy endpoint zapytań (odpowiednik PostgREST dla klienta
// zgodnego z supabase-js). Autoryzacja per tabela/rola w registry.js.
import { buildQuery, buildWhere, ApiError, quoteIdent } from './querybuilder.js';
import { canAccess, getTableRule, invalidatePermissions } from './registry.js';
import { emitChange } from '../realtime/hub.js';
import { platformPool } from '../db.js';

// Cache modułów wyłączonych na poziomie platformy per tenant (60 s).
const disabledModulesCache = new Map(); // tenantId -> { set, at }
async function platformDisabledModules(tenantId) {
  const cached = disabledModulesCache.get(tenantId);
  if (cached && Date.now() - cached.at < 60_000) return cached.set;
  let set = new Set();
  try {
    const { rows } = await platformPool.query(
      `SELECT module_key FROM tenant_modules WHERE tenant_id = $1 AND is_enabled = false`,
      [tenantId]
    );
    set = new Set(rows.map((r) => r.module_key));
  } catch { /* brak tabeli/bazy — nic nie wyłączamy */ }
  disabledModulesCache.set(tenantId, { set, at: Date.now() });
  return set;
}

export default async function dataApiRoutes(app) {
  app.post('/api/db', { preHandler: app.requireUser }, async (req, reply) => {
    const q = req.body || {};
    try {
      const op = q.op === 'select' ? 'read' : 'write';
      const { rows: userRows } = await req.db.query(
        `SELECT is_super_admin FROM app_users WHERE id = $1`, [req.user.id]
      );
      const user = { ...req.user, is_super_admin: userRows[0]?.is_super_admin };

      const access = await canAccess({
        pool: req.db,
        dbName: req.tenant.db_name,
        table: q.table,
        op,
        user,
      });
      if (!access.ok) {
        // Wyjątek: własny profil w app_users (whitelist kolumn).
        if (!(await allowSelfUpdate(q, req))) {
          throw new ApiError(403, access.reason);
        }
      }

      // Wyczyść cache uprawnień przy zmianach macierzy.
      if (q.table === 'app_permissions' && op === 'write') {
        invalidatePermissions(req.tenant.db_name);
      }

      // head + count: tylko liczba wierszy.
      if (q.op === 'select' && q.head && q.count) {
        const rule = getTableRule(q.table);
        const params = [];
        const where = buildWhere(q.filters, params, 't', rule?.hiddenColumns || []);
        const { rows } = await req.db.query(
          `SELECT count(*)::int AS count FROM ${quoteIdent(q.table)} t${where}`,
          params
        );
        return reply.send({ data: [], count: rows[0].count });
      }

      const built = buildQuery(q);
      const result = await req.db.query(built.sql, built.params);
      let data = result.rows.map(unwrapRow);

      // Egzekwowanie modułów per tenant z poziomu platformy: moduł wyłączony
      // w panelu admina znika u tenanta niezależnie od lokalnego app_modules.
      if (q.op === 'select' && q.table === 'app_modules' && Array.isArray(data)) {
        const disabled = await platformDisabledModules(req.tenant.id);
        if (disabled.size) data = data.filter((m) => !disabled.has(m.key));
      }

      let count = null;
      if (q.op === 'select' && q.count) {
        const rule = getTableRule(q.table);
        const params = [];
        const where = buildWhere(q.filters, params, 't', rule?.hiddenColumns || []);
        const { rows } = await req.db.query(
          `SELECT count(*)::int AS count FROM ${quoteIdent(q.table)} t${where}`,
          params
        );
        count = rows[0].count;
      }

      // single/maybeSingle — semantyka supabase (błąd przy 0 lub >1 dla single).
      if (q.single) {
        if (data.length > 1) {
          throw new ApiError(406, 'Zapytanie zwróciło więcej niż jeden wiersz', 'PGRST116');
        }
        if (data.length === 0 && q.single !== 'maybe') {
          throw new ApiError(406, 'Zapytanie nie zwróciło wierszy', 'PGRST116');
        }
        data = data[0] ?? null;
      }

      // Realtime: powiadom subskrybentów o zmianach.
      if (q.op !== 'select') {
        emitChange(req.tenant.slug, q.table, q.op, Array.isArray(data) ? data : [data].filter(Boolean));
      }

      return reply.send({ data, count });
    } catch (err) {
      return sendError(reply, err, req);
    }
  });

  // ── RPC: dynamiczne DDL CustomModule (port funkcji z Supabase) ─────────
  // Bezpieczne w architekturze baza-per-tenant: DDL dotyka wyłącznie bazy tenanta.
  app.post('/api/rpc/:name', { preHandler: app.requireUser }, async (req, reply) => {
    const { name } = req.params;
    const args = req.body || {};
    try {
      const rpcs = await import('./rpc.js');
      const fn = rpcs.RPC_HANDLERS[name];
      if (!fn) throw new ApiError(404, `Nieznana funkcja RPC: ${name}`);
      const data = await fn(req.db, args, req);
      return reply.send({ data });
    } catch (err) {
      return sendError(reply, err, req);
    }
  });

  // ── Presence (odpowiednik raw PATCH user_presence z usePresence.js) ────
  // Tabela user_presence jest kluczowana po user_email (patrz usePresence.js).
  app.post('/api/presence', { preHandler: app.requireUser }, async (req, reply) => {
    const { status = 'online', last_seen } = req.body || {};
    await req.db.query(
      `INSERT INTO user_presence (user_email, status, last_seen, updated_at)
       VALUES ($1, $2, COALESCE($3::timestamptz, now()), now())
       ON CONFLICT (user_email) DO UPDATE
         SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen, updated_at = now()`,
      [req.user.email, status, last_seen || null]
    );
    emitChange(req.tenant.slug, 'user_presence', 'update', [{ user_email: req.user.email, status }]);
    return reply.send({ ok: true });
  });
}

// Aktualizacja własnego profilu w app_users mimo braku roli admina.
async function allowSelfUpdate(q, req) {
  if (q.table !== 'app_users' || q.op !== 'update') return false;
  const rule = getTableRule('app_users');
  const allowedCols = rule.selfUpdateColumns || [];
  const cols = Object.keys(q.values || {});
  if (!cols.every((c) => allowedCols.includes(c))) return false;
  // Filtry muszą wskazywać wyłącznie własny wiersz (id lub email).
  const f = q.filters || [];
  return (
    f.length === 1 &&
    f[0].type === 'eq' &&
    ((f[0].column === 'id' && String(f[0].value) === String(req.user.id)) ||
      (f[0].column === 'email' && f[0].value?.toLowerCase() === req.user.email?.toLowerCase()))
  );
}

function unwrapRow(row) {
  if (row && typeof row === 'object' && '__row' in row) {
    const { __row, ...rest } = row;
    return { ...__row, ...rest };
  }
  return row;
}

function sendError(reply, err, req) {
  if (err instanceof ApiError) {
    return reply.code(err.status).send({ error: err.message, code: err.code });
  }
  req.log.error({ err }, 'data api error');
  // Format zbliżony do błędów PostgREST — klient supabase-compat go rozumie.
  return reply.code(400).send({ error: err.message, code: err.code || null, details: err.detail || null });
}
