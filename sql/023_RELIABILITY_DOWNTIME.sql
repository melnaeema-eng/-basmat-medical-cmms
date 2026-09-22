-- Basmat Facilities CMMS — Sprint 22
-- Asset Reliability & Downtime Analytics
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=21)
 then raise exception 'Install and verify Sprint 21 first'; end if;
 if exists(select 1 from public.bf_migrations where version=22)
 then raise exception 'Sprint 22 already installed'; end if;
 if to_regclass('public.bf_assets') is null
 or to_regclass('public.bf_work_orders') is null
 then raise exception 'Required reliability sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('reliability.view','View asset reliability and downtime analytics'),
 ('reliability.manage','Create and close controlled asset downtime incidents')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'reliability.%')
 or (r.code='supervisor' and p.code like 'reliability.%')
 or (r.code='technician' and p.code='reliability.view')
on conflict do nothing;

create table public.bf22_downtime_incidents(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 asset_id uuid not null references public.bf_assets(id),
 work_order_id uuid references public.bf_work_orders(id),
 incident_type text not null check(incident_type in('failure','planned_maintenance','utility','external','other')),
 started_at timestamptz not null,
 ended_at timestamptz,
 status text not null default 'open' check(status in('open','closed','cancelled')),
 reason text not null check(length(btrim(reason))>=5),
 resolution text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 closed_by uuid references auth.users(id),
 closed_at timestamptz,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 cancel_reason text,
 check(ended_at is null or ended_at>started_at),
 check((status='closed')=(closed_at is not null)),
 check((status='cancelled')=(cancelled_at is not null)),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id)
);

create index bf22_downtime_asset
on public.bf22_downtime_incidents(organization_id,asset_id,started_at desc);

create unique index bf22_one_open_per_asset
on public.bf22_downtime_incidents(asset_id)
where status='open';

alter table public.bf22_downtime_incidents enable row level security;
revoke all on public.bf22_downtime_incidents from public,anon,authenticated;
grant select on public.bf22_downtime_incidents to authenticated;

create or replace function public.bf22_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf22_downtime_read on public.bf22_downtime_incidents
for select to authenticated
using(public.bf22_can(organization_id,'reliability.view'));

create or replace function public.bf22_open(
 p_asset uuid,
 p_started_at timestamptz,
 p_type text,
 p_reason text,
 p_work_order uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 a public.bf_assets;
 w public.bf_work_orders;
 did uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

 select * into a from public.bf_assets where id=p_asset and status='active';
 if not found then raise exception 'Active asset not found'; end if;

 if not public.bf22_can(a.organization_id,'reliability.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_started_at is null or p_started_at>now()+interval '5 minutes'
 then raise exception 'Invalid downtime start'; end if;

 if p_type not in('failure','planned_maintenance','utility','external','other')
 then raise exception 'Invalid downtime type'; end if;

 if length(btrim(coalesce(p_reason,'')))<5
 then raise exception 'Reason is required'; end if;

 if p_work_order is not null then
   select * into w from public.bf_work_orders where id=p_work_order;
   if not found or w.organization_id<>a.organization_id or w.asset_id is distinct from a.id
   then raise exception 'Work order does not match asset'; end if;
 end if;

 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));

 if exists(select 1 from public.bf22_downtime_incidents where asset_id=a.id and status='open')
 then raise exception 'Asset already has an open downtime incident'; end if;

 insert into public.bf22_downtime_incidents(
  organization_id,client_id,site_id,asset_id,work_order_id,incident_type,
  started_at,reason,created_by
 )
 values(
  a.organization_id,a.client_id,a.site_id,a.id,p_work_order,p_type,
  p_started_at,btrim(p_reason),auth.uid()
 )
 returning id into did;

 return did;
end $$;

create or replace function public.bf22_close(
 p_incident uuid,
 p_ended_at timestamptz,
 p_resolution text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare d public.bf22_downtime_incidents;
begin
 select * into d from public.bf22_downtime_incidents where id=p_incident for update;
 if not found then raise exception 'Downtime incident not found'; end if;
 if d.status<>'open' then raise exception 'Downtime incident is not open'; end if;
 if not public.bf22_can(d.organization_id,'reliability.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_ended_at is null or p_ended_at<=d.started_at or p_ended_at>now()+interval '5 minutes'
 then raise exception 'Invalid downtime end'; end if;
 if length(btrim(coalesce(p_resolution,'')))<5
 then raise exception 'Resolution is required'; end if;

 update public.bf22_downtime_incidents
 set ended_at=p_ended_at,status='closed',resolution=btrim(p_resolution),
     closed_by=auth.uid(),closed_at=now()
 where id=d.id;
end $$;

create or replace function public.bf22_cancel(p_incident uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare d public.bf22_downtime_incidents;
begin
 select * into d from public.bf22_downtime_incidents where id=p_incident for update;
 if not found then raise exception 'Downtime incident not found'; end if;
 if d.status<>'open' then raise exception 'Only open incidents can be cancelled'; end if;
 if not public.bf22_can(d.organization_id,'reliability.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<5
 then raise exception 'Cancellation reason is required'; end if;

 update public.bf22_downtime_incidents
 set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
     cancel_reason=btrim(p_reason)
 where id=d.id;
end $$;

create or replace function public.bf22_dashboard(
 p_org uuid default null,
 p_client uuid default null,
 p_from timestamptz default (now()-interval '90 days'),
 p_to timestamptz default now(),
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
 if p_from is null or p_to is null or p_from>=p_to
 then raise exception 'Invalid date range'; end if;
 if p_to-p_from>interval '730 days'
 then raise exception 'Date range cannot exceed 730 days'; end if;
 if p_limit is null or p_limit not between 1 and 1000
 then raise exception 'Invalid limit'; end if;
 if p_org is not null and not public.bf22_can(p_org,'reliability.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with assets as (
  select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,a.name_ar,a.name_en,
         a.criticality,a.condition,a.operational_status
  from public.bf_assets a
  where a.status='active'
    and (p_org is null or a.organization_id=p_org)
    and (p_client is null or a.client_id=p_client)
    and public.bf22_can(a.organization_id,'reliability.view')
 ),
 incidents as (
  select d.*,
    greatest(d.started_at,p_from) clipped_start,
    least(coalesce(d.ended_at,p_to),p_to) clipped_end
  from public.bf22_downtime_incidents d
  where d.status<>'cancelled'
    and d.started_at<p_to
    and coalesce(d.ended_at,p_to)>p_from
    and exists(select 1 from assets a where a.id=d.asset_id)
 ),
 agg as (
  select
    a.id asset_id,a.organization_id,a.client_id,a.site_id,a.asset_tag,
    coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,
    a.criticality,a.condition,a.operational_status,
    count(i.id)::int incident_count,
    count(i.id) filter(where i.incident_type='failure')::int failure_count,
    count(i.id) filter(where i.status='open')::int open_incidents,
    round(coalesce(sum(extract(epoch from (i.clipped_end-i.clipped_start))/3600),0)::numeric,2) downtime_hours,
    round(coalesce(avg(extract(epoch from (i.ended_at-i.started_at))/3600)
      filter(where i.status='closed' and i.incident_type='failure'),0)::numeric,2) mttr_hours
  from assets a
  left join incidents i on i.asset_id=a.id
  group by a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,a.name_en,a.name_ar,
           a.criticality,a.condition,a.operational_status
 ),
 metrics as (
  select x.*,
    round(greatest(0,100-(100*x.downtime_hours/nullif(extract(epoch from (p_to-p_from))/3600,0)))::numeric,2) availability_pct,
    round(case when x.failure_count>0
      then greatest(0,(extract(epoch from (p_to-p_from))/3600-x.downtime_hours)/x.failure_count)
      else 0 end::numeric,2) mtbf_hours
  from agg x
 )
 select jsonb_build_object(
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.availability_pct,x.downtime_hours desc)
    from (select * from metrics order by availability_pct,downtime_hours desc limit p_limit)x),'[]'::jsonb),
  'open_incidents',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.started_at)
    from (
      select d.id,d.asset_id,a.asset_tag,
        coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,
        d.work_order_id,d.incident_type,d.started_at,d.reason,d.created_at,
        extract(epoch from (now()-d.started_at))/3600 open_hours
      from public.bf22_downtime_incidents d
      join assets a on a.id=d.asset_id
      where d.status='open'
      order by d.started_at
      limit 100
    ) x
  ),'[]'::jsonb),
  'recent_incidents',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.started_at desc)
    from (
      select d.id,d.asset_id,a.asset_tag,
        coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,
        d.work_order_id,d.incident_type,d.started_at,d.ended_at,d.status,d.reason,d.resolution,
        round((extract(epoch from (coalesce(d.ended_at,now())-d.started_at))/3600)::numeric,2) duration_hours
      from public.bf22_downtime_incidents d
      join assets a on a.id=d.asset_id
      where d.started_at<p_to and coalesce(d.ended_at,p_to)>p_from
      order by d.started_at desc
      limit 100
    ) x
  ),'[]'::jsonb),
  'summary',jsonb_build_object(
    'assets',(select count(*) from metrics),
    'incidents',coalesce((select sum(incident_count) from metrics),0),
    'failures',coalesce((select sum(failure_count) from metrics),0),
    'open_incidents',coalesce((select sum(open_incidents) from metrics),0),
    'downtime_hours',coalesce((select round(sum(downtime_hours),2) from metrics),0),
    'avg_availability',coalesce((select round(avg(availability_pct),2) from metrics),100),
    'avg_mttr_hours',coalesce((select round(avg(mttr_hours),2) from metrics where failure_count>0),0),
    'avg_mtbf_hours',coalesce((select round(avg(mtbf_hours),2) from metrics where failure_count>0),0)
  )
 ) into result;

 return result;
end $$;

revoke all on function public.bf22_can(uuid,text),
 public.bf22_open(uuid,timestamptz,text,text,uuid),
 public.bf22_close(uuid,timestamptz,text),
 public.bf22_cancel(uuid,text),
 public.bf22_dashboard(uuid,uuid,timestamptz,timestamptz,integer)
from public,anon;

grant execute on function public.bf22_can(uuid,text),
 public.bf22_open(uuid,timestamptz,text,text,uuid),
 public.bf22_close(uuid,timestamptz,text),
 public.bf22_cancel(uuid,text),
 public.bf22_dashboard(uuid,uuid,timestamptz,timestamptz,integer)
to authenticated;

insert into public.bf_migrations(version) values(22);
commit;
