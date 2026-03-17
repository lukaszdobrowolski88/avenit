-- ============================================
-- Dodatkowe polityki RLS dla kanałów służb
-- ============================================

-- Pozwól na tworzenie kanałów ministry przez użytkowników
DROP POLICY IF EXISTS "Users can create ministry conversations" ON conversations;
CREATE POLICY "Users can create ministry conversations"
ON conversations FOR INSERT
WITH CHECK (
    type = 'ministry' AND created_by = auth.jwt() ->> 'email'
);

-- Pozwól uczestnikom kanałów ministry na aktualizowanie nazwy
DROP POLICY IF EXISTS "Ministry members can update channel name" ON conversations;
CREATE POLICY "Ministry members can update channel name"
ON conversations FOR UPDATE
USING (
    type = 'ministry'
    AND id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Pozwól użytkownikom na dodawanie siebie do kanałów ministry
DROP POLICY IF EXISTS "Users can join ministry channels" ON conversation_participants;
CREATE POLICY "Users can join ministry channels"
ON conversation_participants FOR INSERT
WITH CHECK (
    -- Może dodać siebie do kanału ministry
    user_email = auth.jwt() ->> 'email'
    AND conversation_id IN (
        SELECT id FROM conversations WHERE type = 'ministry'
    )
);

-- Pozwól wszystkim użytkownikom widzieć kanały ministry (nawet jeśli jeszcze nie są uczestnikami)
-- To pomoże w automatycznym dodawaniu
DROP POLICY IF EXISTS "Users can view ministry conversations" ON conversations;
CREATE POLICY "Users can view ministry conversations"
ON conversations FOR SELECT
USING (
    type = 'ministry'
    OR id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Zaktualizuj politykę dodawania uczestników, żeby obsługiwała też ministry
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;
CREATE POLICY "Users can add participants"
ON conversation_participants FOR INSERT
WITH CHECK (
    -- Może dodać uczestników do konwersacji którą sam stworzył
    conversation_id IN (
        SELECT id FROM conversations
        WHERE created_by = auth.jwt() ->> 'email'
    )
    OR
    -- Jest adminem tej konwersacji
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
        AND role = 'admin'
    )
    OR
    -- Może dodać siebie do kanału ministry
    (
        user_email = auth.jwt() ->> 'email'
        AND conversation_id IN (
            SELECT id FROM conversations WHERE type = 'ministry'
        )
    )
);
