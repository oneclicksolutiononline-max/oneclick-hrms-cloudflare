-- =====================================================================
-- RCL ERP – HR module. Step 14 (18-11-2026): SECURITY – Phase 1 of the enterprise HRMS build.
-- Asked 18-11-2026 with the master prompt ("PART 16 – SECURITY AND PRIVACY … Resolve them before enabling sensitive workflows")
-- and his answers: a bank account change "मंजुरीला जाईल" (waits for a second person's approval, the employee is told by e-mail);
-- the nightly backup stays as it is; each company keeps its own HR database.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 13.
-- WHAT:  FOUR NEW tables, ONE new column with a default (hr_devices.key_hash – every phone of today keeps working), ONE small
--        index and ONE read-only function; the right to EMPTY (truncate) the "only added" tables is taken away from the server.
--        Nothing existing is deleted, no row of today is changed. Safe to run twice.
--   hr_bank_changes  – a change of an employee's bank details WAITS here until the HO HR or the Super Admin (never the one who
--                      asked) approves it; until then the old details stay in use. What the employee was told is kept with it.
--   hr_face_consents – the employee's "I agree" before his face is registered: which text (its version), in which language,
--                      from which phone, when. Only added.
--   hr_selfie_holds  – the punch photos of a person over some days KEPT beyond 90 days (a dispute, an investigation, a legal
--                      hold) – with who, when and why; released the same way.
--   hr_job_runs      – what a timed job did (the 90-day photo removal): when, how many, any fault. Counts only, no names.
--   hr_devices.key_hash – the phone's own secret key (only its fingerprint is kept): another phone that copies the phone's id
--                      cannot mark attendance. Empty for every phone of today until its app sends a key.
--   hr_selfies_due() – READS which punch photos are older than the cut-off and not held, not under review (the 90-day job
--                      removes them through the store; this function deletes nothing).
-- The 90-day removal runs only when he sets SELFIE_RETENTION_ENABLED=true (and CRON_SECRET) in Vercel – off until then.
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop function public.hr_selfies_due(timestamptz, integer);
--   drop table public.hr_job_runs, public.hr_selfie_holds, public.hr_face_consents, public.hr_bank_changes;
--   drop index if exists public.hr_punches_review_photo;  alter table public.hr_devices drop column key_hash;
--   (the right to empty, only if ever wanted back: grant truncate on public.hr_punches, … to service_role;)
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_asks') is null then raise exception 'Run sql/hr_step13_rulebook.sql first.'; end if;
  if to_regclass('public.hr_faces') is null then raise exception 'Run sql/hr_step9_faces.sql first.'; end if;
  if to_regclass('public.hr_punches') is null then raise exception 'Run sql/hr_step4_attendance.sql first.'; end if;
end $$;

-- a bank change that waits for approval (one waiting a person – a new one replaces it)
create table if not exists public.hr_bank_changes (
  id bigserial primary key, site text not null, employee_id uuid not null references public.hr_employees (id),
  new_bank jsonb not null,                                 -- the bank details as they will be (bank, IFSC, account, name as on bank)
  old_last4 text not null default '', new_last4 text not null default '',      -- the account's last four – for the record only
  source text not null default 'form' check (source in ('form', 'sheet')),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'refused', 'replaced')),
  asked_by text not null, asked_at timestamptz not null default now(),
  decided_by text not null default '', decided_at timestamptz, note text not null default '',
  mails jsonb not null default '[]'                        -- [{ what, at, sent, why }] – what the employee was told
);
create unique index if not exists hr_bank_changes_one_waiting on public.hr_bank_changes (employee_id) where status = 'waiting';
create index if not exists hr_bank_changes_site on public.hr_bank_changes (site, status, asked_at desc);

-- the employee's "I agree" before his face is registered (only added)
create table if not exists public.hr_face_consents (
  id bigserial primary key, employee_id uuid not null references public.hr_employees (id), site text not null,
  version text not null, lang text not null default 'en', device_id text not null default '', app text not null default '',
  given_by text not null, given_at timestamptz not null default now()
);
create index if not exists hr_face_consents_emp on public.hr_face_consents (employee_id, given_at desc);

-- punch photos kept beyond 90 days (a hold) – released with who, when and why
create table if not exists public.hr_selfie_holds (
  id bigserial primary key, site text not null, employee_id uuid not null references public.hr_employees (id),
  from_day date not null, to_day date not null, reason text not null,
  held_by text not null, held_at timestamptz not null default now(),
  released_by text not null default '', released_at timestamptz, release_reason text not null default '',
  check (to_day >= from_day)
);
create index if not exists hr_selfie_holds_emp on public.hr_selfie_holds (employee_id) where released_at is null;

-- what a timed job did
create table if not exists public.hr_job_runs (
  id bigserial primary key, job text not null, started_at timestamptz not null default now(), finished_at timestamptz,
  result jsonb not null default '{}'
);
create index if not exists hr_job_runs_job on public.hr_job_runs (job, started_at desc);

-- the phone's own key (its fingerprint) – empty for every phone of today
alter table public.hr_devices add column if not exists key_hash text not null default '';

-- a punch that waits for the HR Admin's review keeps its photo: found fast by its photo
create index if not exists hr_punches_review_photo on public.hr_punches (selfie_path) where status = 'review';

/* WHICH PUNCH PHOTOS ARE DUE for removal: older than p_before, not held, not of a punch that still waits for review. READS only –
 * the HR server removes the files through the store and the store's own rows go with them. The photos are named
 * <employee id>/<punch number>.jpg in the private bucket hr-selfies; a photo's day is its upload day (India time). */
create or replace function public.hr_selfies_due(p_before timestamptz, p_limit integer)
returns table (path text, employee_id text, day date)
language sql stable security definer set search_path = public, storage as $$
  select o.name, split_part(o.name, '/', 1), (o.created_at at time zone 'Asia/Kolkata')::date
  from storage.objects o
  where o.bucket_id = 'hr-selfies' and o.created_at < p_before
    and not exists (select 1 from public.hr_selfie_holds h
                    where h.released_at is null and h.employee_id::text = split_part(o.name, '/', 1)
                      and (o.created_at at time zone 'Asia/Kolkata')::date between h.from_day and h.to_day)
    and not exists (select 1 from public.hr_punches p
                    where p.status = 'review' and p.selfie_path = o.name
                      and not exists (select 1 from public.hr_punch_reviews r where r.punch_id = p.id))
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;
revoke all on function public.hr_selfies_due(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.hr_selfies_due(timestamptz, integer) to service_role;

do $$ declare t text; begin
  foreach t in array array['hr_bank_changes', 'hr_face_consents', 'hr_selfie_holds', 'hr_job_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update on public.hr_bank_changes, public.hr_selfie_holds, public.hr_job_runs to service_role;
grant select, insert on public.hr_face_consents to service_role;      -- only added – never changed, never deleted
/* (his live check of 18-11-2026: the "only added" tables also carried TRUNCATE – Supabase's default) emptying a whole table is taken
 * away from them; adding and reading stay exactly as they are. The HR server never empties a table. */
revoke truncate on public.hr_punches, public.hr_punch_reviews, public.hr_device_tries, public.hr_face_tries, public.hr_pay_settings,
  public.hr_pay_runs, public.hr_payslips, public.hr_face_consents from service_role;
do $$ declare q text; begin
  foreach q in array array['hr_bank_changes_id_seq', 'hr_face_consents_id_seq', 'hr_selfie_holds_id_seq', 'hr_job_runs_id_seq'] loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', q);
    execute format('grant usage, select on sequence public.%I to service_role', q);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'HR step 14 done · security tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('hr_bank_changes', 'hr_face_consents', 'hr_selfie_holds', 'hr_job_runs')) || ' of 4 · phone key '
  || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_devices' and column_name = 'key_hash')
  || ' of 1 · photo function ' || (select count(*) from pg_proc where proname = 'hr_selfies_due') || ' of 1' as result;
