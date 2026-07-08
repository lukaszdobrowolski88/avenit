#!/usr/bin/env node
// Builder szablonu bazy tenanta: składa kanoniczny schemat z rzeczywistych
// (przetestowanych) migracji, usuwając konstrukcje specyficzne dla Supabase.
//
// Dlaczego skrypt, a nie ręczny SQL: migracje w supabase/migrations i migrations/
// są rozbieżne, ale to jedyne źródło DDL. Składamy je w ustalonej kolejności i
// czyścimy z RLS / auth.* / realtime / pg_cron. Wynik: db/template/tenant_schema.sql.
//
// UWAGA: przed migracją realnych danych ten plik MUSI zostać uzgodniony z
// `pg_dump --schema-only` produkcji (patrz db/README.md). To szablon dla NOWYCH
// tenantów, nie odtworzenie produkcji 1:1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// Kolejność ma znaczenie: baza → konfiguracja → tabele dodatkowe → rebuild
// (drop+recreate na int-PK) → poprawki kolumn → kampusy/typy → funkcje feature.
const SUPABASE_MIGRATIONS = [
  '20241219_000_base_schema.sql',
  '20260119100000_create_app_config_tables.sql',
  '20260119110000_add_missing_tables.sql',
  '20260119120000_add_remaining_tables.sql',
  '20260119130000_add_schwro_tables.sql',
  '20260122_001_add_app_users_columns.sql',
  '20260123_001_add_full_name.sql',
  '20260125_001_rebuild_tables_with_int_id.sql',
  '20260126_001_add_schwro_columns.sql',
  '20260127_001_fix_remaining_columns.sql',
  '20260128_001_final_schema_fixes.sql',
  '20260129_001_fix_team_member_roles.sql',
  '20260130_002_fix_dictionaries.sql',
  '20260131_001_fix_dashboard_tables.sql',
  '20260321_001_add_campuses.sql',
  '20260321_002_create_program_types.sql',
  '20260321_003_add_title_to_programs.sql',
  '20260506_001_fix_push_subscriptions_schema.sql',
];

// Migracje feature (katalog migrations/) — po rdzeniu. Pomijamy: crony, triggery
// pg_net, polityki RLS, tworzenie bucketów storage (obsługiwane inaczej).
const FEATURE_MIGRATIONS = [
  'create_module_management_tables.sql',
  'create_team_roles_table.sql',
  'create_events_table.sql',
  'create_ministry_events_tables.sql',
  'add_end_time_to_ministry_events.sql',
  'create_equipment_table.sql',
  'create_finance_balances.sql',
  'create_prayer_requests_table.sql',
  'create_wall_posts_table.sql',
  'create_teaching_tables.sql',
  'create_mlodziezowka_tables.sql',
  'create_program_templates.sql',
  'create_program_song_suggestions.sql',
  'create_dashboard_tables.sql',
  'create_mail_tables.sql',
  'create_mailing_tables.sql',
  'create_messenger_tables.sql',
  'add_typing_and_read_receipts.sql',
  'add_presence_and_notifications.sql',
  'add_time_fields_to_tasks.sql',
  'add_json_design_to_campaigns.sql',
  'add_komunikator_permissions.sql',
  'create_push_subscriptions.sql',
  'create_push_tokens.sql',
  'create_push_campaigns.sql',
  'create_push_inline_responses.sql',
  '_install_push_campaigns.sql',
  '_install_sms_campaigns.sql',
  '_install_integration_settings.sql',
  'create_user_task_comments.sql',
  'update_members_table.sql',
  'optimize_programs_table.sql',
  'fix_member_id_type.sql',
  'fix_notification_link.sql',
];

// ── Dollar-quote-aware podział na instrukcje ─────────────────────────
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    // start dollar-quote?
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (m) {
        dollarTag = m[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    // line comment
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === ';') {
      statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// Instrukcje do wycięcia (specyficzne dla Supabase / niepotrzebne w bazie tenanta).
function shouldDrop(stmt) {
  const s = stmt.replace(/^--.*$/gm, '').trim(); // bez wiodących komentarzy
  const upper = s.toUpperCase();
  if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(s)) return true;
  if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(s)) return true;
  if (upper.startsWith('CREATE POLICY') || upper.startsWith('DROP POLICY')) return true;
  // Triggery/funkcje na schemacie auth.* (Supabase Auth) — CAŁE do wycięcia.
  // UWAGA: NIE wycinamy CREATE/ALTER TABLE z FK do auth.users — te czyści scrub().
  const isTableStmt = upper.startsWith('CREATE TABLE') || upper.startsWith('ALTER TABLE');
  if (!isTableStmt && /\bauth\.(users|uid|role|jwt)\b/i.test(s)) return true;
  if (/\b(ON|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+auth\./i.test(s)) return true;
  if (/\bon_auth_user_created\b|\bhandle_new_user\b/i.test(s)) return true;
  // Schemat storage.* (Supabase Storage)
  if (/\bstorage\.(objects|buckets)\b/i.test(s)) return true;
  if (/INSERT\s+INTO\s+storage\./i.test(s)) return true;
  if (upper.startsWith('ALTER PUBLICATION')) return true;
  if (upper.startsWith('NOTIFY ')) return true;
  if (upper.startsWith('GRANT ') || upper.startsWith('REVOKE ')) return true;
  // Bloki DO $$ ... $$ dotyczące realtime/publication/cron/pg_net
  if (upper.startsWith('DO ') && /(SUPABASE_REALTIME|PG_PUBLICATION|CRON\.|NET\.HTTP)/i.test(s)) return true;
  // pg_cron / pg_net (harmonogramy — zastąpione workerem node-cron)
  if (/\bCRON\.|NET\.HTTP_POST|PG_CRON|PG_NET\b/i.test(s)) return true;
  // Definicje funkcji multi-tenant (nieużywane w bazie per tenant)
  if (/FUNCTION\s+(GET_CURRENT_TENANT_ID|IS_SUPER_ADMIN)\b/i.test(s)) return true;
  // Rozszerzenia włączamy sami na górze
  if (upper.startsWith('CREATE EXTENSION')) return true;
  return false;
}

// Czyszczenie treści instrukcji z resztek Supabase.
function scrub(stmt) {
  let s = stmt;
  // FK do auth.users → zwykła kolumna (dane migrujemy po auth_user_id/emailu)
  s = s.replace(/\s+REFERENCES\s+auth\.users\s*\([^)]*\)(\s+ON\s+DELETE\s+\w+(\s+\w+)?)?/gi, '');
  // FK do tenants → usuwamy (baza per tenant, tabela tenants jest w bazie platform).
  // Kolumnę tenant_id zostawiamy jako zwykłą (nieużywaną, nieszkodliwą).
  s = s.replace(/\s+REFERENCES\s+tenants\s*\([^)]*\)(\s+ON\s+DELETE\s+\w+(\s+\w+)?)?/gi, '');
  // auth.uid()/auth.role() na wszelki wypadek (poza politykami — już wyciętymi)
  s = s.replace(/auth\.uid\(\)/gi, 'NULL');
  s = s.replace(/auth\.role\(\)/gi, "'authenticated'");
  // Idempotencja: legacy migracje bywają bez IF NOT EXISTS → uniknij kolizji
  // przy nakładaniu się rebuildu i migracji feature.
  s = s.replace(/^CREATE TABLE(?!\s+IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS');
  s = s.replace(/^CREATE INDEX(?!\s+IF\s+NOT\s+EXISTS)/i, 'CREATE INDEX IF NOT EXISTS');
  s = s.replace(/^CREATE UNIQUE INDEX(?!\s+IF\s+NOT\s+EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS');
  // Idempotencja triggerów: legacy CREATE TRIGGER bez DROP → poprzedź DROP IF EXISTS.
  const trg = s.match(/^CREATE\s+TRIGGER\s+(\S+)\s+[\s\S]*?\sON\s+(\w+)/i);
  if (trg) s = `DROP TRIGGER IF EXISTS ${trg[1]} ON ${trg[2]};\n${s}`;
  return s;
}

let out = `-- =====================================================================
-- AVENIT — szablon bazy TENANTA (jeden kościół = jedna baza)
-- =====================================================================
-- WYGENEROWANE AUTOMATYCZNIE przez db/build-tenant-schema.mjs z konsolidacji
-- migracji (supabase/migrations + migrations). Usunięto RLS, auth.*, realtime
-- (supabase_realtime), pg_cron/pg_net oraz funkcje multi-tenant.
--
-- UWAGA: przed migracją realnych danych uzgodnij ten plik z produkcyjnym
--   pg_dump --schema-only  (patrz db/README.md). To szablon dla NOWYCH tenantów.
--
-- Nie edytuj ręcznie — zmiany nanoś w migracjach i uruchom builder ponownie.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

`;

let dropped = 0;
let kept = 0;
const seenFiles = [];

function processFile(absPath, label) {
  if (!fs.existsSync(absPath)) {
    console.warn(`POMINIĘTO (brak pliku): ${label}`);
    return;
  }
  seenFiles.push(label);
  const sql = fs.readFileSync(absPath, 'utf8');
  out += `\n-- ======================================================\n-- ŹRÓDŁO: ${label}\n-- ======================================================\n`;
  for (const stmt of splitStatements(sql)) {
    if (!stmt.trim()) continue;
    if (shouldDrop(stmt)) { dropped++; continue; }
    out += scrub(stmt) + ';\n';
    kept++;
  }
}

for (const f of SUPABASE_MIGRATIONS) processFile(path.join(ROOT, 'supabase/migrations', f), `supabase/migrations/${f}`);
for (const f of FEATURE_MIGRATIONS) processFile(path.join(ROOT, 'migrations', f), `migrations/${f}`);

// ── Warstwa AUTH/API (dodatki ponad legacy) ──────────────────────────
out += `
-- ======================================================
-- WARSTWA AUTH / API (dodatki Avenit ponad schemat legacy)
-- ======================================================
-- Hasła i sesje trzymamy w bazie tenanta (koniec z Supabase Auth).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Log logowań 2FA (używany przez UI 2FA).
CREATE TABLE IF NOT EXISTS totp_auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  action TEXT,
  success BOOLEAN,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bilety logowania: jednorazowy kod do przekazania sesji z app.<domena>
-- na subdomenę kościoła (SSO). Ważny 60 s, jednorazowy.
CREATE TABLE IF NOT EXISTS login_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_tickets_expires ON login_tickets(expires_at);
`;

fs.writeFileSync(path.join(__dirname, 'template/tenant_schema.sql'), out);
console.log(`Zapisano template/tenant_schema.sql`);
console.log(`Pliki źródłowe: ${seenFiles.length}, instrukcji zachowanych: ${kept}, usuniętych (Supabase-izmy): ${dropped}`);
