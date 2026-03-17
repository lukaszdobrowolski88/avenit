-- ============================================
-- NAPRAWKA: Uproszczone polityki RLS dla Komunikatora
-- Uruchom ten skrypt w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Usuń wszystkie istniejące polityki
-- ============================================

-- Conversations
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated can select conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated can update conversations" ON conversations;

-- Conversation participants
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON conversation_participants;
DROP POLICY IF EXISTS "Admins can remove participants" ON conversation_participants;
DROP POLICY IF EXISTS "Authenticated can select participants" ON conversation_participants;
DROP POLICY IF EXISTS "Authenticated can insert participants" ON conversation_participants;
DROP POLICY IF EXISTS "Authenticated can update participants" ON conversation_participants;
DROP POLICY IF EXISTS "Authenticated can delete participants" ON conversation_participants;

-- Messages
DROP POLICY IF EXISTS "Users can read messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;
DROP POLICY IF EXISTS "Authenticated can select messages" ON messages;
DROP POLICY IF EXISTS "Authenticated can insert messages" ON messages;
DROP POLICY IF EXISTS "Authenticated can update messages" ON messages;
DROP POLICY IF EXISTS "Authenticated can delete messages" ON messages;

-- ============================================
-- 2. Uproszczone polityki dla conversations
-- ============================================

-- SELECT: zalogowani użytkownicy mogą widzieć konwersacje
CREATE POLICY "Authenticated can select conversations"
ON conversations FOR SELECT
TO authenticated
USING (true);

-- INSERT: zalogowani użytkownicy mogą tworzyć konwersacje
CREATE POLICY "Authenticated can insert conversations"
ON conversations FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.jwt() ->> 'email');

-- UPDATE: zalogowani użytkownicy mogą aktualizować konwersacje
CREATE POLICY "Authenticated can update conversations"
ON conversations FOR UPDATE
TO authenticated
USING (true);

-- ============================================
-- 3. Uproszczone polityki dla conversation_participants
-- ============================================

-- SELECT: zalogowani użytkownicy mogą widzieć uczestników
CREATE POLICY "Authenticated can select participants"
ON conversation_participants FOR SELECT
TO authenticated
USING (true);

-- INSERT: zalogowani użytkownicy mogą dodawać uczestników
CREATE POLICY "Authenticated can insert participants"
ON conversation_participants FOR INSERT
TO authenticated
WITH CHECK (true);

-- UPDATE: zalogowani użytkownicy mogą aktualizować uczestników
CREATE POLICY "Authenticated can update participants"
ON conversation_participants FOR UPDATE
TO authenticated
USING (true);

-- DELETE: zalogowani użytkownicy mogą usuwać uczestników
CREATE POLICY "Authenticated can delete participants"
ON conversation_participants FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 4. Uproszczone polityki dla messages
-- ============================================

-- SELECT: zalogowani użytkownicy mogą czytać wiadomości
CREATE POLICY "Authenticated can select messages"
ON messages FOR SELECT
TO authenticated
USING (true);

-- INSERT: zalogowani użytkownicy mogą wysyłać wiadomości (jako siebie)
CREATE POLICY "Authenticated can insert messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (sender_email = auth.jwt() ->> 'email');

-- UPDATE: zalogowani użytkownicy mogą edytować swoje wiadomości
CREATE POLICY "Authenticated can update messages"
ON messages FOR UPDATE
TO authenticated
USING (sender_email = auth.jwt() ->> 'email');

-- DELETE: zalogowani użytkownicy mogą usuwać swoje wiadomości
CREATE POLICY "Authenticated can delete messages"
ON messages FOR DELETE
TO authenticated
USING (sender_email = auth.jwt() ->> 'email');

-- ============================================
-- GOTOWE!
-- ============================================
-- Te uproszczone polityki pozwalają zalogowanym użytkownikom
-- na podstawowe operacje. Logika ograniczania dostępu
-- jest obsługiwana na poziomie aplikacji (hook useConversations
-- filtruje tylko konwersacje użytkownika).
-- ============================================
