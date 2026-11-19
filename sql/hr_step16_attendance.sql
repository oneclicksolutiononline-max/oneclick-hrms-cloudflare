-- =====================================================================
-- RCL ERP – HR module. Step 16 (18-11-2026): ATTENDANCE & COMPLIANCE – Phase 3 of the enterprise HRMS.
-- Asked 18-11-2026 (the master prompt, Parts 9–11) and his answer: the seven-day document rule is for STAFF only.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 15.
-- WHAT:  ONE NEW table. Nothing existing is deleted, no row of today is changed. Safe to run twice.
--   hr_doc_overrides – the HR Admin / Super Admin lets a person keep using "My HR" up to a day although his papers are not all
--                      there yet (the seven-day rule) – with the reason, who and when; ended early the same way. Only one open a
--                      person. The rule itself is a setting (hr_settings, key "doc_rule") – OFF until the Super Admin turns it on.
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.hr_doc_overrides;
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_doc_na') is null then raise exception 'Run sql/hr_step15_employee.sql first.'; end if;
end $$;

create table if not exists public.hr_doc_overrides (
  id bigserial primary key, employee_id uuid not null references public.hr_employees (id), site text not null,
  until date not null, reason text not null,
  given_by text not null, given_at timestamptz not null default now(),
  ended_by text not null default '', ended_at timestamptz, end_reason text not null default ''
);
create unique index if not exists hr_doc_overrides_one_open on public.hr_doc_overrides (employee_id) where ended_at is null;

alter table public.hr_doc_overrides enable row level security;
revoke all on public.hr_doc_overrides from public, anon, authenticated;
grant select, insert, update on public.hr_doc_overrides to service_role;
revoke all on sequence public.hr_doc_overrides_id_seq from public, anon, authenticated;
grant usage, select on sequence public.hr_doc_overrides_id_seq to service_role;

notify pgrst, 'reload schema';
select 'HR step 16 done · new tables ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'hr_doc_overrides') || ' of 1' as result;
