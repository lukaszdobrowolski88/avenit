-- pg_cron + pg_net dla push-campaign-dispatch.
-- Wymaga włączonych rozszerzeń: pg_cron, pg_net (Database → Extensions / Postgres Modules).
--
-- UWAGA: service_role_key jest wstawiany bezpośrednio w body cron joba. To jedyny sposób
-- w Supabase Cloud (rola `postgres` nie ma uprawnień do `ALTER DATABASE ... SET app.*`).
-- Klucz będzie widoczny w `cron.job` dla każdego z dostępem do bazy (adminowie projektu),
-- co jest akceptowalnym ryzykiem (i tak mają service_role w panelu).
--
-- Zamień <SERVICE_ROLE_KEY> na klucz z:
--   Dashboard → Settings → API → service_role
-- URL ustawiony jest na hostowanego klienta tego projektu.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron extension is NOT enabled. Włącz w Dashboard → Database → Extensions.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net extension is NOT enabled. Włącz w Dashboard → Database → Extensions.';
  END IF;
END $$;

-- Idempotentne: usuń istniejące joby zanim je założysz.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-campaign-dispatch') THEN
    PERFORM cron.unschedule('push-campaign-dispatch');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-campaign-receipts') THEN
    PERFORM cron.unschedule('push-campaign-receipts');
  END IF;
END $$;

-- Worker: dispatch — co minutę.
SELECT cron.schedule(
  'push-campaign-dispatch',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://imsizofhgmbhpozyxggs.supabase.co/functions/v1/push-campaign-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Worker: receipts — co 5 minut.
SELECT cron.schedule(
  'push-campaign-receipts',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://imsizofhgmbhpozyxggs.supabase.co/functions/v1/push-campaign-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Weryfikacja:
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'push-%';
