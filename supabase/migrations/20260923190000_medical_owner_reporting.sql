-- Basmat Medical CMMS
-- Professional Owner Reporting + Archive + Print/Sent/Acknowledged History
-- Idempotent combined migration

begin;

create table if not exists public.bf_owner_report_branding(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id) on delete cascade,
 contract_id uuid not null references public.bf_contracts(id) on delete cascade,
 project_name_ar text,
 project_name_en text,
 owner_name_ar text,
 owner_name_en text,
 contractor_name_ar text,
 contractor_name_en text,
 owner_logo_data text,
 contractor_logo_data text,
 primary_color text not null default '#0b2b4b',
 secondary_color text not null default '#b8892d',
 prepared_by text,
 reviewed_by text,
 approved_by text,
 report_prefix text not null default 'MED',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(contract_id)
);

create table if not exists public.bf_owner_report_runs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id) on delete cascade,
 contract_id uuid not null references public.bf_contracts(id) on delete cascade,
 report_type text not null check(report_type in('weekly','monthly','annual')),
 period_start date not null,
 period_end date not null,
 report_number text not null unique,
 revision text not null default '00',
 status text not null default 'final',
 title_ar text,
 title_en text,
 snapshot jsonb not null default '{}'::jsonb,
 branding_snapshot jsonb not null default '{}'::jsonb,
 generated_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);

alter table public.bf_owner_report_runs
 add column if not exists distribution_status text not null default 'final',
 add column if not exists print_count integer not null default 0,
 add column if not exists last_printed_at timestamptz,
 add column if not exists sent_at timestamptz,
 add column if not exists sent_to text,
 add column if not exists acknowledged_at timestamptz;

do $$
begin
 if not exists (
  select 1 from pg_constraint
  where conname='bf_owner_report_runs_distribution_status_check'
 ) then
  alter table public.bf_owner_report_runs
   add constraint bf_owner_report_runs_distribution_status_check
   check(distribution_status in('final','printed','sent','acknowledged'));
 end if;
end $$;

create table if not exists public.bf_owner_report_events(
 id uuid primary key default gen_random_uuid(),
 report_run_id uuid not null references public.bf_owner_report_runs(id) on delete cascade,
 action text not null check(action in('printed','sent','acknowledged')),
 recipient text,
 notes text,
 actor_id uuid default auth.uid(),
 created_at timestamptz not null default now()
);

create index if not exists bf_owner_report_runs_contract_period
 on public.bf_owner_report_runs(contract_id,period_start desc,period_end desc);
create index if not exists bf_owner_report_events_run_created
 on public.bf_owner_report_events(report_run_id,created_at desc);

alter table public.bf_owner_report_branding enable row level security;
alter table public.bf_owner_report_runs enable row level security;
alter table public.bf_owner_report_events enable row level security;

drop policy if exists bf_owner_report_branding_read on public.bf_owner_report_branding;
create policy bf_owner_report_branding_read on public.bf_owner_report_branding
 for select to authenticated
 using (public.bf4_staff(organization_id,'reports.view'));

drop policy if exists bf_owner_report_branding_write on public.bf_owner_report_branding;
create policy bf_owner_report_branding_write on public.bf_owner_report_branding
 for all to authenticated
 using (public.bf4_staff(organization_id,'reports.view'))
 with check (public.bf4_staff(organization_id,'reports.view'));

drop policy if exists bf_owner_report_runs_read on public.bf_owner_report_runs;
create policy bf_owner_report_runs_read on public.bf_owner_report_runs
 for select to authenticated
 using (public.bf4_staff(organization_id,'reports.view'));

drop policy if exists bf_owner_report_runs_insert on public.bf_owner_report_runs;
create policy bf_owner_report_runs_insert on public.bf_owner_report_runs
 for insert to authenticated
 with check (public.bf4_staff(organization_id,'reports.view'));

drop policy if exists bf_owner_report_runs_write on public.bf_owner_report_runs;
drop policy if exists bf_owner_report_runs_update on public.bf_owner_report_runs;
create policy bf_owner_report_runs_update on public.bf_owner_report_runs
 for update to authenticated
 using (public.bf4_staff(organization_id,'reports.view'))
 with check (public.bf4_staff(organization_id,'reports.view'));

drop policy if exists bf_owner_report_events_read on public.bf_owner_report_events;
create policy bf_owner_report_events_read on public.bf_owner_report_events
 for select to authenticated
 using (
  exists(
   select 1 from public.bf_owner_report_runs r
   where r.id=report_run_id
   and public.bf4_staff(r.organization_id,'reports.view')
  )
 );

drop policy if exists bf_owner_report_events_write on public.bf_owner_report_events;
create policy bf_owner_report_events_write on public.bf_owner_report_events
 for insert to authenticated
 with check (
  exists(
   select 1 from public.bf_owner_report_runs r
   where r.id=report_run_id
   and public.bf4_staff(r.organization_id,'reports.view')
  )
 );

grant select,insert,update on public.bf_owner_report_branding to authenticated;
grant select,insert,update on public.bf_owner_report_runs to authenticated;
grant select,insert on public.bf_owner_report_events to authenticated;

notify pgrst,'reload schema';
commit;

select
 count(*) as archived_reports,
 count(*) filter(where distribution_status='printed') as printed,
 count(*) filter(where distribution_status='sent') as sent,
 count(*) filter(where distribution_status='acknowledged') as acknowledged
from public.bf_owner_report_runs;
