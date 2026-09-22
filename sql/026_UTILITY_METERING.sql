-- Basmat Facilities CMMS — Sprint 25
-- Utility Metering & Consumption Analytics
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=24)
 then raise exception 'Install and verify Sprint 24 first'; end if;
 if exists(select 1 from public.bf_migrations where version=25)
 then raise exception 'Sprint 25 already installed'; end if;
 if to_regclass('public.bf_sites') is null
 or to_regclass('public.bf_assets') is null
 then raise exception 'Required utility sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('utilities.view','View utility meters and consumption analytics'),
 ('utilities.manage','Manage utility meters and readings')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'utilities.%')
 or (r.code in('supervisor','technician') and p.code='utilities.view')
on conflict do nothing;

create table public.bf25_meters(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 asset_id uuid,
 code text not null,
 name text not null check(length(btrim(name))>=2),
 meter_type text not null check(meter_type in('electricity','water','gas','diesel','other')),
 unit text not null check(unit in('kWh','MWh','m3','L','kg','other')),
 target_daily numeric(18,4) check(target_daily is null or target_daily>=0),
 status text not null default 'active' check(status in('active','inactive','archived')),
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(organization_id,code),
 unique(id,organization_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id)
);

create index bf25_meter_scope on public.bf25_meters(organization_id,site_id,status,meter_type);

create table public.bf25_meter_readings(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 meter_id uuid not null references public.bf25_meters(id),
 reading_at timestamptz not null,
 reading_value numeric(20,4) not null check(reading_value>=0),
 source text not null default 'manual' check(source in('manual','import','integration')),
 notes text not null default '',
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 unique(meter_id,reading_at)
);

create index bf25_reading_meter_time on public.bf25_meter_readings(meter_id,reading_at desc);

create table public.bf25_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 meter_id uuid not null references public.bf25_meters(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create index bf25_events_meter on public.bf25_events(meter_id,id desc);

do $$ declare t text;
begin
 foreach t in array array['bf25_meters','bf25_meter_readings','bf25_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf25_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf25_meter_read on public.bf25_meters
for select to authenticated using(public.bf25_can(organization_id,'utilities.view'));
create policy bf25_reading_read on public.bf25_meter_readings
for select to authenticated using(public.bf25_can(organization_id,'utilities.view'));
create policy bf25_event_read on public.bf25_events
for select to authenticated using(public.bf25_can(organization_id,'utilities.view'));

create or replace function public.bf25_create_meter(
 p_site uuid,
 p_asset uuid,
 p_code text,
 p_name text,
 p_type text,
 p_unit text,
 p_target_daily numeric default null,
 p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf_sites; a public.bf_assets; mid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into s from public.bf_sites where id=p_site and status='active';
 if not found then raise exception 'Active site not found'; end if;
 if not public.bf25_can(s.organization_id,'utilities.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_type not in('electricity','water','gas','diesel','other') then raise exception 'Invalid meter type'; end if;
 if p_unit not in('kWh','MWh','m3','L','kg','other') then raise exception 'Invalid meter unit'; end if;
 if length(btrim(coalesce(p_code,'')))<2 then raise exception 'Meter code is required'; end if;
 if length(btrim(coalesce(p_name,'')))<2 then raise exception 'Meter name is required'; end if;
 if p_target_daily is not null and p_target_daily<0 then raise exception 'Invalid daily target'; end if;

 if p_asset is not null then
   select * into a from public.bf_assets
   where id=p_asset and organization_id=s.organization_id and site_id=s.id and status='active';
   if not found then raise exception 'Asset does not belong to site'; end if;
 end if;

 insert into public.bf25_meters(
  organization_id,client_id,site_id,asset_id,code,name,meter_type,unit,target_daily,notes,created_by
 ) values(
  s.organization_id,s.client_id,s.id,p_asset,upper(btrim(p_code)),btrim(p_name),p_type,p_unit,
  p_target_daily,left(coalesce(p_notes,''),4000),auth.uid()
 ) returning id into mid;

 insert into public.bf25_events(organization_id,meter_id,actor_id,action,details)
 values(s.organization_id,mid,auth.uid(),'created',jsonb_build_object('code',upper(btrim(p_code)),'type',p_type));
 return mid;
end $$;

create or replace function public.bf25_add_reading(
 p_meter uuid,
 p_reading_at timestamptz,
 p_value numeric,
 p_source text default 'manual',
 p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare m public.bf25_meters; rid uuid; prev numeric; prev_at timestamptz;
begin
 select * into m from public.bf25_meters where id=p_meter and status='active' for update;
 if not found then raise exception 'Active meter not found'; end if;
 if not public.bf25_can(m.organization_id,'utilities.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_reading_at is null or p_reading_at>now()+interval '5 minutes' then raise exception 'Invalid reading time'; end if;
 if p_value is null or p_value<0 then raise exception 'Invalid reading value'; end if;
 if p_source not in('manual','import','integration') then raise exception 'Invalid reading source'; end if;

 select r.reading_value,r.reading_at into prev,prev_at
 from public.bf25_meter_readings r
 where r.meter_id=m.id and r.reading_at<p_reading_at
 order by r.reading_at desc limit 1;
 if found and p_value<prev then
   raise exception 'Cumulative reading cannot be lower than previous reading at %',prev_at;
 end if;
 if exists(select 1 from public.bf25_meter_readings r where r.meter_id=m.id and r.reading_at>p_reading_at and r.reading_value<p_value) then
   raise exception 'Reading would make the cumulative sequence invalid';
 end if;

 insert into public.bf25_meter_readings(
  organization_id,meter_id,reading_at,reading_value,source,notes,recorded_by
 ) values(
  m.organization_id,m.id,p_reading_at,p_value,p_source,left(coalesce(p_notes,''),2000),auth.uid()
 ) returning id into rid;

 insert into public.bf25_events(organization_id,meter_id,actor_id,action,details)
 values(m.organization_id,m.id,auth.uid(),'reading_added',jsonb_build_object('reading_id',rid,'reading_at',p_reading_at,'value',p_value));
 return rid;
end $$;

create or replace function public.bf25_set_status(p_meter uuid,p_status text,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare m public.bf25_meters;
begin
 select * into m from public.bf25_meters where id=p_meter for update;
 if not found then raise exception 'Meter not found'; end if;
 if not public.bf25_can(m.organization_id,'utilities.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_status not in('active','inactive','archived') then raise exception 'Invalid meter status'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Reason is required'; end if;
 update public.bf25_meters set status=p_status,updated_by=auth.uid(),updated_at=now() where id=m.id;
 insert into public.bf25_events(organization_id,meter_id,actor_id,action,details)
 values(m.organization_id,m.id,auth.uid(),'status_changed',jsonb_build_object('from',m.status,'to',p_status,'reason',left(p_reason,1000)));
end $$;

create or replace function public.bf25_dashboard(
 p_org uuid default null,
 p_site uuid default null,
 p_from timestamptz default date_trunc('day',now()-interval '30 days'),
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
 if p_from is null or p_to is null or p_from>=p_to then raise exception 'Invalid date range'; end if;
 if p_to-p_from>interval '730 days' then raise exception 'Date range cannot exceed 730 days'; end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;
 if p_org is not null and not public.bf25_can(p_org,'utilities.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with meters as (
  select m.id,m.organization_id,m.client_id,m.site_id,m.asset_id,m.code,m.name,m.meter_type,m.unit,
         m.target_daily,m.status,s.name site_name,a.asset_tag,
         coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name
  from public.bf25_meters m
  join public.bf_sites s on s.id=m.site_id
  left join public.bf_assets a on a.id=m.asset_id
  where m.status<>'archived'
    and (p_org is null or m.organization_id=p_org)
    and (p_site is null or m.site_id=p_site)
    and public.bf25_can(m.organization_id,'utilities.view')
 ), ordered as (
  select r.meter_id,r.reading_at,r.reading_value,
         lag(r.reading_value) over(partition by r.meter_id order by r.reading_at) previous_value
  from public.bf25_meter_readings r
  where exists(select 1 from meters m where m.id=r.meter_id)
    and r.reading_at<=p_to
 ), consumption as (
  select meter_id,reading_at,reading_value,previous_value,
         case when previous_value is null then 0 else greatest(0,reading_value-previous_value) end delta
  from ordered
  where reading_at>p_from and reading_at<=p_to
 ), agg as (
  select m.*,
    coalesce(sum(c.delta),0)::numeric(20,4) consumption,
    count(c.reading_at)::int reading_count,
    max(c.reading_at) last_reading_at,
    (array_agg(c.reading_value order by c.reading_at desc) filter(where c.reading_at is not null))[1] last_reading_value,
    round((extract(epoch from (p_to-p_from))/86400)::numeric,2) period_days
  from meters m
  left join consumption c on c.meter_id=m.id
  group by m.id,m.organization_id,m.client_id,m.site_id,m.asset_id,m.code,m.name,m.meter_type,m.unit,
           m.target_daily,m.status,m.site_name,m.asset_tag,m.asset_name
 ), scored as (
  select a.*,
    round(case when a.period_days>0 then a.consumption/a.period_days else 0 end,4) avg_daily,
    case when a.target_daily is not null and a.target_daily>0 and a.period_days>0
      then round(((a.consumption/a.period_days)-a.target_daily)/a.target_daily*100,2)
      else null end target_variance_pct,
    case when a.target_daily is not null and a.target_daily>0 and a.period_days>0
           and (a.consumption/a.period_days)>a.target_daily*1.25 then true else false end anomaly
  from agg a
 )
 select jsonb_build_object(
  'meters',coalesce((select jsonb_agg(to_jsonb(x) order by x.anomaly desc,x.consumption desc)
      from (select * from scored order by anomaly desc,consumption desc limit p_limit)x),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(to_jsonb(x) order by x.name)
      from (select distinct s.id,s.organization_id,s.client_id,s.name from public.bf_sites s
            where s.status='active' and (p_org is null or s.organization_id=p_org)
              and public.bf25_can(s.organization_id,'utilities.view'))x),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag)
      from (select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,
                   coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) name
            from public.bf_assets a where a.status='active'
              and (p_org is null or a.organization_id=p_org)
              and public.bf25_can(a.organization_id,'utilities.view'))x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'meters',(select count(*) from scored),
    'electricity',(select count(*) from scored where meter_type='electricity'),
    'water',(select count(*) from scored where meter_type='water'),
    'anomalies',(select count(*) from scored where anomaly=true),
    'readings',coalesce((select sum(reading_count) from scored),0)
  ),
  'recent_readings',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.reading_at desc)
    from (
      select r.id,r.meter_id,m.code,m.name,m.unit,r.reading_at,r.reading_value,r.source,r.notes,
             p.full_name,p.email
      from public.bf25_meter_readings r
      join meters m on m.id=r.meter_id
      left join public.bf_profiles p on p.id=r.recorded_by
      where r.reading_at>p_from and r.reading_at<=p_to
      order by r.reading_at desc limit 50
    )x
  ),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.bf25_can(uuid,text),
 public.bf25_create_meter(uuid,uuid,text,text,text,text,numeric,text),
 public.bf25_add_reading(uuid,timestamptz,numeric,text,text),
 public.bf25_set_status(uuid,text,text),
 public.bf25_dashboard(uuid,uuid,timestamptz,timestamptz,integer)
from public,anon;

grant execute on function public.bf25_can(uuid,text),
 public.bf25_create_meter(uuid,uuid,text,text,text,text,numeric,text),
 public.bf25_add_reading(uuid,timestamptz,numeric,text,text),
 public.bf25_set_status(uuid,text,text),
 public.bf25_dashboard(uuid,uuid,timestamptz,timestamptz,integer)
to authenticated;

insert into public.bf_migrations(version) values(25);
commit;
