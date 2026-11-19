-- =====================================================================
-- RCL ERP – HR module. Step 18 (18-11-2026): PAYROLL – Phase 5 of the enterprise HRMS.
-- Asked 18-11-2026 (the master prompt, Part 12): salary structures with versions; the statutory numbers with their source and
-- date, checked by his CA; the employee's and the employer's shares; Hold / Rejected / Approved / Ready / Paid with the payment;
-- the full & final settlement; the registers; the present method beside the new one, line by line.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 17.
-- WHAT:  SIX NEW tables and THREE new columns with defaults on hr_pay_emp (every person of today keeps his pay exactly as it is:
--        no structure, no LWF, no TDS). Nothing existing is deleted, no row of today is changed. Safe to run twice.
--   hr_pay_structures, hr_pay_structure_versions – a salary structure (Basic, HRA, … as a % of the pay) with versions from a date;
--                      a version counts only after another person of the HO HR (or the Super Admin) approved it.
--   hr_pay_checks    – his CA's check of a version of the statutory numbers (who, when, what he said). Only added.
--   hr_pay_release   – where a locked payslip stands: approved → ready → paid; or held / rejected (why). Only added (the newest
--                      row is where it stands).
--   hr_pay_payments  – a payment of a payslip: how (bank / cash / cheque / UPI), its reference, the day. Only added.
--   hr_fnf           – a relieved person's full & final settlement: its lines, made → checked → approved → paid, never by one person.
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.hr_fnf, public.hr_pay_payments, public.hr_pay_release,
--   public.hr_pay_checks, public.hr_pay_structure_versions, public.hr_pay_structures (after: alter table public.hr_pay_emp
--   drop column structure_id, drop column lwf, drop column tds_monthly);
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_notify_queue') is null then raise exception 'Run sql/hr_step17_notify.sql first.'; end if;
  if to_regclass('public.hr_payslips') is null then raise exception 'Run sql/hr_step12_payroll.sql first.'; end if;
end $$;

create table if not exists public.hr_pay_structures (
  id bigserial primary key, name text not null unique, note text not null default '', active boolean not null default true,
  created_by text not null, created_at timestamptz not null default now()
);
create table if not exists public.hr_pay_structure_versions (
  id bigserial primary key, structure_id bigint not null references public.hr_pay_structures (id), version integer not null,
  valid_from date not null, parts jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_by text not null, created_at timestamptz not null default now(), approved_by text not null default '', approved_at timestamptz,
  unique (structure_id, version)
);
alter table public.hr_pay_emp add column if not exists structure_id bigint references public.hr_pay_structures (id);
alter table public.hr_pay_emp add column if not exists lwf boolean not null default false;
alter table public.hr_pay_emp add column if not exists tds_monthly numeric(12, 2) not null default 0;

create table if not exists public.hr_pay_checks (
  id bigserial primary key, settings_id bigint not null references public.hr_pay_settings (id), checked_by text not null,
  checked_at timestamptz not null default now(), note text not null default ''
);
create table if not exists public.hr_pay_release (
  id bigserial primary key, payslip_id bigint not null references public.hr_payslips (id),
  status text not null check (status in ('approved', 'ready', 'paid', 'hold', 'rejected')), note text not null default '',
  by text not null, at timestamptz not null default now()
);
create index if not exists hr_pay_release_slip on public.hr_pay_release (payslip_id, id desc);
create table if not exists public.hr_pay_payments (
  id bigserial primary key, payslip_id bigint not null references public.hr_payslips (id), amount numeric(12, 2) not null,
  mode text not null check (mode in ('bank', 'cash', 'cheque', 'upi')), ref text not null default '', paid_on date not null,
  by text not null, at timestamptz not null default now()
);
create index if not exists hr_pay_payments_slip on public.hr_pay_payments (payslip_id);
create table if not exists public.hr_fnf (
  id bigserial primary key, employee_id uuid not null references public.hr_employees (id), site text not null, last_day date not null,
  lines jsonb not null default '[]', net numeric(12, 2) not null default 0,
  status text not null default 'made' check (status in ('made', 'checked', 'approved', 'paid', 'cancelled')),
  made_by text not null, made_at timestamptz not null default now(), checked_by text not null default '', checked_at timestamptz,
  approved_by text not null default '', approved_at timestamptz, paid_mode text not null default '', paid_ref text not null default '', paid_on date,
  note text not null default '', updated_at timestamptz not null default now()
);
create unique index if not exists hr_fnf_one_open on public.hr_fnf (employee_id) where status <> 'cancelled';

do $$ declare t text; begin
  foreach t in array array['hr_pay_structures', 'hr_pay_structure_versions', 'hr_pay_checks', 'hr_pay_release', 'hr_pay_payments', 'hr_fnf'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update on public.hr_pay_structures, public.hr_pay_structure_versions, public.hr_fnf to service_role;
grant delete on public.hr_pay_structure_versions to service_role;      -- only a DRAFT version (the server checks it)
grant select, insert on public.hr_pay_checks, public.hr_pay_release, public.hr_pay_payments to service_role;      -- only added
revoke truncate on public.hr_pay_checks, public.hr_pay_release, public.hr_pay_payments from service_role;
do $$ declare q text; begin
  foreach q in array array['hr_pay_structures_id_seq', 'hr_pay_structure_versions_id_seq', 'hr_pay_checks_id_seq', 'hr_pay_release_id_seq', 'hr_pay_payments_id_seq', 'hr_fnf_id_seq'] loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', q);
    execute format('grant usage, select on sequence public.%I to service_role', q);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'HR step 18 done · new tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('hr_pay_structures', 'hr_pay_structure_versions', 'hr_pay_checks', 'hr_pay_release', 'hr_pay_payments', 'hr_fnf')) || ' of 6 · pay columns '
  || (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_pay_emp' and column_name in ('structure_id', 'lwf', 'tds_monthly')) || ' of 3' as result;
