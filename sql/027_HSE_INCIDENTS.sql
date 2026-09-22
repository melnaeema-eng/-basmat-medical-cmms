-- Basmat Facilities CMMS — Sprint 26
-- HSE Incidents, Near Misses & Corrective Actions
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=25)
 then raise exception 'Install and verify Sprint 25 first'; end if;
 if exists(select 1 from public.bf_migrations where version=26)
 then raise exception 'Sprint 26 already installed'; end if;
 if to_regclass('public.bf_sites') is null or to_regclass('public.bf_assets') is null or to_regclass('public.bf_work_orders') is null
 then raise exception 'Required HSE sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('hse.view','View HSE incidents and near misses'),
 ('hse.manage','Create and manage HSE incidents and corrective actions'),
 ('hse.approve','Review and close HSE incidents')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'hse.%')
   or (r.code='supervisor' and p.code in('hse.view','hse.manage'))
   or (r.code='technician' and p.code='hse.view')
on conflict do nothing;

create sequence public.bf26_incident_seq;
revoke all on sequence public.bf26_incident_seq from public,anon,authenticated;

create table public.bf26_incidents(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 asset_id uuid references public.bf_assets(id),
 work_order_id uuid references public.bf_work_orders(id),
 incident_number text not null,
 incident_type text not null check(incident_type in('injury','near_miss','property_damage','environmental','unsafe_condition','other')),
 severity text not null check(severity in('low','medium','high','critical')),
 title text not null check(length(btrim(title)) between 3 and 250),
 description text not null check(length(btrim(description))>=5),
 occurred_at timestamptz not null,
 reported_by uuid not null references auth.users(id),
 status text not null default 'open' check(status in('open','investigating','action_required','ready_for_close','closed','cancelled')),
 immediate_action text not null default '',
 root_cause text,investigation_notes text,
 closed_by uuid references auth.users(id),closed_at timestamptz,closure_notes text,
 cancelled_by uuid references auth.users(id),cancelled_at timestamptz,cancel_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,incident_number),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 check((status='closed')=(closed_at is not null)),
 check((status='cancelled')=(cancelled_at is not null))
);
create index bf26_incident_scope on public.bf26_incidents(organization_id,site_id,status,severity,occurred_at desc);

create table public.bf26_actions(
 id uuid primary key default gen_random_uuid(),
 incident_id uuid not null references public.bf26_incidents(id),
 organization_id uuid not null references public.bf_organizations(id),
 action_text text not null check(length(btrim(action_text))>=5),
 owner_id uuid references public.bf_profiles(id),
 due_date date,
 priority text not null default 'medium' check(priority in('low','medium','high','critical')),
 status text not null default 'open' check(status in('open','in_progress','completed','cancelled')),
 completed_by uuid references auth.users(id),completed_at timestamptz,completion_note text,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((status='completed')=(completed_at is not null))
);
create index bf26_action_incident on public.bf26_actions(incident_id,status,due_date);

create table public.bf26_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 incident_id uuid not null references public.bf26_incidents(id),
 actor_id uuid not null references auth.users(id),
 action text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index bf26_event_incident on public.bf26_events(incident_id,id);

do $$ declare t text; begin
 foreach t in array array['bf26_incidents','bf26_actions','bf26_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf26_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf26_incident_read on public.bf26_incidents for select to authenticated using(public.bf26_can(organization_id,'hse.view'));
create policy bf26_action_read on public.bf26_actions for select to authenticated using(public.bf26_can(organization_id,'hse.view'));
create policy bf26_event_read on public.bf26_events for select to authenticated using(public.bf26_can(organization_id,'hse.view'));

create or replace function public.bf26_create_incident(
 p_site uuid,p_asset uuid,p_work_order uuid,p_type text,p_severity text,
 p_title text,p_description text,p_occurred_at timestamptz,p_immediate_action text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare s public.bf_sites; a public.bf_assets; w public.bf_work_orders; iid uuid; num text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into s from public.bf_sites where id=p_site and status='active';
 if not found then raise exception 'Active site not found'; end if;
 if not public.bf26_can(s.organization_id,'hse.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_type not in('injury','near_miss','property_damage','environmental','unsafe_condition','other') then raise exception 'Invalid incident type'; end if;
 if p_severity not in('low','medium','high','critical') then raise exception 'Invalid severity'; end if;
 if p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then raise exception 'Invalid occurrence time'; end if;
 if length(btrim(coalesce(p_title,'')))<3 or length(btrim(coalesce(p_description,'')))<5 then raise exception 'Title and description are required'; end if;
 if p_asset is not null then
   select * into a from public.bf_assets where id=p_asset and organization_id=s.organization_id and site_id=s.id and status='active';
   if not found then raise exception 'Asset does not belong to site'; end if;
 end if;
 if p_work_order is not null then
   select * into w from public.bf_work_orders where id=p_work_order;
   if not found or w.organization_id<>s.organization_id or w.site_id<>s.id then raise exception 'Work order does not belong to site'; end if;
 end if;
 num:='HSE-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf26_incident_seq')::text,6,'0');
 insert into public.bf26_incidents(organization_id,client_id,site_id,asset_id,work_order_id,incident_number,incident_type,severity,title,description,occurred_at,reported_by,immediate_action)
 values(s.organization_id,s.client_id,s.id,p_asset,p_work_order,num,p_type,p_severity,btrim(p_title),btrim(p_description),p_occurred_at,auth.uid(),left(coalesce(p_immediate_action,''),4000))
 returning id into iid;
 insert into public.bf26_events(organization_id,incident_id,actor_id,action,details)
 values(s.organization_id,iid,auth.uid(),'created',jsonb_build_object('incident_number',num,'severity',p_severity));
 return iid;
end $$;

create or replace function public.bf26_add_action(p_incident uuid,p_action_text text,p_owner uuid,p_due_date date,p_priority text default 'medium')
returns uuid language plpgsql security definer set search_path=''
as $$
declare i public.bf26_incidents; aid uuid;
begin
 select * into i from public.bf26_incidents where id=p_incident for update;
 if not found then raise exception 'Incident not found'; end if;
 if i.status in('closed','cancelled') then raise exception 'Incident is not active'; end if;
 if not public.bf26_can(i.organization_id,'hse.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_action_text,'')))<5 then raise exception 'Action is required'; end if;
 if p_priority not in('low','medium','high','critical') then raise exception 'Invalid priority'; end if;
 if p_due_date is not null and p_due_date<current_date then raise exception 'Due date cannot be in the past'; end if;
 if p_owner is not null and not exists(
   select 1 from public.bf_user_roles ur join public.bf_profiles p on p.id=ur.user_id
   where ur.user_id=p_owner and ur.organization_id=i.organization_id and p.status='active'
 ) then raise exception 'Action owner is not active in organization'; end if;
 insert into public.bf26_actions(incident_id,organization_id,action_text,owner_id,due_date,priority,created_by)
 values(i.id,i.organization_id,btrim(p_action_text),p_owner,p_due_date,p_priority,auth.uid()) returning id into aid;
 update public.bf26_incidents set status=case when status='open' then 'action_required' else status end,updated_at=now() where id=i.id;
 insert into public.bf26_events(organization_id,incident_id,actor_id,action,details)
 values(i.organization_id,i.id,auth.uid(),'action_added',jsonb_build_object('action_id',aid));
 return aid;
end $$;

create or replace function public.bf26_complete_action(p_action uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare a public.bf26_actions; i public.bf26_incidents;
begin
 select * into a from public.bf26_actions where id=p_action for update;
 if not found then raise exception 'Action not found'; end if;
 select * into i from public.bf26_incidents where id=a.incident_id;
 if not public.bf26_can(a.organization_id,'hse.manage') and a.owner_id is distinct from auth.uid()
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if a.status not in('open','in_progress') then raise exception 'Action is not open'; end if;
 if length(btrim(coalesce(p_note,'')))<3 then raise exception 'Completion note is required'; end if;
 update public.bf26_actions set status='completed',completed_by=auth.uid(),completed_at=now(),completion_note=left(btrim(p_note),2000),updated_at=now() where id=a.id;
 if not exists(select 1 from public.bf26_actions x where x.incident_id=i.id and x.status in('open','in_progress')) then
   update public.bf26_incidents set status=case when status='action_required' then 'ready_for_close' else status end,updated_at=now() where id=i.id;
 end if;
 insert into public.bf26_events(organization_id,incident_id,actor_id,action,details)
 values(a.organization_id,i.id,auth.uid(),'action_completed',jsonb_build_object('action_id',a.id));
end $$;

create or replace function public.bf26_update_investigation(p_incident uuid,p_root_cause text,p_notes text,p_immediate_action text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare i public.bf26_incidents;
begin
 select * into i from public.bf26_incidents where id=p_incident for update;
 if not found then raise exception 'Incident not found'; end if;
 if i.status in('closed','cancelled') then raise exception 'Incident is not active'; end if;
 if not public.bf26_can(i.organization_id,'hse.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_root_cause,'')))<5 then raise exception 'Root cause is required'; end if;
 update public.bf26_incidents
 set root_cause=left(btrim(p_root_cause),4000),investigation_notes=left(coalesce(p_notes,''),4000),
     immediate_action=case when p_immediate_action is null then immediate_action else left(p_immediate_action,4000) end,
     status=case when status='open' then 'investigating' else status end,updated_at=now()
 where id=i.id;
 insert into public.bf26_events(organization_id,incident_id,actor_id,action) values(i.organization_id,i.id,auth.uid(),'investigation_updated');
end $$;

create or replace function public.bf26_close_incident(p_incident uuid,p_closure_notes text)
returns void language plpgsql security definer set search_path=''
as $$
declare i public.bf26_incidents;
begin
 select * into i from public.bf26_incidents where id=p_incident for update;
 if not found then raise exception 'Incident not found'; end if;
 if i.status in('closed','cancelled') then raise exception 'Incident is not active'; end if;
 if not public.bf26_can(i.organization_id,'hse.approve') then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(i.root_cause,'')))<5 then raise exception 'Root cause is required before closure'; end if;
 if exists(select 1 from public.bf26_actions a where a.incident_id=i.id and a.status in('open','in_progress'))
 then raise exception 'Complete all corrective actions before closure'; end if;
 if length(btrim(coalesce(p_closure_notes,'')))<5 then raise exception 'Closure notes are required'; end if;
 update public.bf26_incidents set status='closed',closed_by=auth.uid(),closed_at=now(),closure_notes=left(btrim(p_closure_notes),4000),updated_at=now() where id=i.id;
 insert into public.bf26_events(organization_id,incident_id,actor_id,action) values(i.organization_id,i.id,auth.uid(),'closed');
end $$;

create or replace function public.bf26_dashboard(p_org uuid default null,p_status text default null,p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;
 if p_status is not null and p_status not in('open','investigating','action_required','ready_for_close','closed','cancelled') then raise exception 'Invalid status filter'; end if;
 if p_org is not null and not public.bf26_can(p_org,'hse.view') then raise exception 'Permission denied' using errcode='42501'; end if;

 with incidents as (
  select i.*,s.name site_name,a.asset_tag,coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) asset_name,w.work_order_number,
    (select count(*) from public.bf26_actions x where x.incident_id=i.id and x.status in('open','in_progress')) open_actions,
    (select count(*) from public.bf26_actions x where x.incident_id=i.id and x.status='completed') completed_actions
  from public.bf26_incidents i
  join public.bf_sites s on s.id=i.site_id
  left join public.bf_assets a on a.id=i.asset_id
  left join public.bf_work_orders w on w.id=i.work_order_id
  where (p_org is null or i.organization_id=p_org) and (p_status is null or i.status=p_status) and public.bf26_can(i.organization_id,'hse.view')
 ),
 sites as (
  select distinct s.id,s.organization_id,s.client_id,s.name from public.bf_sites s
  where s.status='active' and (p_org is null or s.organization_id=p_org) and public.bf26_can(s.organization_id,'hse.view')
 ),
 assets as (
  select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,coalesce(nullif(a.name_en,''),nullif(a.name_ar,''),a.asset_tag) name
  from public.bf_assets a where a.status='active' and (p_org is null or a.organization_id=p_org) and public.bf26_can(a.organization_id,'hse.view')
 ),
 work_orders as (
  select w.id,w.organization_id,w.client_id,w.site_id,w.asset_id,w.work_order_number,w.title,w.status
  from public.bf_work_orders w where w.status not in('closed','cancelled') and (p_org is null or w.organization_id=p_org) and public.bf26_can(w.organization_id,'hse.view')
 )
 select jsonb_build_object(
  'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select * from incidents order by occurred_at desc limit p_limit)x),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from sites x),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag) from assets x),'[]'::jsonb),
  'work_orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.work_order_number desc) from work_orders x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from incidents),
    'open',(select count(*) from incidents where status not in('closed','cancelled')),
    'critical',(select count(*) from incidents where severity='critical' and status not in('closed','cancelled')),
    'near_miss',(select count(*) from incidents where incident_type='near_miss'),
    'injury',(select count(*) from incidents where incident_type='injury'),
    'ready_for_close',(select count(*) from incidents where status='ready_for_close')
  )
 ) into result;
 return result;
end $$;

create or replace function public.bf26_detail(p_incident uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare i public.bf26_incidents; result jsonb;
begin
 select * into i from public.bf26_incidents where id=p_incident;
 if not found then raise exception 'Incident not found'; end if;
 if not public.bf26_can(i.organization_id,'hse.view') then raise exception 'Permission denied' using errcode='42501'; end if;
 select jsonb_build_object(
  'incident',to_jsonb(i),
  'actions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (
    select a.*,p.full_name,p.email from public.bf26_actions a left join public.bf_profiles p on p.id=a.owner_id where a.incident_id=i.id order by a.created_at
  )x),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
    select e.*,p.full_name,p.email from public.bf26_events e left join public.bf_profiles p on p.id=e.actor_id where e.incident_id=i.id order by e.id desc limit 100
  )x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.bf26_can(uuid,text),
 public.bf26_create_incident(uuid,uuid,uuid,text,text,text,text,timestamptz,text),
 public.bf26_add_action(uuid,text,uuid,date,text),public.bf26_complete_action(uuid,text),
 public.bf26_update_investigation(uuid,text,text,text),public.bf26_close_incident(uuid,text),
 public.bf26_dashboard(uuid,text,integer),public.bf26_detail(uuid) from public,anon;

grant execute on function public.bf26_can(uuid,text),
 public.bf26_create_incident(uuid,uuid,uuid,text,text,text,text,timestamptz,text),
 public.bf26_add_action(uuid,text,uuid,date,text),public.bf26_complete_action(uuid,text),
 public.bf26_update_investigation(uuid,text,text,text),public.bf26_close_incident(uuid,text),
 public.bf26_dashboard(uuid,text,integer),public.bf26_detail(uuid) to authenticated;

insert into public.bf_migrations(version) values(26);
commit;
