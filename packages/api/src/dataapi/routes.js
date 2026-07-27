// POST /api/db — pojedynczy endpoint zapytań (odpowiednik PostgREST dla klienta
// zgodnego z supabase-js). Autoryzacja per tabela/rola w registry.js.
import { buildQuery, buildWhere, ApiError, quoteIdent } from './querybuilder.js';
import { canAccess, getTableRule, invalidatePermissions, requireCapability } from './registry.js';
import { fieldColumns } from '@avenit/shared/src/permissions/catalog.js';
import { emitChange } from '../realtime/hub.js';
import { notifyOnWrite } from '../realtime/push-hooks.js';
import { platformPool } from '../db.js';

// Tabele, których insert wyzwala automatyczny push (patrz push-hooks.js).
const PUSH_ON_INSERT = new Set(['messages', 'schedule_assignments']);

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
      const { rows: userRows } = await req.db.query(
        `SELECT is_super_admin FROM app_users WHERE id = $1`, [req.user.id]
      );
      const user = { ...req.user, is_super_admin: userRows[0]?.is_super_admin };

      const access = await canAccess({
        pool: req.db,
        dbName: req.tenant.db_name,
        table: q.table,
        op: q.op,
        user,
      });
      if (!access.ok) {
        // Wyjątki self-service (mimo braku roli): własny profil w app_users,
        // oraz akceptacja/odrzucenie WŁASNEGO zaproszenia do służby.
        const selfAllowed =
          (await allowSelfUpdate(q, req)) || (await allowAssignmentSelfRespond(q, req));
        if (!selfAllowed) {
          throw new ApiError(403, access.reason);
        }
      }

      // Egzekwowanie pól przy zapisie: odrzuć próbę edycji kolumny bez prawa.
      if (access.resolver && (q.op === 'insert' || q.op === 'update') && q.values) {
        const cols = fieldColumns(q.table);
        if (cols.length) {
          const rows = Array.isArray(q.values) ? q.values : [q.values];
          for (const row of rows) {
            for (const c of cols) {
              if (row && c in row && !access.resolver.fieldWritable(q.table, c)) {
                throw new ApiError(403, `Brak uprawnienia do edycji pola '${c}'`);
              }
            }
          }
        }
      }

      // PARYTET DANYCH: rekordy własnych kolekcji kreatora egzekwowane per moduł.
      // Wymaga capability module:<module_key> (jak dostęp do samego modułu). Zapytania
      // muszą być zawężone do modułu (module_key) — inaczej odrzucamy (brak wycieku).
      if (q.table === 'module_records' && access.resolver && !user.is_super_admin) {
        const moduleKey = moduleRecordsModuleKey(q);
        if (!moduleKey) throw new ApiError(400, 'module_records: wymagany filtr/wartość module_key');
        if (!access.resolver.can(`module:${moduleKey}`)) {
          throw new ApiError(403, `Brak dostępu do modułu: ${moduleKey}`);
        }
      }

      // Wyczyść cache uprawnień przy zmianach ról/grantów.
      if (['app_permissions', 'permission_grants', 'app_roles'].includes(q.table) && q.op !== 'select') {
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

      // Egzekwowanie pól przy odczycie: usuń kolumny bez prawa odczytu.
      if (access.resolver && q.op === 'select') {
        const denied = fieldColumns(q.table).filter((c) => !access.resolver.fieldReadable(q.table, c));
        if (denied.length && Array.isArray(data)) {
          for (const row of data) if (row) for (const c of denied) if (c in row) delete row[c];
        }
      }

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

      // Push: nowa wiadomość / zaproszenie do służby. Fire-and-forget — nie blokuje
      // odpowiedzi i nie może jej wywrócić (błędy łapane w środku hooka).
      if (q.op === 'insert' && PUSH_ON_INSERT.has(q.table)) {
        notifyOnWrite({
          pool: req.db,
          table: q.table,
          op: q.op,
          values: q.values,
          actingUserEmail: req.user.email,
          log: req.log,
        }).catch((err) => req.log?.error?.({ err }, 'push-hooks failed'));
      }

      return reply.send({ data, count });
    } catch (err) {
      return sendError(reply, err, req);
    }
  });

  // ── RPC: dynamiczne DDL CustomModule (port funkcji z Supabase) ─────────
  // Bezpieczne w architekturze baza-per-tenant: DDL dotyka wyłącznie bazy tenanta.
  // Wymaga uprawnienia do zarządzania modułami (tworzenie tabel modułów własnych).
  app.post('/api/rpc/:name', { preHandler: [app.requireUser, requireCapability('action:settings:manage_modules')] }, async (req, reply) => {
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

// Akceptacja/odrzucenie WŁASNEGO zaproszenia do służby przez zaproszonego,
// nawet bez ogólnego prawa zapisu do grafiku (res:schedule_assignments:update).
// Ograniczenia: tylko update statusu na 'accepted'/'rejected' na własnym wierszu.
async function allowAssignmentSelfRespond(q, req) {
  if (q.table !== 'schedule_assignments' || q.op !== 'update') return false;
  const values = q.values || {};
  const cols = Object.keys(values);
  const allowedCols = ['status', 'responded_at', 'updated_at'];
  if (!cols.length || !cols.every((c) => allowedCols.includes(c))) return false;
  if (!['accepted', 'rejected'].includes(String(values.status))) return false;
  // Filtr musi wskazywać pojedynczy wiersz po id.
  const f = q.filters || [];
  const idFilter = f.find((x) => x.type === 'eq' && x.column === 'id');
  if (f.length !== 1 || !idFilter) return false;
  // Właścicielstwo: wiersz musi należeć do zalogowanego (assigned_email == email).
  const { rows } = await req.db.query(
    `SELECT 1 FROM schedule_assignments
      WHERE id = $1 AND lower(assigned_email) = lower($2)`,
    [idFilter.value, req.user.email],
  );
  return rows.length > 0;
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

// Wyznacza module_key żądania na module_records (insert: z values; pozostałe: z filtra eq).
// Zwraca null, gdy żądanie nie jest jednoznacznie zawężone do jednego modułu.
function moduleRecordsModuleKey(q) {
  if (q.op === 'insert') {
    const rows = Array.isArray(q.values) ? q.values : [q.values];
    const keys = new Set(rows.map((r) => r && r.module_key).filter(Boolean));
    return keys.size === 1 ? String([...keys][0]) : null;
  }
  const f = (q.filters || []).find((x) => x.type === 'eq' && x.column === 'module_key');
  return f ? String(f.value) : null;
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
