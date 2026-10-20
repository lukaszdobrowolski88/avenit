-- 115: Komunikator — „Ważne — potwierdź przeczytanie”.
-- Nadawca (każdy, kto może pisać w rozmowie; w kanale ogłoszeń — administrator) oznacza wiadomość
-- jako ważną z prośbą o potwierdzenie (messages.requires_ack). Odbiorcy klikają „Rozumiem”
-- (message_acks — jeden wpis na osobę, e-mail małymi literami). Nadawca i administratorzy rozmowy
-- widzą „Potwierdziło X z Y” z listą i mogą przypomnieć niepotwierdzonym (push, najwyżej raz na 6 h
-- na wiadomość — message_ack_reminders).
-- Dostęp: message_acks czytają uczestnicy rozmowy przez /api/db (registry: readOnly, zakres
-- komunikator.js — CONV_TABLES 'msg'); zapis WYŁĄCZNIE serwer (fn chat-ack). message_ack_reminders
-- celowo POZA rejestrem (limit przypomnień nie do obejścia z klienta).
-- Idempotentnie (IF NOT EXISTS); bez RLS/triggerów (architektura VPS: API).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS requires_ack BOOLEAN DEFAULT false;

-- Ważne wiadomości rozmowy (lista „do potwierdzenia”, plakietka na liście rozmów).
CREATE INDEX IF NOT EXISTS idx_messages_requires_ack_115
    ON messages (conversation_id, created_at DESC) WHERE requires_ack;

CREATE TABLE IF NOT EXISTS message_acks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    acked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_message_acks_message_115 ON message_acks (message_id);
CREATE INDEX IF NOT EXISTS idx_message_acks_user_115 ON message_acks (user_email);

-- Ostatnie przypomnienie niepotwierdzonym (limit: raz na 6 h na wiadomość).
CREATE TABLE IF NOT EXISTS message_ack_reminders (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_by TEXT,
    sent_count INTEGER NOT NULL DEFAULT 1
);

