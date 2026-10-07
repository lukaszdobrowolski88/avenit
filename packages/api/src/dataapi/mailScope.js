// Poczta: skrzynka należy do jednej osoby (mail_accounts.user_email).
//
// Do audytu 2026-10 tabele Poczty miały tylko kontrolę modułu (module:mail) — każdy z dostępem
// do Poczty mógł przez /api/db czytać cudze skrzynki, foldery i wiadomości.
// Tu: konto widzi/zmienia tylko właściciel, a wiersze podrzędne (account_id / message_id)
// tylko właściciel konta. Dotyczy każdego, także admina (prywatna korespondencja).
import { ApiError } from './querybuilder.js';

// Jak wiersz łączy się z kontem: 'self' (mail_accounts), 'account' (kolumna account_id),
// 'message' (message_id → mail_messages.account_id).
const MAIL_TABLES = {
  mail_accounts: 'self',
  mail_folders: 'account',
  mail_messages: 'account',
  mail_labels: 'account',
  mail_filter_rules: 'account',
  mail_attachments: 'message',
  mail_message_labels: 'message',
};

export const isMailTable = (table) => table in MAIL_TABLES;

const lower = (v) => String(v ?? '').toLowerCase();
const ownAccount = (expr, p) => `EXISTS (SELECT 1 FROM mail_accounts ma_ WHERE ma_."id" = ${expr} AND lower(ma_."user_email") = $${p})`;

export function mailScope(table, user) {
  const email = lower(user.email);
  const kind = MAIL_TABLES[table];
  let rule;
  if (kind === 'self') rule = (a, push) => `lower(${a}."user_email") = $${push(email)}`;
  else if (kind === 'account') {
    // Etykiety bez konta (stare, wspólne) zostają widoczne.
    rule = table === 'mail_labels'
      ? (a, push) => `(${a}."account_id" IS NULL OR ${ownAccount(`${a}."account_id"`, push(email))})`
      : (a, push) => ownAccount(`${a}."account_id"`, push(email));
  } else {
    rule = (a, push) => `EXISTS (SELECT 1 FROM mail_messages mm_ WHERE mm_."id" = ${a}."message_id" AND ${ownAccount('mm_."account_id"', push(email))})`;
  }
  return { select: rule, update: rule, delete: rule, upsertGuard: rule };
}

// Zapis: konto zakładam tylko dla siebie; wiersze podrzędne tylko w moim koncie / mojej wiadomości.
export async function enforceMailWrite(q, req) {
  if (!isMailTable(q.table) || !['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const me = lower(req.user.email);
  const rows = (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
  const kind = MAIL_TABLES[q.table];

  if (kind === 'self') {
    for (const r of rows) {
      if (q.op === 'update') {
        if ('user_email' in r && lower(r.user_email) !== me) throw new ApiError(403, 'Nie można przekazać skrzynki innej osobie');
        continue;
      }
      if (r.user_email && lower(r.user_email) !== me) throw new ApiError(403, 'Skrzynkę zakładasz tylko dla siebie');
      r.user_email = req.user.email;
    }
    return;
  }

  const col = kind === 'account' ? 'account_id' : 'message_id';
  const ids = [...new Set(rows.map((r) => r[col]).filter((v) => v != null).map(String))];
  if (!ids.length) return;
  const sql = kind === 'account'
    ? `SELECT count(*)::int AS n FROM mail_accounts WHERE id::text = ANY($1::text[]) AND lower(user_email) = $2`
    : `SELECT count(*)::int AS n FROM mail_messages m JOIN mail_accounts a ON a.id = m.account_id
        WHERE m.id::text = ANY($1::text[]) AND lower(a.user_email) = $2`;
  const { rows: found } = await req.db.query(sql, [ids, me]);
  if (found[0].n !== ids.length) throw new ApiError(403, 'Brak dostępu do tej skrzynki');
}

// Realtime: zmiany Poczty tylko do właściciela skrzynki. null = tabela spoza Poczty.
export async function mailAudience(db, table, rows) {
  if (!isMailTable(table)) return null;
  const kind = MAIL_TABLES[table];
  const list = (rows || []).filter(Boolean);
  if (kind === 'self') return new Set(list.map((r) => lower(r.user_email)).filter(Boolean));
  const col = kind === 'account' ? 'account_id' : 'message_id';
  const ids = [...new Set(list.map((r) => r[col]).filter((v) => v != null).map(String))];
  if (!ids.length) return new Set();
  const sql = kind === 'account'
    ? `SELECT DISTINCT lower(user_email) AS e FROM mail_accounts WHERE id::text = ANY($1::text[])`
    : `SELECT DISTINCT lower(a.user_email) AS e FROM mail_messages m JOIN mail_accounts a ON a.id = m.account_id WHERE m.id::text = ANY($1::text[])`;
  const { rows: found } = await db.query(sql, [ids]);
  return new Set(found.map((r) => r.e).filter(Boolean));
}
