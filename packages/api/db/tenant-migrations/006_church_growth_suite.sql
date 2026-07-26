-- 006: Church Growth Suite — nowe moduły i funkcje.
-- Dostosowane do PRODUKCYJNEGO schematu tenanta:
--   * members.id / songs.id / programs.id / kids_students.id / campuses.id = INTEGER
--   * parent_contacts.id / checkin_sessions.id / home_groups.id / app_users.id = UUID
--   * BEZ RLS/auth.* (izolacja per-baza + autoryzacja w API); dostęp modułów = capability module:<key>
--     (koordynator/lider mają module:*, rada_starszych *), więc NIE seedujemy app_permissions.
-- Wszystko idempotentne (IF NOT EXISTS / ON CONFLICT).

-- Wspólna funkcja updated_at
CREATE OR REPLACE FUNCTION cgs_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DAWANIE (Giving)
-- ============================================================
CREATE TABLE IF NOT EXISTS giving_funds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, description TEXT, color TEXT DEFAULT '#10b981',
  is_active BOOLEAN DEFAULT true, is_tax_deductible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS giving_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, description TEXT, goal_amount NUMERIC(12,2) DEFAULT 0,
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  start_date DATE, end_date DATE, image_url TEXT, is_active BOOLEAN DEFAULT true,
  campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS giving_recurring (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id INTEGER, donor_name TEXT,
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL, currency TEXT DEFAULT 'PLN',
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
  day_of_month INTEGER, method TEXT DEFAULT 'transfer',
  start_date DATE DEFAULT CURRENT_DATE, end_date DATE, next_run_date DATE,
  is_active BOOLEAN DEFAULT true, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS giving_pledges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES giving_campaigns(id) ON DELETE CASCADE,
  member_id INTEGER, donor_name TEXT, pledge_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT, campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id INTEGER, donor_name TEXT, donor_email TEXT, donor_address TEXT,
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES giving_campaigns(id) ON DELETE SET NULL,
  recurring_id UUID REFERENCES giving_recurring(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL, currency TEXT DEFAULT 'PLN',
  donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT DEFAULT 'cash' CHECK (method IN ('cash','transfer','card','blik','online','przelewy24','paypal','other')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed','pending','failed','refunded')),
  is_recurring BOOLEAN DEFAULT false, is_anonymous BOOLEAN DEFAULT false,
  receipt_number TEXT, payment_transaction_id UUID, note TEXT,
  campus_id INTEGER, created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_donations_member ON donations(member_id);
CREATE INDEX IF NOT EXISTS idx_donations_fund ON donations(fund_id);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date);
CREATE INDEX IF NOT EXISTS idx_giving_recurring_active ON giving_recurring(is_active, next_run_date);

INSERT INTO giving_funds (name, description, color, is_tax_deductible, sort_order)
SELECT * FROM (VALUES
  ('Dziesięcina','Regularna dziesięcina','#10b981',true,0),
  ('Ofiara','Ofiary niedzielne','#3b82f6',true,1),
  ('Misje','Wsparcie misji','#f59e0b',true,2),
  ('Budowa / remont','Fundusz inwestycyjny','#8b5cf6',true,3)
) AS v(name,description,color,is_tax_deductible,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM giving_funds);

-- ============================================================
-- OPIEKA i CRM (Care)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER, tag TEXT,
  color TEXT DEFAULT '#10b981', campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER, author_email TEXT,
  body TEXT, campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_care_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER,
  care_type TEXT, note TEXT, care_date DATE, created_by TEXT,
  campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER,
  milestone_type TEXT, milestone_date DATE, note TEXT,
  campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_custom_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, field_key TEXT UNIQUE, label TEXT,
  field_type TEXT DEFAULT 'text', options JSONB DEFAULT '[]', sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_custom_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER, field_key TEXT,
  value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (member_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_member_tags_member ON member_tags(member_id);
CREATE INDEX IF NOT EXISTS idx_member_notes_member ON member_notes(member_id);
CREATE INDEX IF NOT EXISTS idx_member_care_member ON member_care_log(member_id);

-- ============================================================
-- SŁUŻBA: dostępność + CCLI (Serve)
-- ============================================================
CREATE TABLE IF NOT EXISTS volunteer_blockouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, member_id INTEGER,
  start_date DATE NOT NULL, end_date DATE NOT NULL, reason TEXT,
  campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS song_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, song_id INTEGER, program_id INTEGER,
  used_date DATE NOT NULL, ccli_number TEXT, note TEXT,
  campus_id INTEGER, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_song_usage_song ON song_usage(song_id);
CREATE INDEX IF NOT EXISTS idx_song_usage_date ON song_usage(used_date);

-- ============================================================
-- REZERWACJE SAL (Rooms)
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL,
  type TEXT DEFAULT 'room' CHECK (type IN ('room','equipment')),
  capacity INTEGER, color TEXT DEFAULT '#3b82f6', location TEXT,
  is_active BOOLEAN DEFAULT true, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS resource_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  title TEXT, start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
  booked_by TEXT, note TEXT, recurrence_group UUID, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_res_bookings_range ON resource_bookings(resource_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_res_bookings_group ON resource_bookings(recurrence_group);

-- ============================================================
-- FREKWENCJA dorosłych (Attendance) — nowe tabele obok istniejącej `attendance`
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, title TEXT, session_date DATE NOT NULL,
  session_type TEXT DEFAULT 'service', headcount INTEGER, note TEXT,
  campus_id INTEGER, created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  member_id INTEGER, guest_name TEXT, present BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_att_sessions_date ON attendance_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_att_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_att_records_member ON attendance_records(member_id);

-- ============================================================
-- AUTOMATYZACJE (Automation)
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  trigger_type TEXT DEFAULT 'manual', trigger_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
  step_order INTEGER, action_type TEXT, action_config JSONB DEFAULT '{}',
  delay_days INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
  member_id INTEGER, status TEXT DEFAULT 'pending', current_step INTEGER DEFAULT 0,
  log JSONB DEFAULT '[]', started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);

-- ============================================================
-- AI (asystent Claude)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_email TEXT, task TEXT,
  input TEXT, result TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KAZANIA (Sermons)
-- ============================================================
CREATE TABLE IF NOT EXISTS sermons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, title TEXT NOT NULL, speaker TEXT,
  series TEXT, sermon_date DATE, scripture_ref TEXT, description TEXT,
  audio_url TEXT, video_url TEXT, notes TEXT, slug TEXT, is_published BOOLEAN DEFAULT false,
  campus_id INTEGER, created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sermons_published ON sermons(is_published);
CREATE INDEX IF NOT EXISTS idx_sermons_slug ON sermons(slug);

-- ============================================================
-- KIDS: powiadomienia rodzica
-- ============================================================
CREATE TABLE IF NOT EXISTS kids_parent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, child_name TEXT, parent_phone TEXT,
  parent_contact_id UUID, session_id UUID, channel TEXT, message TEXT,
  status TEXT DEFAULT 'sent', sent_by TEXT, campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OBECNOŚĆ / RSVP (z przypomnieniami + serią)
-- ============================================================
CREATE TABLE IF NOT EXISTS rsvp_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  event_type TEXT DEFAULT 'event', event_ref_id UUID, event_date DATE, event_time TEXT,
  location TEXT, channels JSONB DEFAULT '["push"]', message TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','sent')), sent_at TIMESTAMPTZ,
  created_by TEXT, campus_id INTEGER,
  reminder_enabled BOOLEAN DEFAULT true, reminder_days_before INTEGER DEFAULT 1,
  is_series BOOLEAN DEFAULT false, recur_interval_days INTEGER, series_next_date DATE,
  audience_member_ids JSONB, series_parent_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rsvp_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES rsvp_campaigns(id) ON DELETE CASCADE,
  member_id INTEGER, name TEXT, email TEXT, phone TEXT, token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','yes','no','maybe')),
  guests_count INTEGER DEFAULT 0, responded_at TIMESTAMPTZ, sent_channels JSONB DEFAULT '[]',
  reminded_at TIMESTAMPTZ, campus_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_campaign ON rsvp_invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_token ON rsvp_invitations(token);
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_status ON rsvp_invitations(status);
CREATE INDEX IF NOT EXISTS idx_rsvp_series ON rsvp_campaigns(is_series, series_next_date);

-- ============================================================
-- Powiązanie konta z członkiem
-- ============================================================
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS member_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_app_users_member_id ON app_users(member_id);
UPDATE app_users u SET member_id = m.id
  FROM members m
 WHERE u.member_id IS NULL AND u.email IS NOT NULL AND lower(u.email) = lower(m.email);

-- ============================================================
-- Triggery updated_at
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'giving_funds','giving_campaigns','giving_recurring','donations',
    'resources','resource_bookings','attendance_sessions',
    'automation_workflows','sermons','rsvp_campaigns'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION cgs_touch_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- Rejestracja modułów w nawigacji (dostęp = capability module:<key>,
-- koordynator/lider mają module:*, rada_starszych *)
-- ============================================================
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name) VALUES
  ('giving','Dawanie','Gift','/giving','module:giving',20,true,'GivingModule'),
  ('care','Opieka i CRM','HeartPulse','/care','module:care',21,true,'CareModule'),
  ('attendance','Frekwencja','ClipboardCheck','/attendance','module:attendance',22,true,'AttendanceModule'),
  ('serve','Służba','CalendarCheck','/serve','module:serve',23,true,'ServeModule'),
  ('rooms','Rezerwacje sal','DoorOpen','/rooms','module:rooms',24,true,'RoomsModule'),
  ('rsvp','Obecność (RSVP)','CalendarCheck','/rsvp','module:rsvp',25,true,'RsvpModule'),
  ('sermons','Kazania','Podcast','/sermons','module:sermons',26,true,'SermonsModule'),
  ('automation','Automatyzacje','Workflow','/automation','module:automation',27,true,'AutomationModule'),
  ('analytics','Analityka','BarChart3','/analytics','module:analytics',28,true,'AnalyticsModule'),
  ('ai','Asystent AI','Sparkles','/ai','module:ai',29,true,'AiAssistantModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;
