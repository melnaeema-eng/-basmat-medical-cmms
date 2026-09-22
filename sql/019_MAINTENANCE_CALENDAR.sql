-- Basmat Facilities CMMS — Sprint 18
-- Unified Maintenance Calendar & Planning Board
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=17)
 then raise exception 'Install and verify Sprint 17 first'; end if;
 if exists(select 1 from public.bf_migrations where version=18)
 then raise exception 'Sprint 18 already installed'; end if;
 if to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf_assets') is null
 or to_regclass('public.bf14_asset_inspections') is null
 or to_regclass('public.bf14_replacement_plans') is null
 then raise exception 'Required planning sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('planning.view','View unified maintenance planning calendar')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where p.code='planning.view'
  and r.code in('company_admin','facility_manager','maintenance_manager','supervisor','technician')
on conflict do nothing;

create or replace function public.bf18_calendar(
 p_org uuid default null,
 p_client uuid default null,
 p_from date default current_date,
 p_to date default (current_date+30),
 p_source text default null,
 p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null
 then raise exception 'Authentication required' using errcode='42501'; end if;

 if p_from is null or p_to is null or p_from>p_to
 then raise exception 'Invalid date range'; end if;

 if p_to-p_from>366
 then raise exception 'Date range cannot exceed 366 days'; end if;

 if p_limit is null or p_limit not between 1 and 1000
 then raise exception 'Invalid limit'; end if;

 if p_source is not null and p_source not in('work_order','ppm','warranty','inspection','replacement')
 then raise exception 'Invalid source'; end if;

 if p_org is not null and not public.bf4_staff(p_org,'planning.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with events as (
  select
   w.organization_id,w.client_id,w.site_id,
   'work_order'::text source,w.id entity_id,w.completion_due_at::date event_date,
   w.work_order_number reference,w.title,
   w.priority::text priority,w.status::text status,
   jsonb_build_object('sla_status',w.sla_status,'completion_due_at',w.completion_due_at) details
  from public.bf_work_orders w
  where w.completion_due_at is not null
    and w.status not in('closed','cancelled')
    and public.bf4_staff(w.organization_id,'planning.view')

  union all

  select
   j.organization_id,j.client_id,j.site_id,
   'ppm',j.id,j.due_date,
   j.job_number,j.job_number,
   'normal',j.status,
   jsonb_build_object('asset_id',j.asset_id,'assigned_to',j.assigned_to) details
  from public.bf_ppm_jobs j
  where j.status not in('closed','cancelled')
    and public.bf4_staff(j.organization_id,'planning.view')

  union all

  select
   a.organization_id,a.client_id,a.site_id,
   'warranty',a.id,a.warranty_end,
   a.asset_tag,coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag),
   a.criticality,a.operational_status,
   jsonb_build_object('condition',a.condition,'manufacturer',a.manufacturer,'model',a.model) details
  from public.bf_assets a
  where a.status='active'
    and a.warranty_end is not null
    and public.bf4_staff(a.organization_id,'planning.view')

  union all

  select
   a.organization_id,a.client_id,a.site_id,
   'inspection',i.asset_id,i.next_inspection_date,
   a.asset_tag,coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag),
   a.criticality,a.condition,
   jsonb_build_object('inspection_id',i.id,'score',i.score,'last_inspected_at',i.inspected_at) details
  from public.bf14_asset_inspections i
  join public.bf_assets a on a.id=i.asset_id
  where i.next_inspection_date is not null
    and public.bf4_staff(i.organization_id,'planning.view')
    and i.id=(
      select x.id from public.bf14_asset_inspections x
      where x.asset_id=i.asset_id
      order by x.inspected_at desc,x.id desc limit 1
    )

  union all

  select
   a.organization_id,a.client_id,a.site_id,
   'replacement',p.asset_id,p.target_date,
   a.asset_tag,coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag),
   p.priority,p.status,
   jsonb_build_object('estimated_cost',p.estimated_cost,'currency',p.currency,'reason',p.reason) details
  from public.bf14_replacement_plans p
  join public.bf_assets a on a.id=p.asset_id
  where p.target_date is not null
    and p.status not in('completed','cancelled')
    and public.bf4_staff(p.organization_id,'planning.view')
 ),
 filtered as (
  select e.*,
    case
     when e.event_date<current_date then 'overdue'
     when e.event_date=current_date then 'today'
     when e.event_date<=current_date+7 then 'next_7_days'
     else 'future'
    end timing
  from events e
  where e.event_date between p_from and p_to
    and (p_org is null or e.organization_id=p_org)
    and (p_client is null or e.client_id=p_client)
    and (p_source is null or e.source=p_source)
 ),
 limited as (
  select * from filtered
  order by event_date,source,reference
  limit p_limit
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.event_date,x.source,x.reference) from limited x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from filtered),
    'overdue',(select count(*) from filtered where timing='overdue'),
    'today',(select count(*) from filtered where timing='today'),
    'next_7_days',(select count(*) from filtered where timing='next_7_days'),
    'work_orders',(select count(*) from filtered where source='work_order'),
    'ppm',(select count(*) from filtered where source='ppm'),
    'warranty',(select count(*) from filtered where source='warranty'),
    'inspections',(select count(*) from filtered where source='inspection'),
    'replacements',(select count(*) from filtered where source='replacement')
  ),
  'truncated',(select count(*) from filtered)>p_limit
 ) into result;

 return result;
end $$;

revoke all on function public.bf18_calendar(uuid,uuid,date,date,text,integer) from public,anon;
grant execute on function public.bf18_calendar(uuid,uuid,date,date,text,integer) to authenticated;

insert into public.bf_migrations(version) values(18);
commit;
