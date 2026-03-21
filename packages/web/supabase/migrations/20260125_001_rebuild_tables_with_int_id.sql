-- Rebuild key tables to use INTEGER ids like in schwro database
-- This allows importing data from schwro backup directly

-- =====================================================
-- MEMBERS
-- =====================================================
DROP TABLE IF EXISTS members CASCADE;
CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT,
    group_home TEXT,
    ministry TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    address TEXT,
    join_date DATE,
    home_group TEXT,
    home_group_id UUID,
    membership_date DATE,
    membership_declaration_url TEXT,
    ministries TEXT[] DEFAULT '{}',
    household_id UUID
);
CREATE INDEX idx_members_email ON members(email);

-- =====================================================
-- SONGS
-- =====================================================
DROP TABLE IF EXISTS songs CASCADE;
CREATE TABLE songs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    key TEXT,
    bpm INTEGER,
    lyrics TEXT,
    chords_url TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    attachments JSONB DEFAULT '[]'
);
CREATE INDEX idx_songs_title ON songs(title);

-- =====================================================
-- PROGRAMS
-- =====================================================
DROP TABLE IF EXISTS programs CASCADE;
CREATE TABLE programs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    template TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    song_ids JSONB DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    type TEXT DEFAULT 'sunday',
    assignments JSONB DEFAULT '{}',
    file_attachments JSONB DEFAULT '[]'
);
CREATE INDEX idx_programs_date ON programs(date);

-- =====================================================
-- TEACHING_SPEAKERS
-- =====================================================
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE teaching_speakers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- KIDS_GROUPS
-- =====================================================
DROP TABLE IF EXISTS kids_groups CASCADE;
CREATE TABLE kids_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    age_range TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- KIDS_STUDENTS
-- =====================================================
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    birth_date DATE,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    notes TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    allergies TEXT,
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- KIDS_TEACHERS
-- =====================================================
DROP TABLE IF EXISTS kids_teachers CASCADE;
CREATE TABLE kids_teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- HOME_GROUPS
-- =====================================================
DROP TABLE IF EXISTS home_groups CASCADE;
CREATE TABLE home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    leader_name TEXT,
    leader_email TEXT,
    leader_phone TEXT,
    meeting_day TEXT,
    meeting_time TEXT,
    meeting_location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- HOME_GROUP_MEMBERS
-- =====================================================
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

-- =====================================================
-- WORSHIP_TEAM
-- =====================================================
DROP TABLE IF EXISTS worship_team CASCADE;
CREATE TABLE worship_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MEDIA_TEAM
-- =====================================================
DROP TABLE IF EXISTS media_team CASCADE;
CREATE TABLE media_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ATMOSFERA_MEMBERS
-- =====================================================
DROP TABLE IF EXISTS atmosfera_members CASCADE;
CREATE TABLE atmosfera_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TEAM_ROLES
-- =====================================================
DROP TABLE IF EXISTS team_roles CASCADE;
CREATE TABLE team_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    team_type TEXT NOT NULL,
    description TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TEAM_MEMBER_ROLES
-- =====================================================
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE team_member_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    member_email TEXT NOT NULL,
    member_name TEXT,
    role_id UUID REFERENCES team_roles(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SCHEDULE_ASSIGNMENTS
-- =====================================================
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    role_id UUID REFERENCES team_roles(id) ON DELETE CASCADE,
    member_email TEXT,
    member_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MLODZIEZOWKA_MEMBERS
-- =====================================================
DROP TABLE IF EXISTS mlodziezowka_members CASCADE;
CREATE TABLE mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MLODZIEZOWKA_EVENTS
-- =====================================================
DROP TABLE IF EXISTS mlodziezowka_events CASCADE;
CREATE TABLE mlodziezowka_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,
    max_participants INTEGER,
    registration_required BOOLEAN DEFAULT false,
    image_url TEXT,
    attachments JSONB DEFAULT '[]',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PRAYER_REQUESTS
-- =====================================================
DROP TABLE IF EXISTS prayer_requests CASCADE;
CREATE TABLE prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    author_email TEXT,
    author_name TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    is_answered BOOLEAN DEFAULT false,
    prayer_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TASKS
-- =====================================================
DROP TABLE IF EXISTS tasks CASCADE;
CREATE TABLE tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    assigned_to TEXT,
    assigned_to_name TEXT,
    created_by TEXT,
    created_by_name TEXT,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EVENTS
-- =====================================================
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,
    max_participants INTEGER,
    registration_required BOOLEAN DEFAULT false,
    image_url TEXT,
    attachments JSONB DEFAULT '[]',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CONVERSATIONS
-- =====================================================
DROP TABLE IF EXISTS conversations CASCADE;
CREATE TABLE conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT,
    type TEXT DEFAULT 'direct',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT
);

-- =====================================================
-- CONVERSATION_PARTICIPANTS
-- =====================================================
DROP TABLE IF EXISTS conversation_participants CASCADE;
CREATE TABLE conversation_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_email)
);

-- =====================================================
-- MESSAGES
-- =====================================================
DROP TABLE IF EXISTS messages CASCADE;
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_email);

-- =====================================================
-- USER_PRESENCE
-- =====================================================
DROP TABLE IF EXISTS user_presence CASCADE;
CREATE TABLE user_presence (
    user_email TEXT PRIMARY KEY,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER_ABSENCES
-- =====================================================
DROP TABLE IF EXISTS user_absences CASCADE;
CREATE TABLE user_absences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    user_name TEXT,
    absence_date DATE NOT NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_email);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- =====================================================
-- APP_MODULE_TABS
-- =====================================================
DROP TABLE IF EXISTS app_module_tabs CASCADE;
CREATE TABLE app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    component TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
