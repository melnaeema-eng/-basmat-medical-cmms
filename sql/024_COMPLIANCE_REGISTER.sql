-- Basmat Facilities CMMS — Sprint 23
-- Compliance & Statutory Inspection Register
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=22)
 then raise exception 'Install and verify Sprint 22 first'; end if;
 if exists(select 1 from public.bf_migrations where version=23)
 then raise exception 'Sprint 23 already installed'; end if;
 if to_regclass('public.bf_sites') is null
 or to_regclass('public.bf_assets') is null
 then raise exception 'Required compliance sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('compliance.view','View statutory compliance and inspection register'),
 ('compliance.manage','Manage statutory compliance obligations and inspection results')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'compliance.%')
 or (r.code='supervisor' and p.code like 'compliance.%')
 or (r.code='technician' and p.code='compliance.view')
on conflict do nothing;

create table public.bf23_obligations(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 asset_id uuid,
 scope_type text not null check(scope_type in('site','asset')),
 title text not null check(length(btrim(title)) between 3 and 250),
 authority text not null default '',
 category text not null check(category in('safety','fire','electrical','mechanical','environmental','civil','other')),
 severity text not null default 'high' check(severity in('low','medium','high','critical')),
 frequency_months integer check(frequency_months between 1 and 120),
 next_due_date date not null,
 status text not null default 'active' check(status in('active','archived')),
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id),
 check((scope_type='asset')=(asset_id is not null))
);

create index bf23_obligation_due
on public.bf23_obligations(organization_id,status,next_due_date,severity);

create table public.bf23_inspection_records(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 obligation_id uuid not null references public.bf23_obligations(id),
 result text not null check(result in('pass','conditional','fail')),
 completed_at timestamptz not null,
 certificate_number text,
 evidence_reference text,
 valid_until date,
 notes text not null default '',
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 check(valid_until is null or valid_until>=completed_at::date)
);

create index bf23_record_obligation
on public.bf23_inspection_records(obligation_id,completed_at desc);

do $$ declare t text;
begin
 foreach t in array array['bf23_obligations','bf23_inspection_records'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf23_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf23_obligation_read on public.bf23_obligations
for select to authenticated
using(public.bf23_can(organization_id,'compliance.view'));

create policy bf23_record_read on public.bf23_inspection_records
for select to authenticated
using(public.bf23_can(organization_id,'compliance.view'));

create or replace function public.bf23_create_obligation(
 p_scope_type text,
 p_site uuid,
 p_asset uuid,
 p_title text,
 p_authority text,
 p_category text,
 p_severity text,
 p_frequency_months integer,
 p_next_due date,
 p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf_sites; a public.bf_assets; oid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_scope_type not in('site','asset') then raise exception 'Invalid scope type'; end if;
 if length(btrim(coalesce(p_title,'')))<3 then raise exception 'Title is required'; end if;
 if p_category not in('safety','fire','electrical','mechanical','environmental','civil','other')
 then raise exception 'Invalid category'; end if;
 if p_severity not in('low','medium','high','critical') then raise exception 'Invalid severity'; end if;
 if p_frequency_months is not null and p_frequency_months not between 1 and 120
 then raise exception 'Invalid frequency'; end if;
 if p_next_due is null then raise exception 'Next due date is required'; end if;

 select * into s from public.bf_sites where id=p_site and status='active';
 if not found then raise exception 'Active site not found'; end if;

 if not public.bf23_can(s.organization_id,'compliance.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_scope_type='asset' then
  if p_asset is null then raise exception 'Asset is required'; end if;
  select * into a from public.bf_assets where id=p_asset and organization_id=s.organization_id and site_id=s.id and status='active';
  if not found then raise exception 'Asset does not belong to site'; end if;
 elsif p_asset is not null then
  raise exception 'Site obligation cannot reference an asset';
 end if;

 insert into public.bf23_obligations(
  organization_id,client_id,site_id,asset_id,scope_type,title,authority,category,severity,
  frequency_months,next_due_date,notes,created_by
 )
 values(
  s.organization_id,s.client_id,s.id,case when p_scope_type='asset' then a.id else null end,
  p_scope_type,btrim(p_title),left(coalesce(p_authority,''),250),p_category,p_severity,
  p_frequency_months,p_next_due,left(coalesce(p_notes,''),4000),auth.uid()
 )
 returning id into oid;

 return oid;
end $$;

create or replace function public.bf23_record_result(
 p_obligation uuid,
 p_result text,
 p_completed_at timestamptz,
 p_certificate_number text default null,
 p_evidence_reference text default null,
 p_valid_until date default null,
 p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare o public.bf23_obligations; rid uuid; next_due date;
begin
 select * into o from public.bf23_obligations where id=p_obligation for update;
 if not found or o.status<>'active' then raise exception 'Active obligation not found'; end if;
 if not public.bf23_can(o.organization_id,'compliance.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_result not in('pass','conditional','fail') then raise exception 'Invalid result'; end if;
 if p_completed_at is null or p_completed_at>now()+interval '5 minutes'
 then raise exception 'Invalid completion time'; end if;
 if p_valid_until is not null and p_valid_until<p_completed_at::date
 then raise exception 'Validity cannot end before completion'; end if;

 if p_valid_until is not null then
   next_due:=p_valid_until;
 elsif o.frequency_months is not null then
   next_due:=(p_completed_at::date + make_interval(months=>o.frequency_months))::date;
 else
   next_due:=o.next_due_date;
 end if;

 insert into public.bf23_inspection_records(
  organization_id,obligation_id,result,completed_at,certificate_number,evidence_reference,
  valid_until,notes,recorded_by
 )
 values(
  o.organization_id,o.id,p_result,p_completed_at,
  nullif(left(btrim(coalesce(p_certificate_number,'')),250),''),
  nullif(left(btrim(coalesce(p_evidence_reference,'')),1000),''),
  p_valid_until,left(coalesce(p_notes,''),4000),auth.uid()
 )
 returning id into rid;

 update public.bf23_obligations
 set next_due_date=next_due,updated_by=auth.uid(),updated_at=now()
 where id=o.id;

 return rid;
end $$;

create or replace function public.bf23_archive_obligation(p_obligation uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare o public.bf23_obligations;
begin
 select * into o from public.bf23_obligations where id=p_obligation for update;
 if not found then raise exception 'Obligation not found'; end if;
 if o.status<>'active' then raise exception 'Obligation is not active'; end if;
 if not public.bf23_can(o.organization_id,'compliance.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Archive reason is required'; end if;

 update public.bf23_obligations
 set status='archived',
     notes=left(concat_ws(E'\n',notes,'Archived: '||btrim(p_reason)),4000),
     updated_by=auth.uid(),updated_at=now()
 where id=o.id;
end $$;

create or replace function public.bf23_dashboard(
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
 if p_org is not null and not public.bf23_can(p_org,'compliance.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with visible as (
  select o.*,
    s.name site_name,
    a.asset_tag,
    coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,
    case
      when o.next_due_date<current_date then 'overdue'
      when o.next_due_date=current_date then 'due_today'
      when o.next_due_date<=current_date+30 then 'due_30'
      else 'future'
    end due_state,
    (
      select r.result from public.bf23_inspection_records r
      where r.obligation_id=o.id order by r.completed_at desc,r.recorded_at desc limit 1
    ) last_result,
    (
      select r.completed_at from public.bf23_inspection_records r
      where r.obligation_id=o.id order by r.completed_at desc,r.recorded_at desc limit 1
    ) last_completed_at
  from public.bf23_obligations o
  join public.bf_sites s on s.id=o.site_id
  left join public.bf_assets a on a.id=o.asset_id
  where o.status='active'
    and (p_org is null or o.organization_id=p_org)
    and (p_client is null or o.client_id=p_client)
    and public.bf23_can(o.organization_id,'compliance.view')
 ),
 sites as (
  select distinct s.id,s.organization_id,s.client_id,s.name
  from public.bf_sites s
  where s.status='active'
    and (p_org is null or s.organization_id=p_org)
    and (p_client is null or s.client_id=p_client)
    and public.bf23_can(s.organization_id,'compliance.view')
 ),
 assets as (
  select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,
    coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) name
  from public.bf_assets a
  where a.status='active'
    and (p_org is null or a.organization_id=p_org)
    and (p_client is null or a.client_id=p_client)
    and public.bf23_can(a.organization_id,'compliance.view')
 )
 select jsonb_build_object(
  'obligations',coalesce((select jsonb_agg(to_jsonb(x) order by x.next_due_date,x.severity desc)
     from (select * from visible order by next_due_date,severity desc limit p_limit)x),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from sites x),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag) from assets x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from visible),
    'overdue',(select count(*) from visible where due_state='overdue'),
    'due_today',(select count(*) from visible where due_state='due_today'),
    'due_30',(select count(*) from visible where due_state='due_30'),
    'critical',(select count(*) from visible where severity='critical'),
    'failed',(select count(*) from visible where last_result='fail')
  ),
  'recent_results',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.completed_at desc)
    from (
      select r.id,r.obligation_id,o.title,r.result,r.completed_at,r.certificate_number,
             r.evidence_reference,r.valid_until,r.notes,p.full_name,p.email
      from public.bf23_inspection_records r
      join public.bf23_obligations o on o.id=r.obligation_id
      left join public.bf_profiles p on p.id=r.recorded_by
      where (p_org is null or r.organization_id=p_org)
        and public.bf23_can(r.organization_id,'compliance.view')
      order by r.completed_at desc
      limit 50
    ) x
  ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf23_can(uuid,text),
 public.bf23_create_obligation(text,uuid,uuid,text,text,text,text,integer,date,text),
 public.bf23_record_result(uuid,text,timestamptz,text,text,date,text),
 public.bf23_archive_obligation(uuid,text),
 public.bf23_dashboard(uuid,uuid,integer)
from public,anon;

grant execute on function public.bf23_can(uuid,text),
 public.bf23_create_obligation(text,uuid,uuid,text,text,text,text,integer,date,text),
 public.bf23_record_result(uuid,text,timestamptz,text,text,date,text),
 public.bf23_archive_obligation(uuid,text),
 public.bf23_dashboard(uuid,uuid,integer)
to authenticated;

insert into public.bf_migrations(version) values(23);
commit;
