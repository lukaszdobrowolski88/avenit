-- =====================================================
-- DODANIE TABEL ZE SCHWRO
-- =====================================================

-- =====================================================
-- 1. APP_DICTIONARIES - słowniki aplikacji
-- =====================================================
CREATE TABLE IF NOT EXISTS app_dictionaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_dictionaries_tenant ON app_dictionaries(tenant_id);
ALTER TABLE app_dictionaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_dictionaries_policy" ON app_dictionaries FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 2. APP_SMTP_CONFIG - konfiguracja SMTP
-- =====================================================
CREATE TABLE IF NOT EXISTS app_smtp_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    host TEXT,
    port INTEGER,
    username TEXT,
    password TEXT,
    from_email TEXT,
    from_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_smtp_config_tenant ON app_smtp_config(tenant_id);
ALTER TABLE app_smtp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_smtp_config_policy" ON app_smtp_config FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 3. BUDGET_ITEMS - pozycje budżetowe
-- =====================================================
CREATE TABLE IF NOT EXISTS budget_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    planned_amount DECIMAL(10,2),
    actual_amount DECIMAL(10,2) DEFAULT 0,
    period_start DATE,
    period_end DATE,
    team_type TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_items_tenant ON budget_items(tenant_id);
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_items_policy" ON budget_items FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 4. CUSTOM MODULE TABLES - tabele niestandardowych modułów
-- =====================================================

-- Custom events template
CREATE TABLE IF NOT EXISTS custom_kobiety_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_events_tenant ON custom_kobiety_events(tenant_id);
ALTER TABLE custom_kobiety_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_kobiety_events_policy" ON custom_kobiety_events FOR ALL USING (auth.role() = 'authenticated');

-- Custom members template
CREATE TABLE IF NOT EXISTS custom_kobiety_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_members_tenant ON custom_kobiety_members(tenant_id);
ALTER TABLE custom_kobiety_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_kobiety_members_policy" ON custom_kobiety_members FOR ALL USING (auth.role() = 'authenticated');

-- Custom tasks template
CREATE TABLE IF NOT EXISTS custom_kobiety_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_tasks_tenant ON custom_kobiety_tasks(tenant_id);
ALTER TABLE custom_kobiety_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_kobiety_tasks_policy" ON custom_kobiety_tasks FOR ALL USING (auth.role() = 'authenticated');

-- Custom mc tasks
CREATE TABLE IF NOT EXISTS custom_mc_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_mc_tasks_tenant ON custom_mc_tasks(tenant_id);
ALTER TABLE custom_mc_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_mc_tasks_policy" ON custom_mc_tasks FOR ALL USING (auth.role() = 'authenticated');

-- Custom mc wall
CREATE TABLE IF NOT EXISTS custom_mc_wall (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_id UUID,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_mc_wall_tenant ON custom_mc_wall(tenant_id);
ALTER TABLE custom_mc_wall ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_mc_wall_policy" ON custom_mc_wall FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 5. EMAIL CAMPAIGN TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    html_content TEXT,
    text_content TEXT,
    design JSONB,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id);
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_policy" ON email_templates FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    html_content TEXT,
    text_content TEXT,
    design JSONB,
    status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    total_sent INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON email_campaigns(tenant_id);
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_campaigns_policy" ON email_campaigns FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id);
ALTER TABLE email_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_campaign_recipients_policy" ON email_campaign_recipients FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS email_recipient_segments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_recipient_segments_tenant ON email_recipient_segments(tenant_id);
ALTER TABLE email_recipient_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_recipient_segments_policy" ON email_recipient_segments FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    reason TEXT,
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_tenant ON email_unsubscribes(tenant_id);
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_unsubscribes_policy" ON email_unsubscribes FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 6. FINANCE TRANSACTIONS (income/expense)
-- =====================================================
CREATE TABLE IF NOT EXISTS income_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    source TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_income_transactions_tenant ON income_transactions(tenant_id);
ALTER TABLE income_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "income_transactions_policy" ON income_transactions FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS expense_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    vendor TEXT,
    receipt_url TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_tenant ON expense_transactions(tenant_id);
ALTER TABLE expense_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_transactions_policy" ON expense_transactions FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 7. FORM_RESPONSES
-- =====================================================
CREATE TABLE IF NOT EXISTS form_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    respondent_email TEXT,
    respondent_name TEXT,
    data JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_tenant ON form_responses(tenant_id);
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_responses_policy" ON form_responses FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 8. HOME GROUP TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS home_group_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'leader',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_home_group_leaders_tenant ON home_group_leaders(tenant_id);
ALTER TABLE home_group_leaders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_group_leaders_policy" ON home_group_leaders FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS home_group_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_home_group_tasks_tenant ON home_group_tasks(tenant_id);
ALTER TABLE home_group_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_group_tasks_policy" ON home_group_tasks FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS home_group_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES home_group_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_home_group_task_comments_task ON home_group_task_comments(task_id);
ALTER TABLE home_group_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_group_task_comments_policy" ON home_group_task_comments FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 9. MAIL TABLES (full email client)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'custom',
    parent_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_folders_tenant ON mail_folders(tenant_id);
ALTER TABLE mail_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_folders_policy" ON mail_folders FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mail_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_labels_tenant ON mail_labels(tenant_id);
ALTER TABLE mail_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_labels_policy" ON mail_labels FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mail_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES mail_folders(id) ON DELETE SET NULL,
    message_id TEXT,
    from_email TEXT,
    from_name TEXT,
    to_emails JSONB,
    cc_emails JSONB,
    bcc_emails JSONB,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_draft BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_tenant ON mail_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_messages_policy" ON mail_messages FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mail_message_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES mail_messages(id) ON DELETE CASCADE,
    label_id UUID REFERENCES mail_labels(id) ON DELETE CASCADE,
    UNIQUE(message_id, label_id)
);
ALTER TABLE mail_message_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_message_labels_policy" ON mail_message_labels FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mail_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES mail_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    storage_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);
ALTER TABLE mail_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_attachments_policy" ON mail_attachments FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mail_filter_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_tenant ON mail_filter_rules(tenant_id);
ALTER TABLE mail_filter_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_filter_rules_policy" ON mail_filter_rules FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 10. MATERIALS (files/folders)
-- =====================================================
CREATE TABLE IF NOT EXISTS materials_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_folders_tenant ON materials_folders(tenant_id);
ALTER TABLE materials_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_folders_policy" ON materials_folders FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS materials_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT,
    size INTEGER,
    storage_path TEXT,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_files_tenant ON materials_files(tenant_id);
ALTER TABLE materials_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_files_policy" ON materials_files FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 11. MEDIA TASKS
-- =====================================================
CREATE TABLE IF NOT EXISTS media_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_tasks_tenant ON media_tasks(tenant_id);
ALTER TABLE media_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_tasks_policy" ON media_tasks FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS media_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES media_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_task_comments_task ON media_task_comments(task_id);
ALTER TABLE media_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_task_comments_policy" ON media_task_comments FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 12. MESSENGER ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_reactions_policy" ON message_reactions FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS message_read_receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_message ON message_read_receipts(message_id);
ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_read_receipts_policy" ON message_read_receipts FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation ON pinned_messages(conversation_id);
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pinned_messages_policy" ON pinned_messages FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS typing_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_typing_status_conversation ON typing_status(conversation_id);
ALTER TABLE typing_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "typing_status_policy" ON typing_status FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 13. MLODZIEZOWKA ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'leader',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_leaders_tenant ON mlodziezowka_leaders(tenant_id);
ALTER TABLE mlodziezowka_leaders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mlodziezowka_leaders_policy" ON mlodziezowka_leaders FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mlodziezowka_event_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES mlodziezowka_events(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'registered',
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_event_participants_event ON mlodziezowka_event_participants(event_id);
ALTER TABLE mlodziezowka_event_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mlodziezowka_event_participants_policy" ON mlodziezowka_event_participants FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS mlodziezowka_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES mlodziezowka_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_task_comments_task ON mlodziezowka_task_comments(task_id);
ALTER TABLE mlodziezowka_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mlodziezowka_task_comments_policy" ON mlodziezowka_task_comments FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 14. PRAYER INTERACTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS prayer_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID REFERENCES prayer_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'prayed', 'comment'
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_request ON prayer_interactions(request_id);
ALTER TABLE prayer_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prayer_interactions_policy" ON prayer_interactions FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 15. TEACHING ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS teaching_series (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teaching_series_tenant ON teaching_series(tenant_id);
ALTER TABLE teaching_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teaching_series_policy" ON teaching_series FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS teaching_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    speaker_id UUID REFERENCES teaching_speakers(id) ON DELETE SET NULL,
    topic TEXT,
    series_id UUID REFERENCES teaching_series(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teaching_schedule_tenant ON teaching_schedule(tenant_id);
ALTER TABLE teaching_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teaching_schedule_policy" ON teaching_schedule FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 16. USER ABSENCES (nieobecności)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_absences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    type TEXT DEFAULT 'vacation',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_absences_tenant ON user_absences(tenant_id);
ALTER TABLE user_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_absences_policy" ON user_absences FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 17. USER DASHBOARD LAYOUTS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    layout JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);
ALTER TABLE user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_dashboard_layouts_policy" ON user_dashboard_layouts FOR ALL
    USING (user_id IN (SELECT id FROM app_users WHERE auth_user_id = auth.uid()));

-- =====================================================
-- 18. USER TASKS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_tenant ON user_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_tasks_policy" ON user_tasks FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 19. TOTP AUTH LOGS (2FA)
-- =====================================================
CREATE TABLE IF NOT EXISTS totp_auth_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_user ON totp_auth_logs(user_id);
ALTER TABLE totp_auth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "totp_auth_logs_policy" ON totp_auth_logs FOR ALL
    USING (user_id IN (SELECT id FROM app_users WHERE auth_user_id = auth.uid()));

-- =====================================================
-- VIEW: prayer_requests_with_counts
-- =====================================================
CREATE OR REPLACE VIEW prayer_requests_with_counts AS
SELECT
    pr.*,
    COALESCE(pi.pray_count, 0) as total_prayers,
    COALESCE(pi.comment_count, 0) as total_comments
FROM prayer_requests pr
LEFT JOIN (
    SELECT
        request_id,
        COUNT(*) FILTER (WHERE type = 'prayed') as pray_count,
        COUNT(*) FILTER (WHERE type = 'comment') as comment_count
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pr.id = pi.request_id;

-- =====================================================
-- REALTIME
-- =====================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'app_dictionaries', 'app_smtp_config', 'budget_items',
        'custom_kobiety_events', 'custom_kobiety_members', 'custom_kobiety_tasks',
        'custom_mc_tasks', 'custom_mc_wall',
        'email_templates', 'email_campaigns', 'email_campaign_recipients',
        'income_transactions', 'expense_transactions', 'form_responses',
        'home_group_leaders', 'home_group_tasks', 'home_group_task_comments',
        'mail_folders', 'mail_labels', 'mail_messages', 'mail_attachments',
        'materials_folders', 'materials_files',
        'media_tasks', 'media_task_comments',
        'message_reactions', 'message_read_receipts', 'pinned_messages', 'typing_status',
        'mlodziezowka_leaders', 'mlodziezowka_event_participants', 'mlodziezowka_task_comments',
        'prayer_interactions', 'teaching_series', 'teaching_schedule',
        'user_absences', 'user_dashboard_layouts', 'user_tasks', 'totp_auth_logs'
    ])
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END LOOP;
END $$;
