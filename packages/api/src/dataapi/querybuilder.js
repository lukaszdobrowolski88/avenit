// Budowniczy SQL dla Data API: JSON (od klienta zgodnego z supabase-js) -> parametryzowany SQL.
// Wszystkie identyfikatory są walidowane, wszystkie wartości idą przez parametry ($n).
import { parseSelect } from './selectparser.js';
import { getTableRule } from './registry.js';

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdent(name) {
  if (!IDENT_RE.test(name)) throw new ApiError(400, `Nieprawidłowy identyfikator: ${name}`);
  return `"${name}"`;
}

export class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── Filtry ────────────────────────────────────────────────────────────────
// Klient wysyła: [{ type, column, value }] — typy jak metody supabase-js.
const FILTER_SQL = {
  eq: (c, p) => `${c} = ${p}`,
  neq: (c, p) => `${c} <> ${p}`,
  gt: (c, p) => `${c} > ${p}`,
  gte: (c, p) => `${c} >= ${p}`,
  lt: (c, p) => `${c} < ${p}`,
  lte: (c, p) => `${c} <= ${p}`,
  like: (c, p) => `${c} LIKE ${p}`,
  ilike: (c, p) => `${c} ILIKE ${p}`,
};

function buildFilter(filter, params, alias, hiddenColumns) {
  const { type, column, value } = filter;
  if (column !== undefined) assertColumnAllowed(column, hiddenColumns);
  const push = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  const col = column !== undefined ? `${alias}.${quoteIdent(column)}` : null;

  switch (type) {
    case 'eq': case 'neq': case 'gt': case 'gte': case 'lt': case 'lte':
    case 'like': case 'ilike':
      return FILTER_SQL[type](col, push(value));
    case 'is':
      if (value === null) return `${col} IS NULL`;
      if (value === true) return `${col} IS TRUE`;
      if (value === false) return `${col} IS FALSE`;
      throw new ApiError(400, `is() przyjmuje null/true/false`);
    case 'in': {
      if (!Array.isArray(value)) throw new ApiError(400, 'in() wymaga tablicy');
      if (value.length === 0) return 'FALSE';
      return `${col} IN (${value.map((v) => push(v)).join(', ')})`;
    }
    case 'contains': {
      // supabase .contains(): jsonb/array @>
      const param = push(Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value);
      return `${col} @> ${param}::jsonb`;
    }
    case 'not': {
      // { type:'not', column, operator, value } — .not('col','is',null) itd.
      const inner = buildFilter({ type: filter.operator, column, value }, params, alias, hiddenColumns);
      return `NOT (${inner})`;
    }
    case 'or': {
      // Ograniczony parser składni PostgREST: "a.eq.1,b.is.null,c.ilike.%x%"
      const clauses = String(value)
        .split(',')
        .map((expr) => {
          const m = expr.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/);
          if (!m) throw new ApiError(400, `Nieobsługiwane wyrażenie or(): ${expr}`);
          const [, ocol, oop, oval] = m;
          const parsed = oval === 'null' ? null : oval === 'true' ? true : oval === 'false' ? false : oval;
          return buildFilter({ type: oop, column: ocol, value: parsed }, params, alias, hiddenColumns);
        });
      return `(${clauses.join(' OR ')})`;
    }
    case 'match': {
      const entries = Object.entries(value || {});
      if (!entries.length) return 'TRUE';
      return entries
        .map(([mcol, mval]) => buildFilter({ type: 'eq', column: mcol, value: mval }, params, alias, hiddenColumns))
        .join(' AND ');
    }
    default:
      throw new ApiError(400, `Nieobsługiwany filtr: ${type}`);
  }
}

function assertColumnAllowed(column, hiddenColumns) {
  if (hiddenColumns?.includes(column)) {
    throw new ApiError(403, `Kolumna '${column}' jest niedostępna`);
  }
}

export function buildWhere(filters, params, alias, hiddenColumns) {
  if (!filters?.length) return '';
  const clauses = filters.map((f) => buildFilter(f, params, alias, hiddenColumns));
  return ` WHERE ${clauses.join(' AND ')}`;
}

// ── SELECT (z embedami) ───────────────────────────────────────────────────
function buildSelectColumns(table, parsed, alias, params) {
  const rule = getTableRule(table);
  const hidden = rule?.hiddenColumns || [];
  const parts = [];

  for (const col of parsed.columns) {
    if (col === '*') {
      if (hidden.length === 0) {
        parts.push(`${alias}.*`);
      } else {
        // to_jsonb minus ukryte kolumny — nie znamy pełnej listy kolumn.
        parts.push(`(to_jsonb(${alias}.*) ${hidden.map((h) => `- '${h.replace(/'/g, "''")}'`).join(' ')}) AS __row`);
      }
    } else {
      const clean = col.trim();
      // Wsparcie aliasu kolumny "alias:column"
      const m = clean.match(/^([a-zA-Z_][a-zA-Z0-9_]*):([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (m) {
        assertColumnAllowed(m[2], hidden);
        parts.push(`${alias}.${quoteIdent(m[2])} AS ${quoteIdent(m[1])}`);
      } else {
        assertColumnAllowed(clean, hidden);
        parts.push(`${alias}.${quoteIdent(clean)}`);
      }
    }
  }

  for (const embed of parsed.embeds) {
    parts.push(`${buildEmbed(table, embed, alias, params)} AS ${quoteIdent(embed.alias.trim())}`);
  }
  return parts;
}

function resolveRelationship(table, embed) {
  const rule = getTableRule(table);
  const rels = rule?.relationships || {};
  const key = embed.alias.trim();
  const target = embed.target.trim();
  // 1) jawny wpis pod aliasem lub targetem
  const rel = rels[key] || rels[target];
  if (rel) return rel;
  // 2) target jest kolumną FK w stylu "forms:form_id" => to-one do tabeli o nazwie aliasu
  if (target.endsWith('_id') && getTableRule(key)) {
    return { table: key, column: target, type: 'one' };
  }
  throw new ApiError(
    400,
    `Nieznana relacja '${key}' dla tabeli '${table}' — dodaj ją do relationships w registry.js`
  );
}

function buildEmbed(parentTable, embed, parentAlias, params) {
  const rel = resolveRelationship(parentTable, embed);
  if (!getTableRule(rel.table)) {
    throw new ApiError(403, `Tabela '${rel.table}' nie jest dostępna przez API`);
  }
  const childAlias = `e_${Math.abs(hashCode(`${parentAlias}_${embed.alias}`))}`;
  const childParsed = { columns: embed.columns, embeds: embed.embeds };
  const childCols = buildSelectColumns(rel.table, childParsed, childAlias, params);
  const jsonObject = buildJsonRow(rel.table, childParsed, childAlias);

  if (rel.type === 'one') {
    return `(SELECT ${jsonObject}
       FROM ${quoteIdent(rel.table)} ${childAlias}
      WHERE ${childAlias}."id" = ${parentAlias}.${quoteIdent(rel.column)}
      LIMIT 1)`;
  }
  // to-many
  return `COALESCE((SELECT jsonb_agg(${jsonObject})
       FROM ${quoteIdent(rel.table)} ${childAlias}
      WHERE ${childAlias}.${quoteIdent(rel.column)} = ${parentAlias}."id"), '[]'::jsonb)`;
}

// JSON pojedynczego wiersza embedu (z rekurencją na kolejne embedy).
function buildJsonRow(table, parsed, alias) {
  const rule = getTableRule(table);
  const hidden = rule?.hiddenColumns || [];
  const hasStar = parsed.columns.includes('*');

  let base;
  if (hasStar) {
    base = `to_jsonb(${alias}.*)`;
    for (const h of hidden) base += ` - '${h.replace(/'/g, "''")}'`;
  } else {
    const pairs = parsed.columns.map((c) => {
      const clean = c.trim();
      assertColumnAllowed(clean, hidden);
      return `'${clean.replace(/'/g, "''")}', ${alias}.${quoteIdent(clean)}`;
    });
    base = pairs.length ? `jsonb_build_object(${pairs.join(', ')})` : `'{}'::jsonb`;
  }
  for (const sub of parsed.embeds) {
    base += ` || jsonb_build_object('${sub.alias.trim().replace(/'/g, "''")}', ${buildEmbed(
      table, sub, alias, []
    )})`;
  }
  return base;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ── Główne operacje ───────────────────────────────────────────────────────
export function buildQuery(q) {
  const table = String(q.table || '');
  const rule = getTableRule(table);
  if (!rule) throw new ApiError(403, `Tabela '${table}' nie jest dostępna przez API`);
  const hidden = rule.hiddenColumns || [];
  const alias = 't';
  const params = [];
  const tbl = quoteIdent(table);

  switch (q.op) {
    case 'select': {
      const parsed = parseSelect(q.select);
      const cols = buildSelectColumns(table, parsed, alias, params);
      const usesJsonbRow = cols.some((c) => c.endsWith('AS __row'));
      const where = buildWhere(q.filters, params, alias, hidden);
      let sql = `SELECT ${cols.join(', ')} FROM ${tbl} ${alias}${where}`;
      if (q.order?.length) {
        const orderParts = q.order.map((o) => {
          const dir = o.ascending === false ? 'DESC' : 'ASC';
          const nulls = o.nullsFirst === true ? ' NULLS FIRST' : o.nullsFirst === false ? ' NULLS LAST' : '';
          return `${alias}.${quoteIdent(o.column)} ${dir}${nulls}`;
        });
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      if (Number.isFinite(q.limit)) sql += ` LIMIT ${Math.max(0, Math.floor(q.limit))}`;
      if (Number.isFinite(q.offset)) sql += ` OFFSET ${Math.max(0, Math.floor(q.offset))}`;
      return { sql, params, usesJsonbRow, kind: 'select' };
    }

    case 'insert': {
      const rows = Array.isArray(q.values) ? q.values : [q.values];
      if (!rows.length) throw new ApiError(400, 'Brak danych do zapisu');
      const columns = collectColumns(rows, hidden);
      const valuesSql = rows
        .map(
          (row) =>
            `(${columns
              .map((c) => {
                params.push(normalizeValue(row[c]));
                return `$${params.length}`;
              })
              .join(', ')})`
        )
        .join(', ');
      let sql = `INSERT INTO ${tbl} (${columns.map(quoteIdent).join(', ')}) VALUES ${valuesSql}`;
      sql += returningClause(table, q);
      return { sql, params, kind: 'insert' };
    }

    case 'upsert': {
      const rows = Array.isArray(q.values) ? q.values : [q.values];
      if (!rows.length) throw new ApiError(400, 'Brak danych do zapisu');
      const columns = collectColumns(rows, hidden);
      const valuesSql = rows
        .map(
          (row) =>
            `(${columns
              .map((c) => {
                params.push(normalizeValue(row[c]));
                return `$${params.length}`;
              })
              .join(', ')})`
        )
        .join(', ');
      const conflictCols = String(q.onConflict || 'id')
        .split(',')
        .map((c) => quoteIdent(c.trim()))
        .join(', ');
      let sql = `INSERT INTO ${tbl} (${columns.map(quoteIdent).join(', ')}) VALUES ${valuesSql}`;
      if (q.ignoreDuplicates) {
        sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      } else {
        const updates = columns
          .filter((c) => !String(q.onConflict || 'id').split(',').map((s) => s.trim()).includes(c))
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`);
        sql += updates.length
          ? ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updates.join(', ')}`
          : ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      }
      sql += returningClause(table, q);
      return { sql, params, kind: 'upsert' };
    }

    case 'update': {
      const values = q.values || {};
      const columns = Object.keys(values).filter((c) => !hidden.includes(c));
      if (!columns.length) throw new ApiError(400, 'Brak danych do aktualizacji');
      if (!q.filters?.length) throw new ApiError(400, 'UPDATE bez filtrów jest zabroniony');
      const sets = columns.map((c) => {
        params.push(normalizeValue(values[c]));
        return `${quoteIdent(c)} = $${params.length}`;
      });
      const where = buildWhere(q.filters, params, alias, hidden);
      let sql = `UPDATE ${tbl} AS ${alias} SET ${sets.join(', ')}${where}`;
      sql += returningClause(table, q);
      return { sql, params, kind: 'update' };
    }

    case 'delete': {
      if (!q.filters?.length) throw new ApiError(400, 'DELETE bez filtrów jest zabroniony');
      const where = buildWhere(q.filters, params, alias, hidden);
      let sql = `DELETE FROM ${tbl} AS ${alias}${where}`;
      sql += returningClause(table, q);
      return { sql, params, kind: 'delete' };
    }

    default:
      throw new ApiError(400, `Nieobsługiwana operacja: ${q.op}`);
  }
}

function collectColumns(rows, hidden) {
  const set = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (hidden.includes(key)) throw new ApiError(403, `Kolumna '${key}' jest niedostępna`);
      set.add(key);
    }
  }
  if (!set.size) throw new ApiError(400, 'Brak kolumn do zapisu');
  return [...set];
}

// Obiekty/tablice serializujemy do JSON (kolumny jsonb); pg sam obsłuży resztę.
function normalizeValue(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
    return JSON.stringify(v);
  }
  if (Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object')) {
    return JSON.stringify(v);
  }
  return v;
}

function returningClause(table, q) {
  if (!q.returning) return '';
  // RETURNING wg żądanego selecta (bez embedów — te wymagają SELECT po zapisie).
  const parsed = parseSelect(q.returning === true ? '*' : q.returning);
  if (parsed.embeds.length) {
    // Prosty przypadek: zwróć całość, klient dobierze embedy osobnym zapytaniem.
    return ' RETURNING *';
  }
  const rule = getTableRule(table);
  const hidden = rule?.hiddenColumns || [];
  if (parsed.columns.includes('*')) {
    if (!hidden.length) return ' RETURNING *';
    return ` RETURNING (to_jsonb(${quoteIdent(table)}.*) ${hidden
      .map((h) => `- '${h.replace(/'/g, "''")}'`)
      .join(' ')}) AS __row`;
  }
  return ` RETURNING ${parsed.columns
    .map((c) => {
      assertColumnAllowed(c.trim(), hidden);
      return quoteIdent(c.trim());
    })
    .join(', ')}`;
}
