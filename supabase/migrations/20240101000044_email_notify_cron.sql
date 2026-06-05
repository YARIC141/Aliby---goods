-- pg_cron job: send renewal email 3 days before charge
-- Edge function tbank-platform-charge already handles charging at end_date.
-- This job runs at 07:00 UTC daily and calls a separate email-notify endpoint.
SELECT cron.schedule(
  'platform-sub-email-notify',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://alliby.ru/functions/v1/tbank-platform-notify-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer platcharge2026'
      ),
      body    := '{}'::jsonb
    );
  $$
);
