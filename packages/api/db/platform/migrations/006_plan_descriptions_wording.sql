-- 006: Opisy planów bez słowa „zbór” — Avenit jest głównie dla kościołów protestanckich
-- i w tekstach używamy „kościół” / „wspólnota”. Podmieniamy tylko dokładną starą treść
-- (opis zmieniony ręcznie w panelu admina zostaje). Idempotentne.
UPDATE subscription_plans SET description = 'Dla małej wspólnoty, która chce uporządkować niedzielę i ludzi.'
 WHERE slug = 'start' AND description = 'Dla małego zboru, który chce uporządkować niedzielę i ludzi.';
UPDATE subscription_plans SET description = 'Dla kościoła z kilkoma służbami, grupami domowymi i szkółką.'
 WHERE slug = 'wspolnota' AND description = 'Dla zboru z kilkoma służbami, grupami domowymi i szkółką.';
UPDATE subscription_plans SET description = 'Wycena indywidualna: kampusy, wdrożenie dla wielu kościołów i priorytetowe wsparcie.'
 WHERE slug = 'siec' AND description = 'Wycena indywidualna: kampusy, wdrożenie dla wielu zborów i priorytetowe wsparcie.';
