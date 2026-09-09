-- 031: Jednorazowość captchy rejestracji. Token (exp.hmac) jest bezstanowy; tu zapamiętujemy
-- zużyte tokeny, żeby nie dało się przepuścić wielu rejestracji jednym rozwiązanym captchą.
CREATE TABLE IF NOT EXISTS used_captchas (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_used_captchas_expires ON used_captchas(expires_at);
