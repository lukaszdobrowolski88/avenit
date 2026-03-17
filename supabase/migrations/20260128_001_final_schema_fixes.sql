-- Final schema fixes to match schwro backup structure exactly

-- TEACHING_SPEAKERS - fix id to UUID
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE teaching_speakers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    email TEXT
);

-- MEDIA_TEAM - add created_at
ALTER TABLE media_team ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- HOME_GROUPS - fix structure
DROP TABLE IF EXISTS home_groups CASCADE;
CREATE TABLE home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID,
    meeting_day TEXT,
    meeting_time TEXT,
    location TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    materials JSONB DEFAULT '[]'
);

-- TEAM_MEMBER_ROLES - fix member_id to UUID
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id UUID,
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SCHEDULE_ASSIGNMENTS - fix structure
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    team_type TEXT,
    role_key TEXT,
    assigned_name TEXT,
    assigned_email TEXT,
    assigned_by_email TEXT,
    assigned_by_name TEXT,
    status TEXT DEFAULT 'pending',
    token UUID,
    responded_at TIMESTAMPTZ,
    email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MLODZIEZOWKA_MEMBERS - fix structure
DROP TABLE IF EXISTS mlodziezowka_members CASCADE;
CREATE TABLE mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    birth_date DATE,
    address TEXT,
    notes TEXT,
    photo_url TEXT,
    joined_at DATE,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- KIDS_STUDENTS - fix structure
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE kids_students (
    id SERIAL PRIMARY KEY,
    full_name TEXT,
    birth_year TEXT,
    parent_info TEXT,
    notes TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    household_id UUID,
    allergies TEXT,
    medical_notes TEXT,
    photo_url TEXT
);

-- PRAYER_REQUESTS - fix structure
DROP TABLE IF EXISTS prayer_requests CASCADE;
CREATE TABLE prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    user_email TEXT,
    user_name TEXT,
    content TEXT NOT NULL,
    category TEXT,
    visibility TEXT DEFAULT 'public',
    is_anonymous BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    answered_testimony TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    requester_name TEXT,
    is_active BOOLEAN DEFAULT true
);

-- CONVERSATION_PARTICIPANTS - add missing columns
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;

-- APP_MODULE_TABS - fix structure
DROP TABLE IF EXISTS app_module_tabs CASCADE;
CREATE TABLE app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    component_type TEXT
);

-- HOME_GROUP_MEMBERS - fix structure for import
DROP TABLE IF EXISTS home_group_members CASCADE;
CREATE TABLE home_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    is_leader BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
