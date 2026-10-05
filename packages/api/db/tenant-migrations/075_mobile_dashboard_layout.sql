-- 075: układ pulpitu w aplikacji mobilnej (per użytkownik).
-- Kolumna `layout` należy do weba (lista widżetów weba) — mobilka trzyma własny układ
-- (sekcje, ich kolejność i widoczność, elementy „Dla Ciebie” / „Twoje moduły”) obok,
-- w tym samym wierszu użytkownika (UNIQUE user_email). Zapis z telefonu nie rusza weba.

ALTER TABLE IF EXISTS user_dashboard_layouts ADD COLUMN IF NOT EXISTS mobile_layout jsonb;
