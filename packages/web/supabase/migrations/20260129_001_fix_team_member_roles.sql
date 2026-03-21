-- Fix team_member_roles to accept any member_id format
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id TEXT,  -- Use TEXT to handle both UUID and INTEGER
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
