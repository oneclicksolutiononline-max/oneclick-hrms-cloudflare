-- =====================================================================
-- RCL ERP – HR module. Step 15 (18-11-2026): THE EMPLOYEE MASTER, DOCUMENTS, ONBOARDING, POLICIES – Phase 2 of the enterprise HRMS.
-- Asked 18-11-2026 (the master prompt, Parts 3–8) and his answers: all remaining phases built together; the seven-day rule for
-- Staff only; the onboarding link, documents, policy acceptance and a reporting change also go on WhatsApp.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 14.
-- WHAT:  NINE NEW tables; NEW columns with defaults on hr_employee_docs and hr_place_people (every row of today keeps working:
--        a paper of today reads "submitted", a work place of today is for IN and OUT with no dates); the list of paper kinds gets two
--        more (caste certificate, medical insurance); the server may now SET the dates / IN-OUT of a work place given to a person
--        (update on hr_place_people). Nothing existing is deleted, no row of today is changed. Safe to run twice.
--   hr_doc_events     – what happened to a paper: verified, rejected (why), asked again, replaced (old → new), not applicable. Only added.
--   hr_doc_na         – a paper that does not apply to a person (e.g. no driving licence for a non-driver) – with who, when, why.
--   hr_reporting      – a person's reporting managers WITH DATES: one primary (also kept in hr_employees.reports_to as today) and
--                       more with their role; the old ones stay with their end date.
--   hr_insurance      – the medical insurance (mediclaim) of a person and its verification.
--   hr_invites        – an onboarding link: a random, single-use, expiring code (only its fingerprint is kept); what the new
--                       employee fills waits here until the HR office verifies it. Opening the link never makes a sign-in.
--   hr_email_checks   – a link sent to a person's e-mail; opened, his e-mail is verified (the activation needs it).
--   hr_cpolicies, hr_cpolicy_versions, hr_cpolicy_accepts – the company's policies (documents to read and accept), their versions
--                       and who accepted which version when. Apart from the Rule Book (which holds the attendance / leave rules).
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.hr_cpolicy_accepts, public.hr_cpolicy_versions, public.hr_cpolicies,
--   public.hr_email_checks, public.hr_invites, public.hr_insurance, public.hr_reporting, public.hr_doc_na, public.hr_doc_events;
--   alter table public.hr_employee_docs drop column status, drop column issued_on, drop column verified_by, drop column verified_at,
--   drop column verify_note, drop column replaces;  alter table public.hr_place_people drop column valid_from, drop column valid_to,
--   drop column can_in, drop column can_out;  (the kinds: the check of step 3 again)
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_bank_changes') is null then raise exception 'Run sql/hr_step14_security.sql first.'; end if;
end $$;

-- a paper's state, the day it was issued, who verified it, which paper it replaced
alter table public.hr_employee_docs add column if not exists status text not null default 'submitted';
alter table public.hr_employee_docs add column if not exists issued_on date;
alter table public.hr_employee_docs add column if not exists verified_by text not null default '';
alter table public.hr_employee_docs add column if not exists verified_at timestamptz;
alter table public.hr_employee_docs add column if not exists verify_note text not null default '';
alter table public.hr_employee_docs add column if not exists replaces uuid references public.hr_employee_docs (id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hr_employee_docs_status_check') then
    alter table public.hr_employee_docs add constraint hr_employee_docs_status_check check (status in ('submitted', 'under_verification', 'verified', 'rejected'));
  end if;
  -- two more kinds of paper (the check of step 3 is made wider – every paper of today stays allowed)
  if exists (select 1 from pg_constraint where conname = 'hr_employee_docs_kind_check' and pg_get_constraintdef(oid) not like '%insurance%') then
    alter table public.hr_employee_docs drop constraint hr_employee_docs_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_employee_docs_kind_check') then
    alter table public.hr_employee_docs add constraint hr_employee_docs_kind_check check (kind in ('photo', 'aadhaar', 'pan', 'education', 'licence', 'bank_passbook', 'salary_slip', 'experience', 'other', 'caste', 'insurance'));
  end if;
end $$;

create table if not exists public.hr_doc_events (
  id bigserial primary key, doc_id uuid references public.hr_employee_docs (id), employee_id uuid not null references public.hr_employees (id), site text not null,
  kind text not null default '', event text not null check (event in ('uploaded', 'verified', 'rejected', 'reupload_asked', 'replaced', 'not_applicable', 'applicable')),
  note text not null default '', by text not null, at timestamptz not null default now()
);
create index if not exists hr_doc_events_emp on public.hr_doc_events (employee_id, at desc);

create table if not exists public.hr_doc_na (
  employee_id uuid not null references public.hr_employees (id), kind text not null, reason text not null default '',
  by text not null, at timestamptz not null default now(), active boolean not null default true,
  primary key (employee_id, kind)
);

-- a person's reporting managers with dates (the primary one is also hr_employees.reports_to, as today)
create table if not exists public.hr_reporting (
  id bigserial primary key, employee_id uuid not null references public.hr_employees (id), manager_id uuid not null references public.hr_employees (id),
  role text not null default 'primary', primary_one boolean not null default false,
  valid_from date not null, valid_to date, note text not null default '',
  created_by text not null, created_at timestamptz not null default now(), ended_by text not null default '',
  check (employee_id <> manager_id), check (valid_to is null or valid_to >= valid_from)
);
create index if not exists hr_reporting_emp on public.hr_reporting (employee_id) where valid_to is null;
create index if not exists hr_reporting_mgr on public.hr_reporting (manager_id) where valid_to is null;

-- a work place given to a person: from / to, and whether he may mark IN, OUT, or both there (today: both, no dates)
alter table public.hr_place_people add column if not exists valid_from date;
alter table public.hr_place_people add column if not exists valid_to date;
alter table public.hr_place_people add column if not exists can_in boolean not null default true;
alter table public.hr_place_people add column if not exists can_out boolean not null default true;
grant update on public.hr_place_people to service_role;      -- (its dates and IN / OUT are set; step 4 gave only add / read / take back)

create table if not exists public.hr_insurance (
  employee_id uuid primary key references public.hr_employees (id), site text not null, applicable boolean not null default false,
  provider text not null default '', policy_no text not null default '', employee_cover text not null default '', dependent_cover text not null default '',
  start_on date, expires_on date, sum_insured numeric(14,2),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_verification', 'verified', 'rejected', 'expired')),
  verified_by text not null default '', verified_at timestamptz, note text not null default '',
  updated_by text not null default '', updated_at timestamptz not null default now()
);

-- an onboarding link (only the fingerprint of its code is kept)
create table if not exists public.hr_invites (
  id uuid primary key default gen_random_uuid(), site text not null, token_hash text not null unique,
  employee_id uuid references public.hr_employees (id), prefill jsonb not null default '{}',
  status text not null default 'sent' check (status in ('draft', 'sent', 'in_progress', 'submitted', 'under_verification', 'rejected', 'approved', 'active', 'cancelled', 'expired')),
  expires_at timestamptz not null, sends integer not null default 1, last_sent_at timestamptz not null default now(),
  opened_at timestamptz, submitted_at timestamptz, submission jsonb not null default '{}', accepts jsonb not null default '[]',
  email_verified_at timestamptz, from_ip text not null default '', from_agent text not null default '',
  decided_by text not null default '', decided_at timestamptz, reject_reason text not null default '',
  created_by text not null, created_at timestamptz not null default now()
);
create index if not exists hr_invites_site on public.hr_invites (site, status, created_at desc);

-- a link that verifies a person's e-mail (only its fingerprint is kept)
create table if not exists public.hr_email_checks (
  id bigserial primary key, token_hash text not null unique, email text not null,
  employee_id uuid references public.hr_employees (id), invite_id uuid references public.hr_invites (id),
  expires_at timestamptz not null, used_at timestamptz, created_by text not null, created_at timestamptz not null default now()
);

-- the company's policies – documents to read and accept (apart from the Rule Book)
create table if not exists public.hr_cpolicies (
  id bigserial primary key, title text not null, category text not null default '', mandatory boolean not null default true,
  scope jsonb not null default '{"all": true}', active boolean not null default true,
  created_by text not null, created_at timestamptz not null default now(), updated_by text not null default '', updated_at timestamptz
);
create table if not exists public.hr_cpolicy_versions (
  id bigserial primary key, policy_id bigint not null references public.hr_cpolicies (id), version integer not null,
  body text not null default '', file_path text not null default '', effective_from date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by text not null, created_at timestamptz not null default now(), published_by text not null default '', published_at timestamptz,
  unique (policy_id, version)
);
create table if not exists public.hr_cpolicy_accepts (
  id bigserial primary key, version_id bigint not null references public.hr_cpolicy_versions (id), employee_id uuid references public.hr_employees (id),
  invite_id uuid references public.hr_invites (id), via text not null default 'app' check (via in ('app', 'web', 'onboarding')),
  device text not null default '', accepted_at timestamptz not null default now(), unique (version_id, employee_id)
);

do $$ declare t text; begin
  foreach t in array array['hr_doc_events', 'hr_doc_na', 'hr_reporting', 'hr_insurance', 'hr_invites', 'hr_email_checks', 'hr_cpolicies', 'hr_cpolicy_versions', 'hr_cpolicy_accepts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update on public.hr_doc_na, public.hr_reporting, public.hr_insurance, public.hr_invites, public.hr_email_checks, public.hr_cpolicies, public.hr_cpolicy_versions to service_role;
grant select, insert on public.hr_doc_events, public.hr_cpolicy_accepts to service_role;      -- only added – never changed, never deleted
grant delete on public.hr_cpolicy_versions to service_role;      -- only a DRAFT version (the server checks it)
grant delete on public.hr_reporting, public.hr_doc_na to service_role;      -- only the rows of an employee deleted as added by mistake (api/hr.js empDelete – nothing hangs on him)
revoke truncate on public.hr_doc_events, public.hr_cpolicy_accepts from service_role;
do $$ declare q text; begin
  foreach q in array array['hr_doc_events_id_seq', 'hr_reporting_id_seq', 'hr_email_checks_id_seq', 'hr_cpolicies_id_seq', 'hr_cpolicy_versions_id_seq', 'hr_cpolicy_accepts_id_seq'] loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', q);
    execute format('grant usage, select on sequence public.%I to service_role', q);
  end loop;
end $$;

-- the reporting of today goes into the new list once (the primary manager, from the day the list starts) – nothing of today changes
insert into public.hr_reporting (employee_id, manager_id, role, primary_one, valid_from, note, created_by)
select e.id, e.reports_to, 'primary', true, coalesce(e.joined_on, current_date), 'from the Employee Master (step 15)', 'step15'
from public.hr_employees e
where e.reports_to is not null and e.reports_to <> e.id
  and not exists (select 1 from public.hr_reporting r where r.employee_id = e.id and r.primary_one and r.valid_to is null);

notify pgrst, 'reload schema';
select 'HR step 15 done · new tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('hr_doc_events', 'hr_doc_na', 'hr_reporting', 'hr_insurance', 'hr_invites', 'hr_email_checks', 'hr_cpolicies', 'hr_cpolicy_versions', 'hr_cpolicy_accepts')) || ' of 9 · paper columns '
  || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_employee_docs' and column_name in ('status', 'issued_on', 'verified_by', 'verified_at', 'verify_note', 'replaces')) || ' of 6 · place columns '
  || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_place_people' and column_name in ('valid_from', 'valid_to', 'can_in', 'can_out')) || ' of 4' as result;
