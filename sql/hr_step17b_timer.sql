-- =====================================================================
-- RCL ERP – HR module. Step 17b (18-11-2026, OPTIONAL): THE TIMER THAT SENDS THE MESSAGES – every 5 minutes.
-- Why here and not in Vercel: Vercel's own timer runs at most once a day on the Hobby plan; the shift reminders need minutes.
-- Supabase's own timer (pg_cron) asks the HR server's /api/jobs?job=notify every 5 minutes; the HR server does the work.
-- BEFORE running this file (once, in the rcl-hr Supabase dashboard – never in a file, never in chat):
--   1. Project Settings → Vault → "Add new secret":  name  hr_cron_secret   value = the same text as CRON_SECRET in HR Vercel
--   2. Vault → "Add new secret":                      name  hr_jobs_url      value = the HR address + /api/jobs
--                                                      (e.g. https://lion.sketchline.si/hr/api/jobs)
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. After step 17. Safe to run twice (the same timer).
-- WHAT:  switches on two Supabase extensions (pg_cron – the timer, pg_net – the web call) and puts ONE timer. No table of HR changes.
-- Stop it: select cron.unschedule('hr-notify-every-5-min');
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if (select count(*) from vault.decrypted_secrets where name in ('hr_cron_secret', 'hr_jobs_url')) < 2 then
    raise exception 'First put the two Vault secrets hr_cron_secret and hr_jobs_url (see the top of this file).';
  end if;
end $$;
select cron.schedule('hr-notify-every-5-min', '*/5 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'hr_jobs_url') || '?job=notify',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hr_cron_secret')),
    timeout_milliseconds := 55000);
$job$);
select 'HR step 17b done · timer ' || (select count(*) from cron.job where jobname = 'hr-notify-every-5-min') || ' of 1' as result;
