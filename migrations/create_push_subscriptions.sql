-- ============================================
-- TABELA PUSH SUBSCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_email ON push_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trigger_update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: Użytkownik może odczytać tylko swoje subskrypcje
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
    FOR SELECT TO authenticated
    USING (user_email = auth.jwt()->>'email');

-- INSERT: Użytkownik może dodać tylko swoją subskrypcję
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_email = auth.jwt()->>'email');

-- UPDATE: Użytkownik może aktualizować tylko swoje subskrypcje
CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
    FOR UPDATE TO authenticated
    USING (user_email = auth.jwt()->>'email');

-- DELETE: Użytkownik może usunąć tylko swoje subskrypcje
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
    FOR DELETE TO authenticated
    USING (user_email = auth.jwt()->>'email');

-- Polityka dla service role (do wysyłania push przez Edge Functions)
CREATE POLICY "push_subscriptions_service_select" ON push_subscriptions
    FOR SELECT TO service_role
    USING (true);
