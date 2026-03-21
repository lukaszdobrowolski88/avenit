-- Fix user_dashboard_layouts and user_tasks tables

-- Drop and recreate user_dashboard_layouts with correct structure
DROP TABLE IF EXISTS user_dashboard_layouts CASCADE;
CREATE TABLE user_dashboard_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    layout JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_dashboard_layouts_email ON user_dashboard_layouts(user_email);

-- Drop and recreate user_tasks with correct structure
DROP TABLE IF EXISTS user_tasks CASCADE;
CREATE TABLE user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    task_id UUID,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    due_time TEXT,
    location TEXT,
    team TEXT,
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_tasks_email ON user_tasks(user_email);
CREATE INDEX idx_user_tasks_due ON user_tasks(due_date);

-- Fix home_group_leaders - drop and recreate
DROP TABLE IF EXISTS home_group_leaders CASCADE;
CREATE TABLE home_group_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    user_email TEXT,
    user_name TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_home_group_leaders_email ON home_group_leaders(user_email);
CREATE INDEX idx_home_group_leaders_group ON home_group_leaders(group_id);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
