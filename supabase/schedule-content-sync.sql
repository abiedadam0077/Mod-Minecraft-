-- Run only AFTER deploying content-hub. No keys belong in this file or Git.
-- In Supabase Vault create craftly_cron_secret matching Edge Function CRAFTLY_CRON_SECRET.
-- Set craftly_project_url in Vault to your project's HTTPS URL.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='craftly-content-sync';
select cron.schedule('craftly-content-sync','*/10 * * * *',$$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='craftly_project_url' limit 1)||'/functions/v1/content-hub',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='craftly_cron_secret' limit 1)),
  body := '{"action":"tick"}'::jsonb,timeout_milliseconds:=120000);
$$);
