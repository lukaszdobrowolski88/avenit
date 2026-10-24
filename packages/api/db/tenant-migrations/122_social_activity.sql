-- 122: Social Media — komentarze zespołu i historia posta (kto utworzył, wysłał do akceptacji,
-- zatwierdził, odesłał, zaplanował, opublikował…). Jedna tabela: kind 'comment' = komentarz
-- (note = treść), pozostałe rodzaje = zdarzenia zapisywane przez fn social i worker.
-- Odczyt i zapis wyłącznie przez fn social (poza rejestrem /api/db — szkice są prywatne autora,
-- więc dostęp do historii liczy funkcja). Idempotentnie.

CREATE TABLE IF NOT EXISTS social_post_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,             -- comment | created | edited | submitted | approved | rejected | scheduled
                                    -- | unscheduled | rescheduled | published | partial | failed | retried
    actor TEXT,                     -- e-mail osoby (NULL = system / worker)
    note TEXT,
    seq BIGSERIAL,                  -- kolejność zdarzeń z tej samej chwili (np. „utworzony” + „wysłany”)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_post_activity_post_122 ON social_post_activity (post_id, seq);
