-- Basmat Facilities CMMS — Sprint 24
-- Permit to Work & Safety Control
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=23)
 then raise exception 'Install and verify Sprint 23 first'; end if;
 if exists(select 1 from public.bf_migrations where version=24)
 then raise exception 'Sprint 24 already installed'; end if;
 if to_regclass('public.bf_sites') is null
 or to_regclass('public.bf_assets') is null
 or to_regclass('public.bf_work_orders') is null
 then raise exception 'Required PTW sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('permit.view','View permits to work'),
 ('permit.manage','Create and manage permits to work'),
 ('permit.approve','Approve or reject permits to work')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'permit.%')
 or (r.code='supervisor' and p.code in('permit.view','permit.manage'))
 or (r.code='technician' and p.code='permit.view')
on conflict do nothing;

create sequence public.bf24_permit_seq;
revoke all on sequence public.bf24_permit_seq from public,anon,authenticated;

create table public.bf24_permits(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 work_order_id uuid references public.bf_work_orders(id),
 asset_id uuid references public.bf_assets(id),
 permit_number text not null,
 permit_type text not null check(permit_type in(
   'hot_work','electrical','confined_space','working_at_height','excavation','general'
 )),
 title text not null check(length(btrim(title)) between 3 and 250),
 description text not null default '',
 risk_level text not null default 'medium' check(risk_level in('low','medium','high','critical')),
 status text not null default 'draft' check(status in(
   'draft','submitted','approved','active','closed','rejected','cancelled'
 )),
 valid_from timestamptz not null,
 valid_to timestamptz not null,
 requested_by uuid not null references auth.users(id),
 submitted_at timestamptz,
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 activated_by uuid references auth.users(id),
 activated_at timestamptz,
 closed_by uuid references auth.users(id),
 closed_at timestamptz,
 rejected_by uuid references auth.users(id),
 rejected_at timestamptz,
 rejection_reason text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 cancel_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,permit_number),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 check(valid_to>valid_from),
 check(valid_to-valid_from<=interval '7 days')
);

create index bf24_permit_scope
on public.bf24_permits(organization_id,site_id,status,valid_from desc);

create table public.bf24_controls(
 id uuid primary key default gen_random_uuid(),
 permit_id uuid not null references public.bf24_permits(id),
 organization_id uuid not null references public.bf_organizations(id),
 control_type text not null check(control_type in(
   'isolation','lockout_tagout','gas_test','fire_watch','ppe','barrier','toolbox_talk','other'
 )),
 description text not null check(length(btrim(description))>=3),
 mandatory boolean not null default true,
 verified_by uuid references auth.users(id),
 verified_at timestamptz,
 verification_note text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check((verified_by is null)=(verified_at is null))
);

create index bf24_control_permit on public.bf24_controls(permit_id,mandatory,verified_at);

create table public.bf24_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 permit_id uuid not null references public.bf24_permits(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 from_status text,
 to_status text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create index bf24_events_permit on public.bf24_events(permit_id,id);

do $$ declare t text;
begin
 foreach t in array array['bf24_permits','bf24_controls','bf24_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf24_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf24_permit_read on public.bf24_permits
for select to authenticated
using(public.bf24_can(organization_id,'permit.view'));

create policy bf24_control_read on public.bf24_controls
for select to authenticated
using(public.bf24_can(organization_id,'permit.view'));

create policy bf24_event_read on public.bf24_events
for select to authenticated
using(public.bf24_can(organization_id,'permit.view'));

create or replace function public.bf24_create(
 p_site uuid,
 p_work_order uuid,
 p_asset uuid,
 p_type text,
 p_title text,
 p_description text,
 p_risk text,
 p_valid_from timestamptz,
 p_valid_to timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf_sites; w public.bf_work_orders; a public.bf_assets; pid uuid; pnum text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

 select * into s from public.bf_sites where id=p_site and status='active';
 if not found then raise exception 'Active site not found'; end if;

 if not public.bf24_can(s.organization_id,'permit.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_type not in('hot_work','electrical','confined_space','working_at_height','excavation','general')
 then raise exception 'Invalid permit type'; end if;
 if p_risk not in('low','medium','high','critical') then raise exception 'Invalid risk level'; end if;
 if length(btrim(coalesce(p_title,'')))<3 then raise exception 'Title is required'; end if;
 if p_valid_from is null or p_valid_to is null or p_valid_to<=p_valid_from
 or p_valid_to-p_valid_from>interval '7 days'
 then raise exception 'Invalid permit validity'; end if;

 if p_work_order is not null then
   select * into w from public.bf_work_orders where id=p_work_order;
   if not found or w.organization_id<>s.organization_id or w.client_id<>s.client_id or w.site_id<>s.id
   then raise exception 'Work order does not belong to site'; end if;
   if w.status in('closed','cancelled') then raise exception 'Work order is not active'; end if;
 end if;

 if p_asset is not null then
   select * into a from public.bf_assets
   where id=p_asset and organization_id=s.organization_id and site_id=s.id and status='active';
   if not found then raise exception 'Asset does not belong to site'; end if;
 end if;

 pnum:='PTW-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf24_permit_seq')::text,6,'0');

 insert into public.bf24_permits(
  organization_id,client_id,site_id,work_order_id,asset_id,permit_number,permit_type,
  title,description,risk_level,valid_from,valid_to,requested_by
 )
 values(
  s.organization_id,s.client_id,s.id,p_work_order,p_asset,pnum,p_type,
  btrim(p_title),left(coalesce(p_description,''),4000),p_risk,p_valid_from,p_valid_to,auth.uid()
 )
 returning id into pid;

 insert into public.bf24_events(organization_id,permit_id,actor_id,action,to_status,details)
 values(s.organization_id,pid,auth.uid(),'created','draft',jsonb_build_object('permit_number',pnum));

 return pid;
end $$;

create or replace function public.bf24_add_control(
 p_permit uuid,p_type text,p_description text,p_mandatory boolean default true)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare p public.bf24_permits; cid uuid;
begin
 select * into p from public.bf24_permits where id=p_permit for update;
 if not found then raise exception 'Permit not found'; end if;
 if p.status<>'draft' then raise exception 'Controls can only be added while draft'; end if;
 if not public.bf24_can(p.organization_id,'permit.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_type not in('isolation','lockout_tagout','gas_test','fire_watch','ppe','barrier','toolbox_talk','other')
 then raise exception 'Invalid control type'; end if;
 if length(btrim(coalesce(p_description,'')))<3 then raise exception 'Control description is required'; end if;

 insert into public.bf24_controls(
  permit_id,organization_id,control_type,description,mandatory,created_by
 )
 values(p.id,p.organization_id,p_type,btrim(p_description),coalesce(p_mandatory,true),auth.uid())
 returning id into cid;

 insert into public.bf24_events(organization_id,permit_id,actor_id,action,details)
 values(p.organization_id,p.id,auth.uid(),'control_added',jsonb_build_object('control_id',cid,'control_type',p_type));

 return cid;
end $$;

create or replace function public.bf24_verify_control(
 p_control uuid,p_note text default '')
returns void
language plpgsql
security definer
set search_path=''
as $$
declare c public.bf24_controls; p public.bf24_permits;
begin
 select * into c from public.bf24_controls where id=p_control for update;
 if not found then raise exception 'Control not found'; end if;
 select * into p from public.bf24_permits where id=c.permit_id;
 if p.status not in('approved','active') then raise exception 'Permit is not ready for verification'; end if;
 if not public.bf24_can(c.organization_id,'permit.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 update public.bf24_controls
 set verified_by=auth.uid(),verified_at=now(),verification_note=left(coalesce(p_note,''),1000)
 where id=c.id;

 insert into public.bf24_events(organization_id,permit_id,actor_id,action,details)
 values(c.organization_id,c.permit_id,auth.uid(),'control_verified',jsonb_build_object('control_id',c.id));
end $$;

create or replace function public.bf24_action(
 p_permit uuid,p_action text,p_reason text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare p public.bf24_permits; old_status text;
begin
 select * into p from public.bf24_permits where id=p_permit for update;
 if not found then raise exception 'Permit not found'; end if;
 old_status:=p.status;

 if p_action='submit' then
   if not public.bf24_can(p.organization_id,'permit.manage')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status<>'draft' then raise exception 'Only draft permits can be submitted'; end if;
   if p.risk_level in('high','critical') and not exists(
      select 1 from public.bf24_controls c where c.permit_id=p.id and c.mandatory=true
   ) then raise exception 'High-risk permit requires at least one mandatory control'; end if;

   update public.bf24_permits set status='submitted',submitted_at=now(),updated_at=now() where id=p.id;

 elsif p_action='approve' then
   if not public.bf24_can(p.organization_id,'permit.approve')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status<>'submitted' then raise exception 'Permit is not submitted'; end if;
   if p.requested_by=auth.uid() then raise exception 'Requester cannot approve own permit'; end if;

   update public.bf24_permits
   set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
   where id=p.id;

 elsif p_action='reject' then
   if not public.bf24_can(p.organization_id,'permit.approve')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status<>'submitted' then raise exception 'Permit is not submitted'; end if;
   if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Rejection reason is required'; end if;

   update public.bf24_permits
   set status='rejected',rejected_by=auth.uid(),rejected_at=now(),
       rejection_reason=left(btrim(p_reason),1000),updated_at=now()
   where id=p.id;

 elsif p_action='activate' then
   if not public.bf24_can(p.organization_id,'permit.manage')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status<>'approved' then raise exception 'Permit is not approved'; end if;
   if now()<p.valid_from or now()>p.valid_to then raise exception 'Permit is outside validity window'; end if;
   if exists(select 1 from public.bf24_controls c
     where c.permit_id=p.id and c.mandatory=true and c.verified_at is null)
   then raise exception 'All mandatory controls must be verified before activation'; end if;

   update public.bf24_permits
   set status='active',activated_by=auth.uid(),activated_at=now(),updated_at=now()
   where id=p.id;

 elsif p_action='close' then
   if not public.bf24_can(p.organization_id,'permit.manage')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status<>'active' then raise exception 'Only active permits can be closed'; end if;

   update public.bf24_permits
   set status='closed',closed_by=auth.uid(),closed_at=now(),updated_at=now()
   where id=p.id;

 elsif p_action='cancel' then
   if not public.bf24_can(p.organization_id,'permit.manage')
   then raise exception 'Permission denied' using errcode='42501'; end if;
   if p.status not in('draft','submitted','approved','active') then raise exception 'Permit cannot be cancelled'; end if;
   if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Cancellation reason is required'; end if;

   update public.bf24_permits
   set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
       cancel_reason=left(btrim(p_reason),1000),updated_at=now()
   where id=p.id;

 else
   raise exception 'Invalid permit action';
 end if;

 select * into p from public.bf24_permits where id=p.id;
 insert into public.bf24_events(organization_id,permit_id,actor_id,action,from_status,to_status,details)
 values(p.organization_id,p.id,auth.uid(),p_action,old_status,p.status,
        case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason',left(p_reason,1000)) end);
end $$;

create or replace function public.bf24_dashboard(
 p_org uuid default null,
 p_status text default null,
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
 if p_status is not null and p_status not in('draft','submitted','approved','active','closed','rejected','cancelled')
 then raise exception 'Invalid status filter'; end if;
 if p_org is not null and not public.bf24_can(p_org,'permit.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with permits as (
  select p.*,
    s.name site_name,
    a.asset_tag,
    coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,
    w.work_order_number,
    (select count(*) from public.bf24_controls c where c.permit_id=p.id) control_count,
    (select count(*) from public.bf24_controls c where c.permit_id=p.id and c.mandatory=true and c.verified_at is null) unverified_mandatory
  from public.bf24_permits p
  join public.bf_sites s on s.id=p.site_id
  left join public.bf_assets a on a.id=p.asset_id
  left join public.bf_work_orders w on w.id=p.work_order_id
  where (p_org is null or p.organization_id=p_org)
    and (p_status is null or p.status=p_status)
    and public.bf24_can(p.organization_id,'permit.view')
 ),
 sites as (
  select distinct s.id,s.organization_id,s.client_id,s.name
  from public.bf_sites s
  where s.status='active'
    and (p_org is null or s.organization_id=p_org)
    and public.bf24_can(s.organization_id,'permit.view')
 ),
 assets as (
  select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,
         coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) name
  from public.bf_assets a
  where a.status='active'
    and (p_org is null or a.organization_id=p_org)
    and public.bf24_can(a.organization_id,'permit.view')
 ),
 work_orders as (
  select w.id,w.organization_id,w.client_id,w.site_id,w.asset_id,w.work_order_number,w.title,w.status
  from public.bf_work_orders w
  where w.status not in('closed','cancelled')
    and (p_org is null or w.organization_id=p_org)
    and public.bf24_can(w.organization_id,'permit.view')
 )
 select jsonb_build_object(
  'permits',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (select * from permits order by created_at desc limit p_limit)x),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from sites x),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag) from assets x),'[]'::jsonb),
  'work_orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.work_order_number desc) from work_orders x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from permits),
    'submitted',(select count(*) from permits where status='submitted'),
    'approved',(select count(*) from permits where status='approved'),
    'active',(select count(*) from permits where status='active'),
    'expiring_24h',(select count(*) from permits where status in('approved','active') and valid_to between now() and now()+interval '24 hours'),
    'high_risk',(select count(*) from permits where risk_level in('high','critical') and status not in('closed','cancelled','rejected'))
  )
 ) into result;

 return result;
end $$;

create or replace function public.bf24_detail(p_permit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare p public.bf24_permits; result jsonb;
begin
 select * into p from public.bf24_permits where id=p_permit;
 if not found then raise exception 'Permit not found'; end if;
 if not public.bf24_can(p.organization_id,'permit.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 select jsonb_build_object(
  'permit',to_jsonb(p),
  'controls',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.bf24_controls c where c.permit_id=p.id),'[]'::jsonb),
  'events',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.id desc)
    from (
      select e.*,pr.full_name,pr.email
      from public.bf24_events e
      left join public.bf_profiles pr on pr.id=e.actor_id
      where e.permit_id=p.id order by e.id desc limit 100
    ) x
  ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf24_can(uuid,text),
 public.bf24_create(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz),
 public.bf24_add_control(uuid,text,text,boolean),
 public.bf24_verify_control(uuid,text),
 public.bf24_action(uuid,text,text),
 public.bf24_dashboard(uuid,text,integer),
 public.bf24_detail(uuid)
from public,anon;

grant execute on function public.bf24_can(uuid,text),
 public.bf24_create(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz),
 public.bf24_add_control(uuid,text,text,boolean),
 public.bf24_verify_control(uuid,text),
 public.bf24_action(uuid,text,text),
 public.bf24_dashboard(uuid,text,integer),
 public.bf24_detail(uuid)
to authenticated;

insert into public.bf_migrations(version) values(24);
commit;
