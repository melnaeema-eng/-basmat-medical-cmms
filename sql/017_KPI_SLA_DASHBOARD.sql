-- Basmat Facilities CMMS — Sprint 16
-- KPI & SLA Performance Dashboard
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=15)
 or to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf_assets') is null
 then raise exception 'Install and verify Sprint 15 first'; end if;

 if exists(select 1 from public.bf_migrations where version=16)
 then raise exception 'Sprint 16 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('kpi.view','View maintenance KPI and SLA dashboard')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where p.code='kpi.view'
and r.code in('company_admin','facility_manager','maintenance_manager','supervisor')
on conflict do nothing;

create or replace function public.bf16_dashboard(
 p_org uuid default null,
 p_client uuid default null,
 p_from date default (current_date-30),
 p_to date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 result jsonb;
begin
 if auth.uid() is null
 then raise exception 'Authentication required' using errcode='42501'; end if;

 if p_from is null or p_to is null or p_from>p_to
 then raise exception 'Invalid date range'; end if;

 if p_to-p_from>366
 then raise exception 'Date range cannot exceed 366 days'; end if;

 if p_org is not null and not public.bf4_staff(p_org,'kpi.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with
 wo as (
  select w.*
  from public.bf_work_orders w
  where (p_org is null or w.organization_id=p_org)
    and (p_client is null or w.client_id=p_client)
    and w.created_at::date between p_from and p_to
    and public.bf4_staff(w.organization_id,'kpi.view')
 ),
 ppm as (
  select j.*
  from public.bf_ppm_jobs j
  where (p_org is null or j.organization_id=p_org)
    and (p_client is null or j.client_id=p_client)
    and j.due_date between p_from and p_to
    and public.bf4_staff(j.organization_id,'kpi.view')
 ),
 assets as (
  select a.*
  from public.bf_assets a
  where a.status='active'
    and (p_org is null or a.organization_id=p_org)
    and (p_client is null or a.client_id=p_client)
    and public.bf4_staff(a.organization_id,'kpi.view')
 ),
 wo_stats as (
  select
   count(*)::int total,
   count(*) filter(where status not in('closed','cancelled'))::int open,
   count(*) filter(where status='closed')::int closed,
   count(*) filter(where sla_status='breached')::int sla_breached,
   count(*) filter(where sla_status='met')::int sla_met,
   count(*) filter(where priority='P1' and status not in('closed','cancelled'))::int p1_open,
   round(coalesce(avg(extract(epoch from (closed_at-created_at))/3600)
     filter(where closed_at is not null),0)::numeric,2) avg_close_hours
  from wo
 ),
 ppm_stats as (
  select
   count(*)::int total,
   count(*) filter(where status in('completed','approved','closed'))::int completed,
   count(*) filter(where due_date<current_date and status in('scheduled','assigned','in_progress'))::int overdue,
   round(
    case when count(*)=0 then 0
    else 100.0*count(*) filter(where status in('completed','approved','closed'))/count(*) end
   ,2) compliance_pct
  from ppm
 ),
 asset_stats as (
  select
   count(*)::int total,
   count(*) filter(where criticality='critical')::int critical,
   count(*) filter(where condition in('poor','failed'))::int poor_or_failed,
   count(*) filter(where operational_status='out_of_service')::int out_of_service
  from assets
 )
 select jsonb_build_object(
  'period',jsonb_build_object('from',p_from,'to',p_to),
  'work_orders',(select to_jsonb(x) from wo_stats x),
  'ppm',(select to_jsonb(x) from ppm_stats x),
  'assets',(select to_jsonb(x) from asset_stats x),
  'sla_breaches',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.completion_due_at nulls last)
    from (
      select id,work_order_number,title,priority,status,sla_status,completion_due_at,client_id,site_id
      from wo
      where sla_status='breached'
      order by completion_due_at nulls last
      limit 20
    ) x
  ),'[]'::jsonb),
  'overdue_ppm',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.due_date)
    from (
      select id,job_number,status,due_date,asset_id,client_id,site_id
      from ppm
      where due_date<current_date and status in('scheduled','assigned','in_progress')
      order by due_date
      limit 20
    ) x
  ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf16_dashboard(uuid,uuid,date,date) from public,anon;
grant execute on function public.bf16_dashboard(uuid,uuid,date,date) to authenticated;

insert into public.bf_migrations(version) values(16);
commit;
