-- Fix remaining columns and table structures

-- HOME_GROUPS - add email column
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS email TEXT;

-- TEACHING_SPEAKERS - fix id to INTEGER
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE teaching_speakers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    email TEXT
);

-- WORSHIP_TEAM - fix id to INTEGER
DROP TABLE IF EXISTS worship_team CASCADE;
CREATE TABLE worship_team (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT,
    status TEXT,
    phone TEXT,
    email TEXT
);

-- MEDIA_TEAM - fix id to INTEGER
DROP TABLE IF EXISTS media_team CASCADE;
CREATE TABLE media_team (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT,
    status TEXT,
    phone TEXT,
    email TEXT
);

-- TEAM_ROLES - fix id to INTEGER
DROP TABLE IF EXISTS team_roles CASCADE;
CREATE TABLE team_roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    team_type TEXT NOT NULL,
    description TEXT,
    field_key TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEAM_MEMBER_ROLES - fix structure
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id INTEGER,
    member_email TEXT,
    member_name TEXT,
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SCHEDULE_ASSIGNMENTS - fix structure
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE SET NULL,
    member_email TEXT,
    member_name TEXT,
    member_id INTEGER,
    status TEXT DEFAULT 'pending',
    assignment_type TEXT,
    role_name TEXT,
    assigned_by_email TEXT,
    assigned_by_name TEXT,
    assigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MLODZIEZOWKA_MEMBERS - add missing columns
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- KIDS_STUDENTS - fix structure
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    birth_date DATE,
    birth_year INTEGER,
    gender TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    parent2_name TEXT,
    parent2_phone TEXT,
    parent2_email TEXT,
    emergency_contact TEXT,
    can_pickup TEXT[],
    notes TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    allergies TEXT,
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KIDS_TEACHERS - fix id to INTEGER
DROP TABLE IF EXISTS kids_teachers CASCADE;
CREATE TABLE kids_teachers (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    avatar_url TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRAYER_REQUESTS - add missing columns
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- EVENTS - fix id to INTEGER
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    date DATE,
    time TEXT,
    end_time TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATION_PARTICIPANTS - add missing columns
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role TEXT;

-- APP_MODULE_TABS - add missing columns
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
