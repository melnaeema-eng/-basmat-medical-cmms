-- Basmat Facilities CMMS — Sprint 28
-- Executive Management Dashboard
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=27)
 then raise exception 'Install and verify Sprint 27 first'; end if;
 if exists(select 1 from public.bf_migrations where version=28)
 then raise exception 'Sprint 28 already installed'; end if;
 if to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf_assets') is null
 or to_regclass('public.bf_contracts') is null
 then raise exception 'Required executive dashboard sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('executive.view','View executive FM dashboard')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where p.code='executive.view'
and r.code in('company_admin','facility_manager','maintenance_manager')
on conflict do nothing;

create or replace function public.bf28_can(p_org uuid)
returns boolean
language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,'executive.view'); $$;

create or replace function public.bf28_dashboard(
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
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range'; end if;
 if p_to-p_from>366 then raise exception 'Date range cannot exceed 366 days'; end if;
 if p_org is not null and not public.bf28_can(p_org)
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with
 orgs as (
   select o.id
   from public.bf_organizations o
   where (p_org is null or o.id=p_org)
     and public.bf28_can(o.id)
 ),
 wo as (
   select w.*
   from public.bf_work_orders w
   where w.organization_id in(select id from orgs)
     and (p_client is null or w.client_id=p_client)
     and w.created_at::date between p_from and p_to
 ),
 ppm as (
   select j.*
   from public.bf_ppm_jobs j
   where j.organization_id in(select id from orgs)
     and (p_client is null or j.client_id=p_client)
     and j.due_date between p_from and p_to
 ),
 assets as (
   select a.*
   from public.bf_assets a
   where a.organization_id in(select id from orgs)
     and (p_client is null or a.client_id=p_client)
     and a.status='active'
 ),
 contracts as (
   select c.*
   from public.bf_contracts c
   where c.organization_id in(select id from orgs)
     and (p_client is null or c.client_id=p_client)
     and c.status<>'archived'
 ),
 hse as (
   select i.*
   from public.bf26_incidents i
   where i.organization_id in(select id from orgs)
     and (p_client is null or i.client_id=p_client)
     and i.occurred_at::date between p_from and p_to
 ),
 compliance as (
   select o.*
   from public.bf23_obligations o
   where o.organization_id in(select id from orgs)
     and (p_client is null or o.client_id=p_client)
 ),
 reliability as (
   select d.*
   from public.bf22_downtime_incidents d
   where d.organization_id in(select id from orgs)
     and (p_client is null or d.client_id=p_client)
     and d.started_at::date between p_from and p_to
 ),
 utilities as (
   select r.*
   from public.bf25_meter_readings r
   where r.organization_id in(select id from orgs)
     and r.reading_date between p_from and p_to
 ),
 supplier_scores as (
   select e.*
   from public.bf19_supplier_evaluations e
   where e.organization_id in(select id from orgs)
     and e.created_at::date between p_from and p_to
 ),
 cost_rows as (
   select c.*
   from public.bf15_work_order_costs c
   join public.bf_work_orders w on w.id=c.work_order_id
   where w.organization_id in(select id from orgs)
     and (p_client is null or w.client_id=p_client)
     and c.created_at::date between p_from and p_to
     and c.status='active'
 ),
 top_risk as (
   select w.id,w.work_order_number,w.title,w.priority,w.status,w.sla_status,w.completion_due_at,
          cl.name client_name,s.name site_name
   from wo w
   join public.bf_clients cl on cl.id=w.client_id
   join public.bf_sites s on s.id=w.site_id
   where w.status not in('closed','cancelled')
   order by
    case w.priority when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 else 4 end,
    case when w.sla_status='breached' then 0 else 1 end,
    w.completion_due_at nulls last
   limit 15
 ),
 expiring as (
   select c.id,c.contract_number,c.end_date,c.contract_value,cl.name client_name,
          c.end_date-current_date days_remaining
   from contracts c
   join public.bf_clients cl on cl.id=c.client_id
   where c.end_date is not null and c.end_date<=current_date+60
   order by c.end_date
   limit 15
 )
 select jsonb_build_object(
   'period',jsonb_build_object('from',p_from,'to',p_to),
   'operations',jsonb_build_object(
     'work_orders_total',(select count(*) from wo),
     'work_orders_open',(select count(*) from wo where status not in('closed','cancelled')),
     'p1_open',(select count(*) from wo where priority='P1' and status not in('closed','cancelled')),
     'sla_breached',(select count(*) from wo where sla_status='breached'),
     'sla_met',(select count(*) from wo where sla_status='met'),
     'ppm_total',(select count(*) from ppm),
     'ppm_overdue',(select count(*) from ppm where due_date<current_date and status in('scheduled','assigned','in_progress')),
     'ppm_completed',(select count(*) from ppm where status in('completed','approved','closed'))
   ),
   'assets',jsonb_build_object(
     'total',(select count(*) from assets),
     'critical',(select count(*) from assets where criticality='critical'),
     'poor_failed',(select count(*) from assets where condition in('poor','failed')),
     'out_of_service',(select count(*) from assets where operational_status='out_of_service')
   ),
   'commercial',jsonb_build_object(
     'contracts_total',(select count(*) from contracts),
     'contracts_expiring_60',(select count(*) from contracts where end_date is not null and end_date between current_date and current_date+60),
     'contracts_expired',(select count(*) from contracts where end_date<current_date),
     'contract_value_expiring_60',coalesce((select round(sum(coalesce(contract_value,0)),2) from contracts where end_date between current_date and current_date+60),0),
     'maintenance_cost',coalesce((select round(sum(coalesce(amount,0)),2) from cost_rows),0)
   ),
   'risk',jsonb_build_object(
     'hse_open',(select count(*) from hse where status not in('closed','cancelled')),
     'hse_critical',(select count(*) from hse where severity='critical' and status not in('closed','cancelled')),
     'compliance_overdue',(select count(*) from compliance where status='active' and next_due_date<current_date),
     'open_downtime',(select count(*) from reliability where ended_at is null)
   ),
   'performance',jsonb_build_object(
     'supplier_avg_score',coalesce((select round(avg(overall_score),2) from supplier_scores),0),
     'utility_readings',(select count(*) from utilities)
   ),
   'top_risk_work_orders',coalesce((select jsonb_agg(to_jsonb(x)) from top_risk x),'[]'::jsonb),
   'expiring_contracts',coalesce((select jsonb_agg(to_jsonb(x)) from expiring x),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf28_can(uuid),
 public.bf28_dashboard(uuid,uuid,date,date)
from public,anon;

grant execute on function public.bf28_can(uuid),
 public.bf28_dashboard(uuid,uuid,date,date)
to authenticated;

insert into public.bf_migrations(version) values(28);
commit;
