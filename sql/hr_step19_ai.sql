-- =====================================================================
-- RCL ERP – HR module. Step 19 (18-11-2026): AI – Phase 7 of the enterprise HRMS.
-- Asked 18-11-2026 (the master prompt, Part 17): one AI door whatever the provider; every call logged with its cost; AI never
-- approves or changes pay, bank details, faces or attendance.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 18.
-- WHAT:  ONE NEW table. Nothing existing is changed. Safe to run twice.
--   hr_ai_runs – one line per AI call: when, who, what for, provider, model, tokens, cost (USD), time, ok / why not. NEVER the
--                question, the paper or the answer. Only added (no change, no delete).
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.hr_ai_runs;
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_pay_structures') is null then raise exception 'Run sql/hr_step18_payroll.sql first.'; end if;
end $$;

create table if not exists public.hr_ai_runs (
  id bigserial primary key, at timestamptz not null default now(), site text not null default '', by text not null,
  purpose text not null, provider text not null, model text not null default '',
  tokens_in integer not null default 0, tokens_out integer not null default 0, cost_usd numeric(12, 6) not null default 0,
  ms integer not null default 0, ok boolean not null default false, error text not null default ''
);
create index if not exists hr_ai_runs_at on public.hr_ai_runs (at desc);

alter table public.hr_ai_runs enable row level security;
revoke all on public.hr_ai_runs from public, anon, authenticated;
grant select, insert on public.hr_ai_runs to service_role;      -- only added
revoke truncate on public.hr_ai_runs from service_role;
revoke all on sequence public.hr_ai_runs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.hr_ai_runs_id_seq to service_role;

notify pgrst, 'reload schema';
select 'HR step 19 done · new tables ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'hr_ai_runs') || ' of 1' as result;
