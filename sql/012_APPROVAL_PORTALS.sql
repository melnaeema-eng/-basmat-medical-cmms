-- Sprint 11: Owner & consultant approval portals.
-- Additive migration. Existing work orders/PPM jobs remain unchanged unless an
-- external approval request is explicitly created.
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=10)
 or to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 then raise exception 'Install and verify Sprint 10 first';end if;
 if exists(select 1 from public.bf_migrations where version=11)
 then raise exception 'Sprint 11 already installed';end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('approvals.view','View owner and consultant approvals'),
 ('approvals.request','Request external approval'),
 ('approvals.manage','Manage external approval workflow'),
 ('consultants.manage','Manage consultant client access')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and
  p.code in('approvals.view','approvals.request','approvals.manage'))
 or (r.code='supervisor' and p.code in('approvals.view','approvals.request'))
 or (r.code='company_admin' and p.code='consultants.manage')
on conflict do nothing;

create table public.bf11_consultant_access(
 user_id uuid not null references public.bf_profiles(id),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 granted_by uuid not null references auth.users(id),
 granted_at timestamptz not null default now(),
 primary key(user_id,organization_id,client_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id)
);

create table public.bf11_approvals(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 entity_type text not null check(entity_type in('work_order','ppm_job')),
 entity_id uuid not null,
 reviewer_type text not null check(reviewer_type in('owner','consultant')),
 status text not null default 'pending' check(status in('pending','approved','rejected','cancelled')),
 round integer not null default 1 check(round between 1 and 50),
 subject text not null check(length(btrim(subject)) between 3 and 250),
 request_comment text not null default '',
 due_at timestamptz,
 requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),
 decided_at timestamptz,
 decision_comment text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 unique(organization_id,entity_type,entity_id,reviewer_type,round),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 check((status in('approved','rejected'))=(decided_at is not null)),
 check((status='cancelled')=(cancelled_at is not null))
);
create unique index bf11_one_pending_approval
on public.bf11_approvals(organization_id,entity_type,entity_id,reviewer_type)
where status='pending';
create index bf11_approval_scope on public.bf11_approvals(organization_id,client_id,status,requested_at desc);
create index bf11_approval_entity on public.bf11_approvals(entity_type,entity_id,round desc);

create table public.bf11_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.bf_organizations(id),
 approval_id uuid not null references public.bf11_approvals(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index bf11_events_approval on public.bf11_events(approval_id,id);

create or replace function public.bf11_owner(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and exists(
  select 1 from public.bf_profiles p
  join public.bf_client_access a on a.user_id=p.id
  where p.id=auth.uid() and p.status='active'
  and a.organization_id=p_org and a.client_id=p_client);
$$;

create or replace function public.bf11_consultant(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and exists(
  select 1 from public.bf_profiles p
  join public.bf11_consultant_access a on a.user_id=p.id
  where p.id=auth.uid() and p.status='active'
  and a.organization_id=p_org and a.client_id=p_client);
$$;

create or replace function public.bf11_can_view(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf4_staff(p_org,'approvals.view')
 or public.bf11_owner(p_org,p_client)
 or public.bf11_consultant(p_org,p_client);
$$;

revoke all on function public.bf11_owner(uuid,uuid),public.bf11_consultant(uuid,uuid),public.bf11_can_view(uuid,uuid) from public,anon;
grant execute on function public.bf11_owner(uuid,uuid),public.bf11_consultant(uuid,uuid),public.bf11_can_view(uuid,uuid) to authenticated;

alter table public.bf11_consultant_access enable row level security;
alter table public.bf11_approvals enable row level security;
alter table public.bf11_events enable row level security;
revoke all on public.bf11_consultant_access,public.bf11_approvals,public.bf11_events from public,anon,authenticated;
grant select on public.bf11_consultant_access,public.bf11_approvals,public.bf11_events to authenticated;

create policy bf11_consultants_read on public.bf11_consultant_access for select to authenticated
using(public.bf4_staff(organization_id,'consultants.manage')
 or (user_id=auth.uid() and exists(select 1 from public.bf_profiles p where p.id=auth.uid() and p.status='active')));
create policy bf11_approvals_read on public.bf11_approvals for select to authenticated
using(public.bf11_can_view(organization_id,client_id));
create policy bf11_events_read on public.bf11_events for select to authenticated
using(exists(select 1 from public.bf11_approvals a where a.id=approval_id and public.bf11_can_view(a.organization_id,a.client_id)));

create or replace function public.bf11_portal(
 p_org uuid default null,p_client uuid default null,p_status text default null,
 p_limit integer default 200,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; clients_data jsonb; entities jsonb; approvals_data jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 500 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'Invalid pagination';end if;
 if p_status is not null and p_status not in('pending','approved','rejected','cancelled') then raise exception 'Invalid status';end if;

 select coalesce(jsonb_agg(jsonb_build_object(
   'organization_id',x.organization_id,'client_id',x.client_id,'client_name',x.client_name,
   'role',x.role,'can_request',x.can_request,'can_manage',x.can_manage,'can_consultants',x.can_consultants) order by x.client_name),'[]'::jsonb)
 into clients_data
 from (
  select c.organization_id,c.id client_id,c.name client_name,
   case when public.bf4_staff(c.organization_id,'approvals.view') then 'staff'
        when public.bf11_owner(c.organization_id,c.id) then 'owner'
        when public.bf11_consultant(c.organization_id,c.id) then 'consultant' end role,
   public.bf4_staff(c.organization_id,'approvals.request') can_request,
   public.bf4_staff(c.organization_id,'approvals.manage') can_manage,
   public.bf4_staff(c.organization_id,'consultants.manage') can_consultants
  from public.bf_clients c
  where (p_org is null or c.organization_id=p_org)
   and (p_client is null or c.id=p_client)
   and public.bf11_can_view(c.organization_id,c.id)
 ) x;

 with scoped as (
  select a.*,case when a.entity_type='work_order' then w.work_order_number else j.job_number end entity_number,
   case when a.entity_type='work_order' then w.title else coalesce(ast.name_en,ast.name_ar,j.job_number) end entity_title
  from public.bf11_approvals a
  left join public.bf_work_orders w on a.entity_type='work_order' and w.id=a.entity_id
  left join public.bf_ppm_jobs j on a.entity_type='ppm_job' and j.id=a.entity_id
  left join public.bf_assets ast on j.asset_id=ast.id
  where (p_org is null or a.organization_id=p_org)
   and (p_client is null or a.client_id=p_client)
   and (p_status is null or a.status=p_status)
   and public.bf11_can_view(a.organization_id,a.client_id)
 )
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into approvals_data
 from (select * from scoped order by requested_at desc,id limit p_limit offset p_offset)x;

 -- Only internal staff can discover eligible entities or create approval requests.
 select coalesce(jsonb_agg(to_jsonb(e) order by e.entity_number),'[]'::jsonb) into entities
 from (
  select 'work_order'::text entity_type,w.id entity_id,w.organization_id,w.client_id,w.site_id,
   w.work_order_number entity_number,w.title entity_title,w.status
  from public.bf_work_orders w
  where (p_org is null or w.organization_id=p_org)
   and (p_client is null or w.client_id=p_client)
   and w.status='approved'
   and public.bf4_staff(w.organization_id,'approvals.request')
  union all
  select 'ppm_job',j.id,j.organization_id,j.client_id,j.site_id,j.job_number,
   coalesce(a.name_en,a.name_ar,j.job_number),j.status
  from public.bf_ppm_jobs j left join public.bf_assets a on a.id=j.asset_id
  where (p_org is null or j.organization_id=p_org)
   and (p_client is null or j.client_id=p_client)
   and j.status='approved'
   and public.bf4_staff(j.organization_id,'approvals.request')
 ) e;

 result:=jsonb_build_object('clients',clients_data,'approvals',approvals_data,'entities',entities,
  'limit',p_limit,'offset',p_offset,'has_more',jsonb_array_length(approvals_data)=p_limit);
 return result;
end $$;
revoke all on function public.bf11_portal(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.bf11_portal(uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.bf11_action(
 p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare a public.bf11_approvals; w public.bf_work_orders; j public.bf_ppm_jobs;
 org uuid;client uuid;site uuid;entity uuid;reviewer text;next_round integer;actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768 then raise exception 'Invalid payload';end if;

 if p_action='create' then
  org:=(p_data->>'organization_id')::uuid;client:=(p_data->>'client_id')::uuid;
  site:=(p_data->>'site_id')::uuid;entity:=(p_data->>'entity_id')::uuid;reviewer:=p_data->>'reviewer_type';
  if reviewer not in('owner','consultant') then raise exception 'Invalid reviewer type';end if;
  if not public.bf4_staff(org,'approvals.request') then raise exception 'Permission denied' using errcode='42501';end if;
  if length(btrim(coalesce(p_data->>'subject',''))) not between 3 and 250 then raise exception 'Subject is required';end if;
  if coalesce(length(p_data->>'request_comment'),0)>4000 then raise exception 'Comment too long';end if;
  if reviewer='owner' and not exists(select 1 from public.bf_client_access ca join public.bf_profiles p on p.id=ca.user_id
    where ca.organization_id=org and ca.client_id=client and p.status='active')
  then raise exception 'No active owner/client portal user for this client';end if;
  if reviewer='consultant' and not exists(select 1 from public.bf11_consultant_access ca join public.bf_profiles p on p.id=ca.user_id
    where ca.organization_id=org and ca.client_id=client and p.status='active')
  then raise exception 'No active consultant portal user for this client';end if;

  if p_data->>'entity_type'='work_order' then
   select * into w from public.bf_work_orders where id=entity and organization_id=org and client_id=client and site_id=site for update;
   if not found or w.status<>'approved' then raise exception 'Only internally approved work orders may be submitted';end if;
  elsif p_data->>'entity_type'='ppm_job' then
   select * into j from public.bf_ppm_jobs where id=entity and organization_id=org and client_id=client and site_id=site for update;
   if not found or j.status<>'approved' then raise exception 'Only internally approved PPM jobs may be submitted';end if;
  else raise exception 'Invalid entity type';end if;

  if exists(select 1 from public.bf11_approvals where organization_id=org
    and entity_type=p_data->>'entity_type' and entity_id=entity and reviewer_type=reviewer and status='pending')
  then raise exception 'A pending approval already exists';end if;
  select coalesce(max(round),0)+1 into next_round from public.bf11_approvals
   where organization_id=org and entity_type=p_data->>'entity_type' and entity_id=entity and reviewer_type=reviewer;
  insert into public.bf11_approvals(organization_id,client_id,site_id,entity_type,entity_id,reviewer_type,round,
   subject,request_comment,due_at,requested_by)
  values(org,client,site,p_data->>'entity_type',entity,reviewer,next_round,btrim(p_data->>'subject'),
   coalesce(p_data->>'request_comment',''),nullif(p_data->>'due_at','')::timestamptz,actor)
  returning * into a;
  insert into public.bf11_events(organization_id,approval_id,actor_id,action,details)
   values(org,a.id,actor,'created',jsonb_build_object('reviewer_type',reviewer,'round',next_round));
  return a.id;
 end if;

 select * into a from public.bf11_approvals where id=p_id for update;
 if not found then raise exception 'Approval not found';end if;

 if p_action in('approve','reject') then
  if a.status<>'pending' then raise exception 'Approval is not pending';end if;
  if actor=a.requested_by then raise exception 'Requester cannot decide own approval';end if;
  if a.reviewer_type='owner' and not public.bf11_owner(a.organization_id,a.client_id)
   then raise exception 'Owner authorization required' using errcode='42501';end if;
  if a.reviewer_type='consultant' and not public.bf11_consultant(a.organization_id,a.client_id)
   then raise exception 'Consultant authorization required' using errcode='42501';end if;
  if p_action='reject' and length(btrim(coalesce(p_data->>'comment','')))<5 then raise exception 'Rejection comment is required';end if;
  update public.bf11_approvals set status=case when p_action='approve' then 'approved' else 'rejected' end,
   decided_by=actor,decided_at=now(),decision_comment=nullif(btrim(coalesce(p_data->>'comment','')),'')
   where id=a.id;
 elsif p_action='cancel' then
  if a.status<>'pending' then raise exception 'Only pending approvals can be cancelled';end if;
  if not public.bf4_staff(a.organization_id,'approvals.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  if length(btrim(coalesce(p_data->>'comment','')))<5 then raise exception 'Cancellation comment is required';end if;
  update public.bf11_approvals set status='cancelled',cancelled_by=actor,cancelled_at=now(),
   decision_comment=btrim(p_data->>'comment') where id=a.id;
 else raise exception 'Invalid approval action';end if;

 insert into public.bf11_events(organization_id,approval_id,actor_id,action,details)
 values(a.organization_id,a.id,actor,p_action,jsonb_build_object('comment',coalesce(p_data->>'comment','')));
 return a.id;
end $$;
revoke all on function public.bf11_action(text,uuid,jsonb) from public,anon;
grant execute on function public.bf11_action(text,uuid,jsonb) to authenticated;

create or replace function public.bf11_find_profile(p_email text,p_org uuid)
returns table(id uuid,full_name text,email text,status text)
language sql stable security definer set search_path=''
as $$
 select p.id,p.full_name::text,p.email::text,p.status::text
 from public.bf_profiles p
 where public.bf4_staff(p_org,'consultants.manage')
  and lower(p.email)=lower(btrim(p_email))
  and p.status='active'
 limit 1;
$$;
revoke all on function public.bf11_find_profile(text,uuid) from public,anon;
grant execute on function public.bf11_find_profile(text,uuid) to authenticated;

create or replace function public.bf11_consultant_manage(
 p_action text,p_user uuid,p_org uuid,p_client uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.bf4_staff(p_org,'consultants.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if not exists(select 1 from public.bf_clients where id=p_client and organization_id=p_org) then raise exception 'Invalid client';end if;
 if not exists(select 1 from public.bf_profiles where id=p_user and status='active') then raise exception 'Active profile required';end if;
 if p_action='grant' then
  insert into public.bf11_consultant_access(user_id,organization_id,client_id,granted_by)
  values(p_user,p_org,p_client,auth.uid()) on conflict(user_id,organization_id,client_id) do nothing;
 elsif p_action='revoke' then
  delete from public.bf11_consultant_access where user_id=p_user and organization_id=p_org and client_id=p_client;
 else raise exception 'Invalid consultant action';end if;
end $$;
revoke all on function public.bf11_consultant_manage(text,uuid,uuid,uuid) from public,anon;
grant execute on function public.bf11_consultant_manage(text,uuid,uuid,uuid) to authenticated;

-- Once an external approval was requested, closing is blocked until the latest
-- requested owner/consultant round is approved. Entities with no requests keep
-- their existing behavior.
create or replace function public.bf11_external_close_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status=old.status or new.status<>'closed' then return new;end if;
 if exists(
  select 1 from public.bf11_approvals a
  where a.entity_type=tg_argv[0] and a.entity_id=new.id
   and a.status in('pending','rejected')
   and a.round=(select max(x.round) from public.bf11_approvals x
    where x.entity_type=a.entity_type and x.entity_id=a.entity_id and x.reviewer_type=a.reviewer_type)
 ) then raise exception 'External approval is pending or rejected';end if;
 return new;
end $$;
create trigger bf11_wo_close_guard before update of status on public.bf_work_orders
for each row execute function public.bf11_external_close_guard('work_order');
create trigger bf11_ppm_close_guard before update of status on public.bf_ppm_jobs
for each row execute function public.bf11_external_close_guard('ppm_job');

insert into public.bf_migrations(version) values(11);
commit;
