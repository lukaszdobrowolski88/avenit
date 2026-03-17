-- ============================================
-- CENTRUM MODLITWY - Schemat bazy danych
-- ============================================

-- Tabela przechowująca prośby modlitewne
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    requester_name TEXT,  -- Imię osoby, za którą się modlimy (kto zgłasza potrzebę)
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('zdrowie', 'rodzina', 'finanse', 'duchowe', 'inne')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'leaders_only')),
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,  -- Czy intencja jest aktualna (true) czy nieaktualna (false)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'answered', 'archived')),
    answered_testimony TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Jeśli tabela już istnieje, dodaj nowe kolumny
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS requester_name TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Indeksy dla optymalizacji zapytań
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user_id ON prayer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user_email ON prayer_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_status ON prayer_requests(status);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_visibility ON prayer_requests(visibility);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_category ON prayer_requests(category);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_created_at ON prayer_requests(created_at DESC);

-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_prayer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_prayer_requests_updated_at ON prayer_requests;
CREATE TRIGGER trigger_update_prayer_requests_updated_at
    BEFORE UPDATE ON prayer_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_prayer_requests_updated_at();

-- ============================================
-- Tabela interakcji (kto się modli za prośbę)
-- ============================================

CREATE TABLE IF NOT EXISTS prayer_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ograniczenie: jeden użytkownik może kliknąć "Modlę się" tylko raz dla danej prośby
    UNIQUE(request_id, user_email)
);

-- Indeksy dla interakcji
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_request_id ON prayer_interactions(request_id);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_user_email ON prayer_interactions(user_email);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Włącz RLS dla prayer_requests
ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;

-- Włącz RLS dla prayer_interactions
ALTER TABLE prayer_interactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Polityki dla prayer_requests
-- ============================================

-- SELECT: Zalogowani mogą czytać publiczne prośby
-- Liderzy mogą czytać również prośby "leaders_only"
CREATE POLICY "Users can read public prayer requests" ON prayer_requests
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            visibility = 'public' OR
            user_email = auth.email() OR
            EXISTS (
                SELECT 1 FROM app_users
                WHERE email = auth.email()
                AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
            )
        )
    );

-- INSERT: Każdy zalogowany może dodawać prośby
CREATE POLICY "Authenticated users can create prayer requests" ON prayer_requests
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- UPDATE: Tylko autor może edytować swoją prośbę
CREATE POLICY "Users can update own prayer requests" ON prayer_requests
    FOR UPDATE
    USING (auth.role() = 'authenticated' AND user_email = auth.email())
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- DELETE: Tylko autor może usuwać swoją prośbę
CREATE POLICY "Users can delete own prayer requests" ON prayer_requests
    FOR DELETE
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

-- ============================================
-- Polityki dla prayer_interactions
-- ============================================

-- SELECT: Każdy zalogowany może odczytać interakcje
CREATE POLICY "Authenticated users can read prayer interactions" ON prayer_interactions
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: Każdy zalogowany może dodać interakcję (modlić się)
CREATE POLICY "Authenticated users can create prayer interactions" ON prayer_interactions
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- DELETE: Użytkownik może usunąć swoją interakcję
CREATE POLICY "Users can delete own prayer interactions" ON prayer_interactions
    FOR DELETE
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

-- ============================================
-- Widok do pobierania prośb z liczbą modlitw
-- ============================================

CREATE OR REPLACE VIEW prayer_requests_with_counts AS
SELECT
    pr.*,
    COALESCE(pi.prayer_count, 0) as prayer_count,
    COALESCE(pi.praying_users, '[]'::jsonb) as praying_users
FROM prayer_requests pr
LEFT JOIN (
    SELECT
        request_id,
        COUNT(*) as prayer_count,
        jsonb_agg(user_email) as praying_users
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pr.id = pi.request_id;

-- Nadaj uprawnienia do widoku
GRANT SELECT ON prayer_requests_with_counts TO authenticated;

-- ============================================
-- Funkcja do sprawdzenia czy użytkownik już się modli
-- ============================================

CREATE OR REPLACE FUNCTION is_user_praying(p_request_id UUID, p_user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM prayer_interactions
        WHERE request_id = p_request_id AND user_email = p_user_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
