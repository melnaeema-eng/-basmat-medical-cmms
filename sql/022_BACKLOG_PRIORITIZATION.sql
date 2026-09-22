-- Basmat Facilities CMMS — Sprint 21
-- Maintenance Backlog & Risk Prioritization
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=20)
 then raise exception 'Install and verify Sprint 20 first'; end if;
 if exists(select 1 from public.bf_migrations where version=21)
 then raise exception 'Sprint 21 already installed'; end if;
 if to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf_assets') is null
 then raise exception 'Required backlog sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('backlog.view','View maintenance backlog and risk prioritization'),
 ('backlog.manage','Set controlled backlog priority overrides')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'backlog.%')
 or (r.code='supervisor' and p.code like 'backlog.%')
 or (r.code='technician' and p.code='backlog.view')
on conflict do nothing;

create table public.bf21_priority_overrides(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 task_type text not null check(task_type in('work_order','ppm_job')),
 task_id uuid not null,
 override_score integer not null check(override_score between 1 and 100),
 reason text not null check(length(btrim(reason))>=5),
 active boolean not null default true,
 valid_until timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 ended_by uuid references auth.users(id),
 ended_at timestamptz,
 unique(task_type,task_id,active)
);

create index bf21_override_scope
on public.bf21_priority_overrides(organization_id,active,created_at desc);

alter table public.bf21_priority_overrides enable row level security;
revoke all on public.bf21_priority_overrides from public,anon,authenticated;
grant select on public.bf21_priority_overrides to authenticated;

create or replace function public.bf21_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf21_override_read on public.bf21_priority_overrides
for select to authenticated
using(public.bf21_can(organization_id,'backlog.view'));

create or replace function public.bf21_set_override(
 p_task_type text,p_task_id uuid,p_score integer,p_reason text,p_valid_until timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare org uuid; oid uuid;
begin
 if p_task_type not in('work_order','ppm_job') then raise exception 'Invalid task type'; end if;
 if p_score not between 1 and 100 then raise exception 'Score must be between 1 and 100'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Reason is required'; end if;
 if p_valid_until is not null and p_valid_until<=now() then raise exception 'Override expiry must be in the future'; end if;

 if p_task_type='work_order' then
   select organization_id into org from public.bf_work_orders
   where id=p_task_id and status not in('closed','cancelled');
   if not found then raise exception 'Active work order not found'; end if;
 else
   select organization_id into org from public.bf_ppm_jobs
   where id=p_task_id and status not in('closed','cancelled');
   if not found then raise exception 'Active PPM job not found'; end if;
 end if;

 if not public.bf21_can(org,'backlog.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 update public.bf21_priority_overrides
 set active=false,ended_by=auth.uid(),ended_at=now()
 where task_type=p_task_type and task_id=p_task_id and active=true;

 insert into public.bf21_priority_overrides(
  organization_id,task_type,task_id,override_score,reason,valid_until,created_by)
 values(org,p_task_type,p_task_id,p_score,btrim(p_reason),p_valid_until,auth.uid())
 returning id into oid;

 return oid;
end $$;

create or replace function public.bf21_clear_override(p_task_type text,p_task_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare o public.bf21_priority_overrides;
begin
 select * into o from public.bf21_priority_overrides
 where task_type=p_task_type and task_id=p_task_id and active=true
 for update;
 if not found then raise exception 'Active override not found'; end if;
 if not public.bf21_can(o.organization_id,'backlog.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Reason is required'; end if;

 update public.bf21_priority_overrides
 set active=false,ended_by=auth.uid(),ended_at=now()
 where id=o.id;
end $$;

create or replace function public.bf21_backlog(
 p_org uuid default null,
 p_client uuid default null,
 p_limit integer default 300
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
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;
 if p_org is not null and not public.bf21_can(p_org,'backlog.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with wo as (
  select
   w.id,w.organization_id,w.client_id,w.site_id,w.asset_id,
   'work_order'::text task_type,w.work_order_number reference,w.title,
   w.priority,w.status,w.created_at,
   w.completion_due_at::timestamptz due_at,w.sla_status,
   a.criticality,a.condition,a.operational_status,
   (
    case w.priority when 'P1' then 35 when 'P2' then 25 when 'P3' then 15 else 5 end
    + case when w.sla_status='breached' then 25 else 0 end
    + case when w.completion_due_at is not null and w.completion_due_at<now() then 15 else 0 end
    + case a.criticality when 'critical' then 15 when 'high' then 10 else 0 end
    + least(10,greatest(0,floor(extract(epoch from (now()-w.created_at))/86400/7)))::int
   )::int calculated_score
  from public.bf_work_orders w
  left join public.bf_assets a on a.id=w.asset_id
  where w.status not in('completed','approved','closed','cancelled')
    and (p_org is null or w.organization_id=p_org)
    and (p_client is null or w.client_id=p_client)
    and public.bf21_can(w.organization_id,'backlog.view')
 ),
 ppm as (
  select
   j.id,j.organization_id,j.client_id,j.site_id,j.asset_id,
   'ppm_job'::text task_type,j.job_number reference,
   coalesce(a.name_en,a.name_ar,a.asset_tag) title,
   'PPM'::text priority,j.status,j.created_at,
   j.due_date::timestamptz due_at,'not_applicable'::text sla_status,
   a.criticality,a.condition,a.operational_status,
   (
    case when j.due_date<current_date then 35
         when j.due_date=current_date then 25
         when j.due_date<=current_date+7 then 15 else 5 end
    + case a.criticality when 'critical' then 25 when 'high' then 15 else 0 end
    + case when a.condition in('poor','failed') then 20 else 0 end
    + case when a.operational_status='out_of_service' then 20 else 0 end
   )::int calculated_score
  from public.bf_ppm_jobs j
  join public.bf_assets a on a.id=j.asset_id
  where j.status not in('completed','approved','closed','cancelled')
    and (p_org is null or j.organization_id=p_org)
    and (p_client is null or j.client_id=p_client)
    and public.bf21_can(j.organization_id,'backlog.view')
 ),
 base as (
  select * from wo
  union all
  select * from ppm
 ),
 ranked as (
  select b.*,
    o.override_score,
    o.reason override_reason,
    case
      when o.id is not null and (o.valid_until is null or o.valid_until>now()) then o.override_score
      else least(100,b.calculated_score)
    end final_score
  from base b
  left join public.bf21_priority_overrides o
    on o.task_type=b.task_type and o.task_id=b.id and o.active=true
       and (o.valid_until is null or o.valid_until>now())
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.final_score desc,x.due_at nulls last,x.reference)
    from (select * from ranked order by final_score desc,due_at nulls last,reference limit p_limit)x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from ranked),
    'critical',(select count(*) from ranked where final_score>=80),
    'high',(select count(*) from ranked where final_score between 60 and 79),
    'medium',(select count(*) from ranked where final_score between 40 and 59),
    'low',(select count(*) from ranked where final_score<40),
    'overrides',(select count(*) from ranked where override_score is not null)
  )
 ) into result;

 return result;
end $$;

revoke all on function public.bf21_can(uuid,text),
 public.bf21_set_override(text,uuid,integer,text,timestamptz),
 public.bf21_clear_override(text,uuid,text),
 public.bf21_backlog(uuid,uuid,integer)
from public,anon;

grant execute on function public.bf21_can(uuid,text),
 public.bf21_set_override(text,uuid,integer,text,timestamptz),
 public.bf21_clear_override(text,uuid,text),
 public.bf21_backlog(uuid,uuid,integer)
to authenticated;

insert into public.bf_migrations(version) values(21);
commit;
