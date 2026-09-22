-- Basmat Facilities CMMS Sprint 4: corrective core.
-- Run once after 004. No existing tables or data are deleted.
begin;
do $$ begin
 if not exists(select 1 from public.bf_migrations where version=32) then
  raise exception 'Install migration 004 first';
 end if;
 if exists(select 1 from public.bf_migrations where version=4) then
  raise exception 'Sprint 4 already installed';
 end if;
end $$;

insert into public.bf_permissions(code,description) values
('corrective.view','View corrective maintenance'),
('corrective.request','Submit service requests'),
('corrective.manage','Triage and manage work orders'),
('corrective.execute','Execute assigned work orders'),
('corrective.approve','Approve and close work orders')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager','supervisor')
 and p.code like 'corrective.%')
or (r.code='help_desk' and p.code in('corrective.view','corrective.request','corrective.manage'))
or (r.code='technician' and p.code in('corrective.view','corrective.request','corrective.execute'))
on conflict do nothing;

-- New operational permission checks do not inherit broad legacy RLS policies.
create or replace function public.bf4_staff(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
 and exists(select 1 from public.bf_profiles where id=auth.uid() and status='active')
 and (public.bf_is_super_admin() or public.bf_can(p_org,p_permission));
$$;
create or replace function public.bf4_client(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and exists(
 select 1 from public.bf_profiles p join public.bf_client_access a on a.user_id=p.id
 where p.id=auth.uid() and p.status='active' and a.organization_id=p_org and a.client_id=p_client);
$$;

create table public.bf_service_requests(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,site_id uuid not null,contract_id uuid,
 asset_id uuid,request_number text not null,
 title text not null check(length(btrim(title)) between 3 and 250),
 description text not null default '',
 priority text not null default 'P3' check(priority in('P1','P2','P3','P4')),
 status text not null default 'submitted' check(status in('submitted','triaged','converted','rejected','cancelled')),
 reported_at timestamptz not null default now(),
 reported_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(organization_id,request_number),
 unique(id,organization_id,client_id,site_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id)
);
create table public.bf_work_orders(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,site_id uuid not null,contract_id uuid,asset_id uuid,
 request_id uuid,work_order_number text not null,
 title text not null check(length(btrim(title)) between 3 and 250),
 description text not null default '',
 priority text not null default 'P3' check(priority in('P1','P2','P3','P4')),
 status text not null default 'draft' check(status in('draft','assigned','accepted','in_progress','on_hold','completed','approved','closed','cancelled')),
 approval_status text not null default 'not_submitted' check(approval_status in('not_submitted','pending','approved','rejected')),
 sla_status text not null default 'not_configured' check(sla_status in('not_configured','running','paused','met','breached')),
 response_due_at timestamptz,completion_due_at timestamptz,
 assigned_at timestamptz,accepted_at timestamptz,started_at timestamptz,
 completed_at timestamptz,closed_at timestamptz,
 diagnosis text,root_cause text,work_performed text,tests_performed text,
 recommendations text,hold_reason text,hold_started_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,work_order_number),
 unique(id,organization_id,client_id,site_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id),
 foreign key(request_id,organization_id,client_id,site_id) references public.bf_service_requests(id,organization_id,client_id,site_id)
);
create table public.bf_work_order_assignments(
 work_order_id uuid not null references public.bf_work_orders(id),
 user_id uuid not null references public.bf_profiles(id),
 assigned_by uuid not null references auth.users(id),
 assigned_at timestamptz not null default now(),
 primary key(work_order_id,user_id)
);
create table public.bf_corrective_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,client_id uuid not null,
 request_id uuid references public.bf_service_requests(id),
 work_order_id uuid references public.bf_work_orders(id),
 actor_id uuid not null references auth.users(id),
 action text not null,from_status text,to_status text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check((request_id is null)<>(work_order_id is null))
);
create index bf4_requests_scope on public.bf_service_requests(organization_id,client_id,site_id,reported_at desc);
create index bf4_wo_scope on public.bf_work_orders(organization_id,client_id,site_id,created_at desc);
create index bf4_wo_status on public.bf_work_orders(organization_id,status,priority);
create index bf4_events_wo on public.bf_corrective_events(work_order_id,id);
create index bf4_events_request on public.bf_corrective_events(request_id,id);
create index bf4_assign_user on public.bf_work_order_assignments(user_id,work_order_id);

create or replace function public.bf4_assigned(p_wo uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.bf_work_order_assignments a
 join public.bf_profiles p on p.id=a.user_id
 where a.work_order_id=p_wo and a.user_id=auth.uid() and p.status='active');
$$;



-- Scoped directory: no arbitrary cross-tenant profile enumeration.
create or replace function public.bf4_user_can(p_user uuid,p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.bf_profiles p
 join public.bf_user_roles ur on ur.user_id=p.id
 join public.bf_roles r on r.id=ur.role_id
 join public.bf_role_permissions rp on rp.role_id=r.id
 join public.bf_permissions pm on pm.id=rp.permission_id
 where p.id=p_user and p.status='active' and ur.organization_id=p_org
 and (r.organization_id is null or r.organization_id=p_org)
 and r.code not in('client_admin','client_user') and pm.code=p_permission);
$$;
create or replace function public.bf4_staff_directory()
returns table(id uuid,full_name text,email text,status text,organization_id uuid)
language sql stable security definer set search_path=''
as $$
 select distinct p.id,p.full_name::text,p.email::text,p.status::text,ur.organization_id
 from public.bf_profiles p join public.bf_user_roles ur on ur.user_id=p.id
 where p.status='active'
 and public.bf4_staff(ur.organization_id,'corrective.manage')
 and public.bf4_user_can(p.id,ur.organization_id,'corrective.execute');
$$;

-- All operational writes must pass through the audited state-machine RPC.
create or replace function public.bf4_write_guard()
returns trigger language plpgsql set search_path=''
as $$
begin
 if current_setting('bf4.authorized_write',true) is distinct from 'yes' then
  raise exception 'Use the corrective workflow API' using errcode='42501';
 end if;
 return coalesce(new,old);
end $$;
do $$ declare t text;begin
 foreach t in array array['bf_service_requests','bf_work_orders','bf_work_order_assignments','bf_corrective_events'] loop
  execute format('create trigger bf4_write_guard before insert or update or delete on public.%I for each row execute function public.bf4_write_guard()',t);
 end loop;
end $$;
-- Only authenticated requests may use the public workflow API.
-- Event and assignment reads are scoped to the parent work order.
do $$ declare t text;begin
 foreach t in array array['bf_service_requests','bf_work_orders','bf_work_order_assignments','bf_corrective_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.bf_service_requests,public.bf_work_orders,public.bf_work_order_assignments,public.bf_corrective_events to authenticated;
create policy bf4_sr_read on public.bf_service_requests for select to authenticated
using(public.bf4_staff(organization_id,'corrective.view')
 or public.bf4_client(organization_id,client_id));
create policy bf4_wo_read on public.bf_work_orders for select to authenticated
using(public.bf4_staff(organization_id,'corrective.view')
 or public.bf4_client(organization_id,client_id));
create policy bf4_assign_read on public.bf_work_order_assignments for select to authenticated
using(exists(select 1 from public.bf_work_orders w where w.id=work_order_id));
create policy bf4_events_read on public.bf_corrective_events for select to authenticated
using((action in('note','set_sla') and public.bf4_staff(organization_id,'corrective.view')) or (action not in('note','set_sla') and ((request_id is not null and exists(select 1 from public.bf_service_requests s where s.id=request_id))
or (work_order_id is not null and exists(select 1 from public.bf_work_orders w where w.id=work_order_id)))));

-- A single narrow RPC validates every mutation, locks rows and records an event.
create or replace function public.bf4_action(p_kind text,p_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare s public.bf_service_requests; w public.bf_work_orders; a public.bf_assets;
 v uuid; org uuid; client uuid; site uuid; old_status text; new_status text;
 target uuid; assignee uuid; allowed boolean; new_code text; i integer;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>65536 then
  raise exception 'Invalid payload';
 end if;
 if p_kind not in('request','work_order') then raise exception 'Invalid entity';end if;
 perform set_config('bf4.authorized_write','yes',true);
 if p_kind='request' then
  if p_action='create' then
   org:=(p_data->>'organization_id')::uuid;client:=(p_data->>'client_id')::uuid;site:=(p_data->>'site_id')::uuid;
   if not(public.bf4_staff(org,'corrective.request') or public.bf4_client(org,client)) then raise exception 'Permission denied' using errcode='42501';end if;
   if not exists(select 1 from public.bf_sites where id=site and organization_id=org and client_id=client and status='active') then raise exception 'Invalid site';end if;
   if nullif(p_data->>'asset_id','') is not null then
    select * into a from public.bf_assets where id=(p_data->>'asset_id')::uuid and organization_id=org and site_id=site and status='active';
    if not found then raise exception 'Invalid asset';end if;
   end if;
   s.id:=gen_random_uuid();s.organization_id:=org;s.client_id:=client;s.site_id:=site;
   s.contract_id:=nullif(p_data->>'contract_id','')::uuid;
   s.asset_id:=a.id;s.title:=btrim(p_data->>'title');s.description:=coalesce(p_data->>'description','');
   s.priority:=coalesce(p_data->>'priority','P3');
   if s.contract_id is not null and not exists(select 1 from public.bf_contracts where id=s.contract_id and organization_id=org and client_id=client) then raise exception 'Invalid contract';end if;
   s.request_number:='SR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf4_request_seq')::text,6,'0');
   s.reported_by:=auth.uid();
   insert into public.bf_service_requests(id,organization_id,client_id,site_id,contract_id,asset_id,request_number,title,description,priority,reported_by)
   values(s.id,org,client,site,s.contract_id,s.asset_id,s.request_number,s.title,s.description,s.priority,auth.uid()) returning * into s;
   insert into public.bf_corrective_events(organization_id,client_id,request_id,actor_id,action,to_status,details)
   values(org,client,s.id,auth.uid(),'created',s.status,jsonb_build_object('priority',s.priority));
   return s.id;
  end if;
  select * into s from public.bf_service_requests where id=p_id for update;
  if not found then raise exception 'Request not found';end if;
  if not public.bf4_staff(s.organization_id,'corrective.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  old_status:=s.status;
  if p_action='triage' and s.status='submitted' then
   s.status:='triaged';s.priority:=coalesce(p_data->>'priority',s.priority);
  elsif p_action in('reject','cancel') and s.status in('submitted','triaged') then
   s.status:=case when p_action='reject' then 'rejected' else 'cancelled' end;
   if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reason required';end if;
  elsif p_action='convert' and s.status in('submitted','triaged','converted') then
   -- A request may have multiple work orders; repeated conversion is intentional.
   return public.bf4_action('work_order',null,'create',jsonb_build_object('request_id',s.id,'organization_id',s.organization_id,'client_id',s.client_id,'site_id',s.site_id,'contract_id',s.contract_id,'asset_id',s.asset_id,'title',s.title,'description',s.description,'priority',s.priority));
  else raise exception 'Invalid request transition';end if;
  update public.bf_service_requests set status=s.status,priority=s.priority,updated_at=now() where id=s.id;
  insert into public.bf_corrective_events(organization_id,client_id,request_id,actor_id,action,from_status,to_status,details)
  values(s.organization_id,s.client_id,s.id,auth.uid(),p_action,old_status,s.status,p_data);
  return s.id;
 end if;
 if p_action='create' then
  org:=(p_data->>'organization_id')::uuid;client:=(p_data->>'client_id')::uuid;site:=(p_data->>'site_id')::uuid;
  if not public.bf4_staff(org,'corrective.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  if not exists(select 1 from public.bf_sites where id=site and organization_id=org and client_id=client and status='active') then raise exception 'Invalid site';end if;
  w.id:=gen_random_uuid();w.organization_id:=org;w.client_id:=client;w.site_id:=site;
  w.contract_id:=nullif(p_data->>'contract_id','')::uuid;w.asset_id:=nullif(p_data->>'asset_id','')::uuid;
  w.request_id:=nullif(p_data->>'request_id','')::uuid;
  if w.contract_id is not null and not exists(select 1 from public.bf_contracts where id=w.contract_id and organization_id=org and client_id=client) then raise exception 'Invalid contract';end if;
  if w.asset_id is not null and not exists(select 1 from public.bf_assets where id=w.asset_id and organization_id=org and site_id=site and status='active') then raise exception 'Invalid asset';end if;
  if w.request_id is not null then
   select * into s from public.bf_service_requests where id=w.request_id and organization_id=org and client_id=client and site_id=site for update;
   if not found or s.status not in('submitted','triaged','converted') then raise exception 'Invalid request';end if;
  end if;
  w.title:=btrim(p_data->>'title');w.description:=coalesce(p_data->>'description','');w.priority:=coalesce(p_data->>'priority','P3');
  w.work_order_number:='WO-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf4_wo_seq')::text,6,'0');
  w.created_by:=auth.uid();
  insert into public.bf_work_orders(id,organization_id,client_id,site_id,contract_id,asset_id,request_id,work_order_number,title,description,priority,created_by)
  values(w.id,org,client,site,w.contract_id,w.asset_id,w.request_id,w.work_order_number,w.title,w.description,w.priority,auth.uid()) returning * into w;
  if w.request_id is not null then
   update public.bf_service_requests set status='converted',updated_at=now() where id=w.request_id;
   insert into public.bf_corrective_events(organization_id,client_id,request_id,actor_id,action,from_status,to_status,details)
   values(org,client,w.request_id,auth.uid(),'converted',s.status,'converted',jsonb_build_object('work_order_id',w.id));
  end if;
  insert into public.bf_corrective_events(organization_id,client_id,work_order_id,actor_id,action,to_status,details)
  values(org,client,w.id,auth.uid(),'created','draft',jsonb_build_object('request_id',w.request_id));
  return w.id;
 end if;
 select * into w from public.bf_work_orders where id=p_id for update;
 if not found then raise exception 'Work order not found';end if;
 org:=w.organization_id;client:=w.client_id;site:=w.site_id;old_status:=w.status;
 if p_action in('assign','submit_qa','approve','reject_qa','close','reopen','cancel','set_sla','hold','resume') then
  if not public.bf4_staff(org,case when p_action in('approve','close','reopen') then 'corrective.approve' else 'corrective.manage' end) then
   -- Assigned technicians may place their own work on hold/resume.
   if not(p_action in('hold','resume') and public.bf4_staff(org,'corrective.execute') and public.bf4_assigned(w.id)) then
    raise exception 'Permission denied' using errcode='42501';
   end if;
  end if;
 elsif p_action in('accept','start','complete','note') then
  if not (public.bf4_staff(org,'corrective.execute') and public.bf4_assigned(w.id)) then raise exception 'Not an assigned technician' using errcode='42501';end if;
 else raise exception 'Unknown action';end if;
 if p_action='assign' and w.status in('draft','assigned') then
  assignee:=(p_data->>'user_id')::uuid;
  if not public.bf4_user_can(assignee,org,'corrective.execute') then raise exception 'Assignee does not have execution permission in this company';end if;
  if coalesce((p_data->>'replace')::boolean,false) then
   delete from public.bf_work_order_assignments where work_order_id=w.id;
  end if;
  insert into public.bf_work_order_assignments(work_order_id,user_id,assigned_by)
  values(w.id,assignee,auth.uid()) on conflict do nothing;
  w.status:='assigned';w.assigned_at:=coalesce(w.assigned_at,now());
 elsif p_action='accept' and w.status='assigned' then
  w.status:='accepted';w.accepted_at:=coalesce(w.accepted_at,now());
 elsif p_action='start' and w.status='accepted' then
  w.status:='in_progress';w.started_at:=coalesce(w.started_at,now());
 elsif p_action='hold' and w.status in('assigned','accepted','in_progress') then
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Hold reason required';end if;
  w.status:='on_hold';w.hold_reason:=p_data->>'reason';w.hold_started_at:=now();
 elsif p_action='resume' and w.status='on_hold' then
  w.status:=case when w.started_at is not null then 'in_progress' when w.accepted_at is not null then 'accepted' else 'assigned' end;
  w.hold_reason:=null;w.hold_started_at:=null;
 elsif p_action='complete' and w.status='in_progress' then
  if length(btrim(coalesce(p_data->>'work_performed',w.work_performed,'')))<10 then raise exception 'Work performed is required';end if;
  if length(btrim(coalesce(p_data->>'diagnosis',w.diagnosis,'')))<5 then raise exception 'Diagnosis is required';end if;
  if length(btrim(coalesce(p_data->>'tests_performed',w.tests_performed,'')))<5 then raise exception 'Tests or a justified not-applicable statement are required';end if;
  w.diagnosis:=coalesce(p_data->>'diagnosis',w.diagnosis);
  w.root_cause:=coalesce(p_data->>'root_cause',w.root_cause);
  w.work_performed:=coalesce(p_data->>'work_performed',w.work_performed);
  w.tests_performed:=coalesce(p_data->>'tests_performed',w.tests_performed);
  w.recommendations:=coalesce(p_data->>'recommendations',w.recommendations);
  w.status:='completed';w.completed_at:=now();w.approval_status:='pending';
 elsif p_action='note' and w.status in('assigned','accepted','in_progress','on_hold') then
  if length(btrim(coalesce(p_data->>'text','')))<3 then raise exception 'Note required';end if;
 elsif p_action='submit_qa' and w.status='completed' then
  w.approval_status:='pending';
 elsif p_action='approve' and w.status='completed' and w.approval_status='pending' then
  if w.created_by=auth.uid() or exists(select 1 from public.bf_work_order_assignments where work_order_id=w.id and user_id=auth.uid()) then
   raise exception 'Independent approval required';end if;
  w.status:='approved';w.approval_status:='approved';
 elsif p_action='reject_qa' and w.status='completed' then
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Rework reason required';end if;
  w.status:='assigned';w.approval_status:='rejected';w.completed_at:=null;
 elsif p_action='close' and w.status='approved' then
  w.status:='closed';w.closed_at:=now();
 elsif p_action='reopen' and w.status in('approved','closed') then
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reopen reason required';end if;
  w.status:='assigned';w.approval_status:='not_submitted';w.closed_at:=null;w.completed_at:=null;
 elsif p_action='cancel' and w.status in('draft','assigned','accepted','on_hold') then
  if w.started_at is not null then raise exception 'Started work cannot be cancelled';end if;
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Cancellation reason required';end if;
  w.status:='cancelled';
 elsif p_action='set_sla' and w.status in('draft','assigned') then
  -- Due dates are explicit contract-approved values, never illustrative defaults.
  w.response_due_at:=nullif(p_data->>'response_due_at','')::timestamptz;
  w.completion_due_at:=nullif(p_data->>'completion_due_at','')::timestamptz;
  w.sla_status:=case when w.response_due_at is null and w.completion_due_at is null then 'not_configured' else 'running' end;
 else raise exception 'Invalid work order transition';end if;
 update public.bf_work_orders set status=w.status,approval_status=w.approval_status,
 sla_status=w.sla_status,response_due_at=w.response_due_at,completion_due_at=w.completion_due_at,
 assigned_at=w.assigned_at,accepted_at=w.accepted_at,started_at=w.started_at,completed_at=w.completed_at,closed_at=w.closed_at,
 diagnosis=w.diagnosis,root_cause=w.root_cause,work_performed=w.work_performed,tests_performed=w.tests_performed,recommendations=w.recommendations,
 hold_reason=w.hold_reason,hold_started_at=w.hold_started_at,updated_at=now() where id=w.id;
 insert into public.bf_corrective_events(organization_id,client_id,work_order_id,actor_id,action,from_status,to_status,details)
 values(org,client,w.id,auth.uid(),p_action,old_status,w.status,p_data);
 return w.id;
end $$;

create sequence public.bf4_request_seq;
create sequence public.bf4_wo_seq;
revoke all on sequence public.bf4_request_seq,public.bf4_wo_seq from public,anon,authenticated;
revoke all on function public.bf4_action(text,uuid,text,jsonb) from public,anon;
grant execute on function public.bf4_action(text,uuid,text,jsonb) to authenticated;
-- Internal helpers are not callable directly from ordinary API roles.
revoke all on function public.bf4_write_guard() from public,anon,authenticated;
revoke all on function public.bf4_user_can(uuid,uuid,text),public.bf4_staff_directory() from public,anon;
-- Do not revoke the read authorization helpers: RLS needs them.
grant execute on function public.bf4_staff(uuid,text),public.bf4_client(uuid,uuid),public.bf4_assigned(uuid),public.bf4_user_can(uuid,uuid,text),public.bf4_staff_directory() to authenticated;
insert into public.bf_migrations(version) values(4);
commit;
