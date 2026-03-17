-- ============================================
-- MODUL MAIL - Tabele i polityki RLS
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela kont email użytkowników
-- ============================================
CREATE TABLE IF NOT EXISTS mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'external'

  -- Konfiguracja zewnętrznego konta (szyfrowane przez Edge Function)
  external_email TEXT,
  imap_host TEXT,
  imap_port INT DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INT DEFAULT 465,
  smtp_secure BOOLEAN DEFAULT true,
  encrypted_password TEXT, -- Hasło zaszyfrowane AES-256-GCM

  -- Ustawienia
  signature TEXT, -- Podpis HTML
  default_account BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_email, external_email)
);

-- Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mail_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_mail_accounts_updated_at ON mail_accounts;
CREATE TRIGGER trigger_update_mail_accounts_updated_at
    BEFORE UPDATE ON mail_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_mail_accounts_updated_at();

-- ============================================
-- 2. Tabela folderów email
-- ============================================
CREATE TABLE IF NOT EXISTS mail_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom', -- 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
  color TEXT, -- Kolor etykiety (np. #ff5733)
  icon TEXT, -- Ikona z lucide-react
  parent_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  unread_count INT DEFAULT 0,
  total_count INT DEFAULT 0,

  -- Dla folderów zewnętrznych kont - mapowanie na folder IMAP
  imap_path TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, name, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_folders_account ON mail_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_folders_type ON mail_folders(type);

-- ============================================
-- 3. Tabela wiadomości email
-- ============================================
CREATE TABLE IF NOT EXISTS mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES mail_folders(id) ON DELETE CASCADE,

  -- Metadane wiadomości
  message_id TEXT, -- Unikalny ID wiadomości (dla IMAP)
  in_reply_to TEXT, -- ID wiadomości na którą odpowiadamy
  thread_id UUID, -- ID wątku (dla grupowania konwersacji)

  -- Nadawca i odbiorcy
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  to_names TEXT[] DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  cc_names TEXT[] DEFAULT '{}',
  bcc_emails TEXT[] DEFAULT '{}',

  -- Treść
  subject TEXT NOT NULL DEFAULT '(brak tematu)',
  body_text TEXT,
  body_html TEXT,
  snippet TEXT, -- Krótki fragment do podglądu (max 200 znaków)

  -- Flagi
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  is_draft BOOLEAN DEFAULT false,

  -- Daty
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete

  -- Dla zewnętrznych emaili
  external_uid TEXT, -- UID z serwera IMAP
  raw_headers JSONB -- Oryginalne nagłówki
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_mail_messages_account ON mail_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_from ON mail_messages(from_email);
CREATE INDEX IF NOT EXISTS idx_mail_messages_received ON mail_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_is_read ON mail_messages(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_mail_messages_deleted ON mail_messages(deleted_at) WHERE deleted_at IS NULL;

-- Fulltext search index (używamy 'simple' dla uniwersalności - 'polish' wymaga dodatkowej instalacji)
CREATE INDEX IF NOT EXISTS idx_mail_messages_search ON mail_messages
  USING gin(to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body_text, '')));

-- Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mail_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_mail_messages_updated_at ON mail_messages;
CREATE TRIGGER trigger_update_mail_messages_updated_at
    BEFORE UPDATE ON mail_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_mail_messages_updated_at();

-- ============================================
-- 4. Tabela załączników
-- ============================================
CREATE TABLE IF NOT EXISTS mail_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT, -- Ścieżka w Supabase Storage

  -- Dla inline attachments (np. obrazy w HTML)
  content_id TEXT, -- cid dla inline
  is_inline BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);

-- ============================================
-- 5. Tabela etykiet (tagów)
-- ============================================
CREATE TABLE IF NOT EXISTS mail_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mail_labels_account ON mail_labels(account_id);

-- ============================================
-- 6. Tabela połączeń wiadomości z etykietami (M:N)
-- ============================================
CREATE TABLE IF NOT EXISTS mail_message_labels (
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES mail_labels(id) ON DELETE CASCADE,

  PRIMARY KEY (message_id, label_id)
);

-- ============================================
-- 7. Tabela szablonów wiadomości
-- ============================================
CREATE TABLE IF NOT EXISTS mail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,

  name TEXT NOT NULL,
  subject TEXT,
  body_html TEXT NOT NULL,

  is_shared BOOLEAN DEFAULT false, -- Czy dostępny dla wszystkich użytkowników

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_templates_user ON mail_templates(user_email);

-- ============================================
-- 8. Tabela reguł filtrowania
-- ============================================
CREATE TABLE IF NOT EXISTS mail_filter_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,

  -- Warunki (logika AND)
  conditions JSONB NOT NULL DEFAULT '[]',
  -- Przykład: [{"field": "from", "operator": "contains", "value": "newsletter"}]

  -- Akcje
  actions JSONB NOT NULL DEFAULT '[]',
  -- Przykład: [{"type": "move_to_folder", "folder_id": "uuid"}, {"type": "mark_as_read"}]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_account ON mail_filter_rules(account_id);

-- ============================================
-- 9. Włączenie Row Level Security (RLS)
-- ============================================
ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_message_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_filter_rules ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. Polityki RLS dla mail_accounts
-- ============================================
CREATE POLICY "Users can view own mail accounts" ON mail_accounts
    FOR SELECT TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can create own mail accounts" ON mail_accounts
    FOR INSERT TO authenticated
    WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can update own mail accounts" ON mail_accounts
    FOR UPDATE TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can delete own mail accounts" ON mail_accounts
    FOR DELETE TO authenticated
    USING (user_email = auth.jwt()->>'email');

-- ============================================
-- 11. Polityki RLS dla mail_folders
-- ============================================
CREATE POLICY "Users can view own folders" ON mail_folders
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_folders.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own folders" ON mail_folders
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_folders.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update own folders" ON mail_folders
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_folders.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own folders" ON mail_folders
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_folders.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 12. Polityki RLS dla mail_messages
-- ============================================
CREATE POLICY "Users can view own messages" ON mail_messages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_messages.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own messages" ON mail_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_messages.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update own messages" ON mail_messages
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_messages.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own messages" ON mail_messages
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_messages.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 13. Polityki RLS dla mail_attachments
-- ============================================
CREATE POLICY "Users can view own attachments" ON mail_attachments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_attachments.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own attachments" ON mail_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_attachments.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own attachments" ON mail_attachments
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_attachments.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 14. Polityki RLS dla mail_labels
-- ============================================
CREATE POLICY "Users can view own labels" ON mail_labels
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_labels.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own labels" ON mail_labels
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_labels.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update own labels" ON mail_labels
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_labels.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own labels" ON mail_labels
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_labels.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 15. Polityki RLS dla mail_message_labels
-- ============================================
CREATE POLICY "Users can view own message labels" ON mail_message_labels
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_message_labels.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own message labels" ON mail_message_labels
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_message_labels.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own message labels" ON mail_message_labels
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_messages m
            JOIN mail_accounts a ON m.account_id = a.id
            WHERE m.id = mail_message_labels.message_id
            AND a.user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 16. Polityki RLS dla mail_templates
-- ============================================
CREATE POLICY "Users can view own or shared templates" ON mail_templates
    FOR SELECT TO authenticated
    USING (user_email = auth.jwt()->>'email' OR is_shared = true);

CREATE POLICY "Users can create own templates" ON mail_templates
    FOR INSERT TO authenticated
    WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can update own templates" ON mail_templates
    FOR UPDATE TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can delete own templates" ON mail_templates
    FOR DELETE TO authenticated
    USING (user_email = auth.jwt()->>'email');

-- ============================================
-- 17. Polityki RLS dla mail_filter_rules
-- ============================================
CREATE POLICY "Users can view own filter rules" ON mail_filter_rules
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_filter_rules.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can create own filter rules" ON mail_filter_rules
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_filter_rules.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update own filter rules" ON mail_filter_rules
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_filter_rules.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete own filter rules" ON mail_filter_rules
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM mail_accounts
            WHERE id = mail_filter_rules.account_id
            AND user_email = auth.jwt()->>'email'
        )
    );

-- ============================================
-- 18. Storage Bucket dla załączników
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mail-attachments', 'mail-attachments', false, 26214400) -- 25MB limit
ON CONFLICT (id) DO NOTHING;

-- Polityki storage
CREATE POLICY "Users can view own mail attachments" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'mail-attachments' AND
        (storage.foldername(name))[1] = auth.jwt()->>'email'
    );

CREATE POLICY "Users can upload mail attachments" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'mail-attachments' AND
        (storage.foldername(name))[1] = auth.jwt()->>'email'
    );

CREATE POLICY "Users can delete own mail attachments" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'mail-attachments' AND
        (storage.foldername(name))[1] = auth.jwt()->>'email'
    );

-- ============================================
-- 19. Włączenie Realtime dla tabel
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mail_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mail_messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mail_folders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mail_folders;
    END IF;
END $$;

-- ============================================
-- 20. Dodanie modułu Mail do app_modules
-- ============================================
INSERT INTO app_modules (key, label, path, icon, resource_key, is_enabled, display_order)
VALUES ('mail', 'Poczta', '/mail', 'MailCheck', 'module:mail', true, 16)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  icon = EXCLUDED.icon,
  resource_key = EXCLUDED.resource_key;

-- ============================================
-- 21. Funkcja do tworzenia domyślnych folderów
-- ============================================
CREATE OR REPLACE FUNCTION create_default_mail_folders()
RETURNS TRIGGER AS $$
BEGIN
    -- Tworzenie domyślnych folderów dla nowego konta
    INSERT INTO mail_folders (account_id, name, type, icon, position)
    VALUES
        (NEW.id, 'Odebrane', 'inbox', 'Inbox', 1),
        (NEW.id, 'Wysłane', 'sent', 'Send', 2),
        (NEW.id, 'Szkice', 'drafts', 'FileEdit', 3),
        (NEW.id, 'Spam', 'spam', 'AlertTriangle', 4),
        (NEW.id, 'Kosz', 'trash', 'Trash2', 5),
        (NEW.id, 'Archiwum', 'archive', 'Archive', 6);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_default_mail_folders ON mail_accounts;
CREATE TRIGGER trigger_create_default_mail_folders
    AFTER INSERT ON mail_accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_default_mail_folders();
