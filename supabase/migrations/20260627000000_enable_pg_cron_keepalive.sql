-- Enable pg_cron extension (built into Supabase, runs in the pg_catalog schema)
create extension if not exists pg_cron with schema pg_catalog;

-- Grant usage so the postgres role can schedule jobs
grant usage on schema cron to postgres;

-- Schedule a daily no-op query at 10:00 UTC to prevent inactivity pause
select cron.schedule(
  'supabase-keepalive',     -- job name
  '0 10 * * *',             -- daily at 10:00 UTC
  $$select 1$$              -- lightweight query, just wakes the DB
);
