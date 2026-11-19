-- =====================================================================
-- RCL ERP – HR module. Step 17 (18-11-2026): NOTIFICATIONS – Phase 4 of the enterprise HRMS.
-- Asked 18-11-2026 (the master prompt, Part 10) and his answers: WhatsApp for the shift reminders (four a shift, they stop once he
-- has signed in), the onboarding link, papers pending / running out, a policy to accept and a reporting-manager change; everything
-- else in the app and by e-mail.
-- WHERE: Supabase → project rcl-hr → SQL Editor → paste the whole file → Run. ONLY in rcl-hr. After step 16.
-- WHAT:  TWO NEW tables. Nothing existing is deleted, no row of today is changed. Safe to run twice.
--   hr_notify_queue  – every message to a person: WhatsApp, e-mail or the app's own list – what kind, to whom, its words' parts,
--                      when it may go, how it went (queued / sent / delivered / read / failed / skipped / cancelled). The same
--                      message is never made twice (its "dedupe" key). Messages are only added and their state is moved on.
--   hr_notify_events – what WhatsApp said later of a message (delivered, read, failed) – from its webhook. Only added.
-- Nothing is sent until he switches it on in Vercel (HR_NOTIFY_ENABLED=true; WhatsApp also HR_WHATSAPP_ENABLED=true with the
-- templates Meta approved) and the site's shift reminders are switched on in HR (Notifications page).
-- The timer that sends them every few minutes is a separate, optional file: sql/hr_step17b_timer.sql (Supabase's own timer).
-- Every table is for the HR server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.hr_notify_events, public.hr_notify_queue;
-- =====================================================================
do $$ begin
  if to_regclass('public.hr_doc_overrides') is null then raise exception 'Run sql/hr_step16_attendance.sql first.'; end if;
end $$;

create table if not exists public.hr_notify_queue (
  id bigserial primary key, site text not null, employee_id uuid references public.hr_employees (id),
  channel text not null check (channel in ('whatsapp', 'email', 'app')),
  kind text not null, lang text not null default 'en', to_addr text not null default '',
  title text not null default '', body text not null default '', params jsonb not null default '{}',
  dedupe text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled')),
  attempts integer not null default 0, next_at timestamptz not null default now(), sent_at timestamptz, provider_id text not null default '',
  error text not null default '', seen_at timestamptz, created_by text not null default '', created_at timestamptz not null default now()
);
create index if not exists hr_notify_queue_due on public.hr_notify_queue (next_at) where status = 'queued';
create index if not exists hr_notify_queue_emp on public.hr_notify_queue (employee_id, created_at desc);
create index if not exists hr_notify_queue_site on public.hr_notify_queue (site, created_at desc);
create index if not exists hr_notify_queue_provider on public.hr_notify_queue (provider_id) where provider_id <> '';

create table if not exists public.hr_notify_events (
  id bigserial primary key, queue_id bigint references public.hr_notify_queue (id), provider_id text not null default '',
  status text not null, at timestamptz not null default now(), detail jsonb not null default '{}'
);
create index if not exists hr_notify_events_q on public.hr_notify_events (queue_id);

do $$ declare t text; begin
  foreach t in array array['hr_notify_queue', 'hr_notify_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update on public.hr_notify_queue to service_role;
grant select, insert on public.hr_notify_events to service_role;      -- only added
revoke truncate on public.hr_notify_queue, public.hr_notify_events from service_role;
do $$ declare q text; begin
  foreach q in array array['hr_notify_queue_id_seq', 'hr_notify_events_id_seq'] loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', q);
    execute format('grant usage, select on sequence public.%I to service_role', q);
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'HR step 17 done · new tables ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('hr_notify_queue', 'hr_notify_events')) || ' of 2' as result;
