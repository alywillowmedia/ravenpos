-- Retry weekly employee schedule email cron setup after configuring app.settings values.
-- Safe to run multiple times.

DO $$
DECLARE
  supabase_url TEXT := current_setting('app.settings.supabase_url', true);
  cron_secret TEXT := current_setting('app.settings.employee_schedule_cron_secret', true);
  endpoint_url TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron extension not installed; skipping employee weekly email cron setup.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension not installed; skipping employee weekly email cron setup.';
    RETURN;
  END IF;

  IF supabase_url IS NULL OR supabase_url = '' OR cron_secret IS NULL OR cron_secret = '' THEN
    RAISE NOTICE 'Missing app.settings.supabase_url or app.settings.employee_schedule_cron_secret; skipping cron setup.';
    RETURN;
  END IF;

  endpoint_url := rtrim(supabase_url, '/') || '/functions/v1/send-employee-weekly-schedules';

  BEGIN
    PERFORM cron.unschedule('employee-weekly-schedule-email');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'employee-weekly-schedule-email',
    '0 14 * * 6',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      ) AS request_id;
      $sql$,
      endpoint_url,
      'Bearer ' || cron_secret
    )
  );
END $$;
