// Port funkcji RPC dynamicznego DDL modułu CustomModule.
// Bezpieczeństwo: kształty kolumn są zdefiniowane TUTAJ — parametr p_columns od
// klienta jest ignorowany (dawna funkcja create_dynamic_table przyjmowała surowe
// DDL od przeglądarki). DDL dotyka wyłącznie izolowanej bazy tenanta.
import { ApiError } from './querybuilder.js';

const KEY_RE = /^[a-z0-9_]+$/;
const TABLE_RE = /^custom_[a-z0-9_]+_(members|tasks|task_comments|wall)$/;

const SHAPES = {
  members: `
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()`,
  tasks: `
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Do zrobienia',
    assigned_to UUID,
    due_date DATE,
    attachment JSONB,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()`,
  task_comments: `
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    author_email TEXT,
    author_name TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()`,
  wall: `
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    content TEXT,
    author_email TEXT,
    author_name TEXT,
    pinned BOOLEAN DEFAULT false,
    likes JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,
    reply_to JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()`,
};

function assertTableName(tableName) {
  const m = String(tableName || '').match(TABLE_RE);
  if (!m) throw new ApiError(400, `Nieprawidłowa nazwa tabeli dynamicznej: ${tableName}`);
  return m[1]; // typ kształtu
}

async function createTable(pool, tableName) {
  const shape = assertTableName(tableName);
  await pool.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (${SHAPES[shape]})`);
  return { created: tableName };
}

async function createScheduleColumn(pool, moduleKey) {
  if (!KEY_RE.test(String(moduleKey || ''))) {
    throw new ApiError(400, `Nieprawidłowy klucz modułu: ${moduleKey}`);
  }
  const column = `custom_${moduleKey}_schedule`;
  await pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS "${column}" JSONB`);
  return { column };
}

export const RPC_HANDLERS = {
  async initialize_custom_module(pool, args) {
    const key = String(args.module_key || '');
    if (!KEY_RE.test(key)) throw new ApiError(400, `Nieprawidłowy klucz modułu: ${key}`);
    await createTable(pool, `custom_${key}_members`);
    await createTable(pool, `custom_${key}_tasks`);
    await createTable(pool, `custom_${key}_task_comments`);
    await createTable(pool, `custom_${key}_wall`);
    await createScheduleColumn(pool, key);
    return { ok: true };
  },

  create_custom_members_table: (pool, args) => createTable(pool, args.table_name),
  create_custom_tasks_table: (pool, args) => createTable(pool, args.table_name),
  create_custom_wall_table: (pool, args) => createTable(pool, args.table_name),

  // Dawna sygnatura: (p_table_name, p_columns) — kolumny ignorujemy celowo.
  create_dynamic_table: (pool, args) => createTable(pool, args.p_table_name || args.table_name),

  create_schedule_column: (pool, args) => createScheduleColumn(pool, args.module_key),
};
