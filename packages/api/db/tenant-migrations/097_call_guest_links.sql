-- 097: Goście w rozmowach audio/wideo („zaproś przez link”, jak Zoom/Meet).
-- Osoba z prawem (rozmowa 1:1 — każda strona; grupa/kanał — administrator rozmowy albo admin
-- aplikacji) tworzy link do połączeń danej rozmowy. Gość otwiera publiczną stronę
-- https://<kościół>.avenit.pl/rozmowa/<token>, podaje imię i prosi o wejście; domyślnie czeka
-- w poczekalni, aż ktoś z rozmowy go wpuści (albo link ma „wpuszczaj bez pytania”).
-- Gość dostaje krótki token LiveKit wyłącznie do pokoju bieżącego połączenia (tożsamość
-- guest:<losowe>) — bez czatu i bez żadnych innych danych.
--
-- call_guest_links — POZA rejestrem /api/db (token = sekret linku; tylko fn call-link-*).
-- call_guest_requests — prośby o wejście; odczyt przez /api/db i realtime tylko dla uczestników
-- rozmowy (komunikator.js — CONV_TABLES), zapis wyłącznie serwer (readOnly w registry);
-- secret_hash ukryty (hiddenColumns). Bez linków w rozmowach z osobą niepełnoletnią (serwer).
-- W pełni idempotentne.

CREATE TABLE IF NOT EXISTS call_guest_links (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    token            TEXT NOT NULL UNIQUE,
    created_by_email TEXT NOT NULL,
    auto_admit       BOOLEAN NOT NULL DEFAULT false,
    show_title       BOOLEAN NOT NULL DEFAULT false,
    max_uses         INTEGER,
    uses             INTEGER NOT NULL DEFAULT 0,
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked_at       TIMESTAMPTZ,
    revoked_by_email TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_guest_links_max_uses_check') THEN
        ALTER TABLE call_guest_links ADD CONSTRAINT call_guest_links_max_uses_check
            CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 500);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_call_guest_links_conv_097 ON call_guest_links (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS call_guest_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id          UUID NOT NULL REFERENCES call_guest_links(id) ON DELETE CASCADE,
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    call_id          UUID REFERENCES calls(id) ON DELETE SET NULL,
    guest_name       TEXT NOT NULL,
    identity         TEXT NOT NULL UNIQUE,          -- guest:<hex> — tożsamość w LiveKit
    secret_hash      TEXT NOT NULL,                 -- sha256 sekretu przeglądarki gościa
    status           TEXT NOT NULL DEFAULT 'pending',
    decided_by_email TEXT,                          -- e-mail wpuszczającego / 'auto'
    decided_at       TIMESTAMPTZ,
    joined_at        TIMESTAMPTZ,                   -- w pokoju (webhook LiveKit)
    left_at          TIMESTAMPTZ,
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_guest_requests_status_check') THEN
        ALTER TABLE call_guest_requests ADD CONSTRAINT call_guest_requests_status_check
            CHECK (status IN ('pending', 'admitted', 'denied', 'left', 'expired'));
    END IF;
END $$;
-- Poczekalnia rozmowy (oczekujący) i goście w pokoju połączenia.
CREATE INDEX IF NOT EXISTS idx_call_guest_requests_conv_097 ON call_guest_requests (conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_call_guest_requests_link_097 ON call_guest_requests (link_id, status);
CREATE INDEX IF NOT EXISTS idx_call_guest_requests_call_097 ON call_guest_requests (call_id) WHERE call_id IS NOT NULL;
