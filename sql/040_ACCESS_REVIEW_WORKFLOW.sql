-- Basmat Facilities CMMS — Sprint 39
-- Enterprise Access Review & Approval Workflow
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=38)
 then raise exception 'Install and verify Sprint 38 first'; end if;
 if exists(select 1 from public.bf_migrations where version=39)
 then raise exception 'Sprint 39 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('access-review.view','View enterprise access requests and review queue'),
('access-review.manage','Create and manage access review requests'),
('access-review.approve','Approve or reject enterprise access requests')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','contractor_director','operations_manager')
  and p.code in('access-review.view','access-review.manage','access-review.approve'))
 or
 (r.code in('owner_maintenance_manager','project_manager','facility_manager','maintenance_manager',
            'contract_manager','consultant_manager','auditor_readonly')
  and p.code='access-review.view')
on conflict do nothing;

insert into public.bf36_reference_counters(entity,last_value)
values('access_requests',0)
on conflict(entity) do nothing;

create or replace function public.bf39_next_request_no()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare n bigint;
begin
 update public.bf36_reference_counters
 set last_value=last_value+1,updated_at=now()
 where entity='access_requests'
 returning last_value into n;
 return 'ARQ-'||lpad(n::text,7,'0');
end $$;

revoke all on function public.bf39_next_request_no() from public,anon,authenticated;

create table public.bf39_access_requests(
 id uuid primary key default gen_random_uuid(),
 request_no text not null,
 organization_id uuid not null references public.bf_organizations(id),
 request_type text not null check(request_type in('new_access','change_scope','temporary_access','revoke_access')),
 subject_user_id uuid not null references public.bf_profiles(id),
 role_id uuid references public.bf_roles(id),
 existing_scope_id uuid references public.bf34_access_scopes(id),
 scope_level text check(scope_level in('organization','client','contract','site','discipline')),
 client_id uuid references public.bf_clients(id),
 contract_id uuid references public.bf_contracts(id),
 site_id uuid references public.bf_sites(id),
 discipline_code text,
 valid_from date,
 valid_until date,
 justification text not null,
 status text not null default 'pending'
   check(status in('pending','approved','rejected','cancelled','implemented')),
 requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),
 decided_at timestamptz,
 decision_note text,
 implemented_scope_id uuid references public.bf34_access_scopes(id),
 qr_token uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(valid_until is null or valid_from is null or valid_until>=valid_from),
 check(
   request_type='revoke_access'
   or (
     role_id is not null
     and scope_level is not null
     and (
       (scope_level='organization' and client_id is null and contract_id is null and site_id is null and discipline_code is null)
       or (scope_level='client' and client_id is not null and contract_id is null and site_id is null and discipline_code is null)
       or (scope_level='contract' and client_id is not null and contract_id is not null and site_id is null and discipline_code is null)
       or (scope_level='site' and client_id is not null and site_id is not null and discipline_code is null)
       or (scope_level='discipline' and discipline_code is not null)
     )
   )
 ),
 check(
   request_type<>'revoke_access' or existing_scope_id is not null
 )
);

create table public.bf39_access_reviews(
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.bf34_access_scopes(id) on delete cascade,
 organization_id uuid not null references public.bf_organizations(id),
 reviewer_id uuid not null references auth.users(id),
 decision text not null check(decision in('retain','revoke')),
 review_note text,
 reviewed_at timestamptz not null default now()
);

create index bf39_requests_scope on public.bf39_access_requests(organization_id,status,requested_at desc);
create index bf39_requests_user on public.bf39_access_requests(subject_user_id,status);
create unique index bf39_request_no_uq on public.bf39_access_requests(request_no);
create unique index bf39_request_qr_uq on public.bf39_access_requests(qr_token);
create index bf39_reviews_scope on public.bf39_access_reviews(scope_id,reviewed_at desc);

alter table public.bf39_access_requests enable row level security;
alter table public.bf39_access_reviews enable row level security;

revoke all on public.bf39_access_requests,public.bf39_access_reviews from public,anon,authenticated;
grant select on public.bf39_access_requests,public.bf39_access_reviews to authenticated;

create or replace function public.bf39_request_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if tg_op='INSERT' then
  new.request_no:=public.bf39_next_request_no();
  new.qr_token:=coalesce(new.qr_token,gen_random_uuid());
 else
  if new.request_no is distinct from old.request_no then raise exception 'Access request number is immutable'; end if;
  if new.qr_token is distinct from old.qr_token then raise exception 'Access request QR identity is immutable'; end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;

drop trigger if exists bf39_request_identity on public.bf39_access_requests;
create trigger bf39_request_identity
before insert or update on public.bf39_access_requests
for each row execute function public.bf39_request_identity();

create or replace function public.bf39_can_view(p_org uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'access-review.view')
 or public.bf4_staff(p_org,'access-review.manage')
 or public.bf4_staff(p_org,'access-review.approve');
$$;

create or replace function public.bf39_can_manage(p_org uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'access-review.manage');
$$;

create or replace function public.bf39_can_approve(p_org uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'access-review.approve');
$$;

create policy bf39_requests_read on public.bf39_access_requests
for select to authenticated
using(
 public.bf39_can_view(organization_id)
 or subject_user_id=auth.uid()
 or requested_by=auth.uid()
);

create policy bf39_reviews_read on public.bf39_access_reviews
for select to authenticated
using(public.bf39_can_view(organization_id));

create or replace function public.bf39_request_access(
 p_org uuid,
 p_type text,
 p_subject uuid,
 p_role uuid default null,
 p_existing_scope uuid default null,
 p_scope_level text default null,
 p_client uuid default null,
 p_contract uuid default null,
 p_site uuid default null,
 p_discipline text default null,
 p_valid_from date default null,
 p_valid_until date default null,
 p_justification text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare rid uuid;
begin
 if not public.bf39_can_manage(p_org)
 then raise exception 'Access review management permission required' using errcode='42501'; end if;

 if p_type not in('new_access','change_scope','temporary_access','revoke_access')
 then raise exception 'Invalid request type'; end if;

 if not exists(select 1 from public.bf_profiles p where p.id=p_subject and p.status='active')
 then raise exception 'Active subject user required'; end if;

 if length(btrim(coalesce(p_justification,'')))<5
 then raise exception 'Justification is required'; end if;

 if p_type='revoke_access' then
  if p_existing_scope is null or not exists(
   select 1 from public.bf34_access_scopes s
   where s.id=p_existing_scope and s.organization_id=p_org and s.is_active
  ) then raise exception 'Active existing scope required'; end if;
 else
  if p_role is null or not exists(
   select 1 from public.bf_roles r
   where r.id=p_role and (r.organization_id is null or r.organization_id=p_org)
  ) then raise exception 'Valid role required'; end if;

  if p_scope_level not in('organization','client','contract','site','discipline')
  then raise exception 'Valid scope level required'; end if;

  if p_type='temporary_access' and p_valid_until is null
  then raise exception 'Temporary access requires an expiry date'; end if;

  if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from
  then raise exception 'Invalid validity period'; end if;
 end if;

 insert into public.bf39_access_requests(
  request_no,organization_id,request_type,subject_user_id,role_id,existing_scope_id,
  scope_level,client_id,contract_id,site_id,discipline_code,valid_from,valid_until,
  justification,status,requested_by
 ) values(
  'AUTO',p_org,p_type,p_subject,p_role,p_existing_scope,
  p_scope_level,p_client,p_contract,p_site,nullif(btrim(p_discipline),''),
  p_valid_from,p_valid_until,btrim(p_justification),'pending',auth.uid()
 )
 returning id into rid;

 return rid;
end $$;

create or replace function public.bf39_decide_request(
 p_request uuid,
 p_decision text,
 p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare q public.bf39_access_requests; sid uuid;
begin
 select * into q from public.bf39_access_requests where id=p_request for update;
 if not found then raise exception 'Access request not found'; end if;
 if q.status<>'pending' then raise exception 'Only pending requests can be decided'; end if;
 if not public.bf39_can_approve(q.organization_id)
 then raise exception 'Access review approval permission required' using errcode='42501'; end if;
 if q.requested_by=auth.uid() and not public.bf_is_super_admin()
 then raise exception 'Requester cannot approve own access request'; end if;

 if p_decision='reject' then
  update public.bf39_access_requests
  set status='rejected',decided_by=auth.uid(),decided_at=now(),decision_note=nullif(btrim(p_note),'')
  where id=q.id;
  return null;
 end if;

 if p_decision<>'approve' then raise exception 'Decision must be approve or reject'; end if;

 if q.request_type='revoke_access' then
  update public.bf34_access_scopes
  set is_active=false,updated_at=now()
  where id=q.existing_scope_id and organization_id=q.organization_id;

  sid:=q.existing_scope_id;
 else
  insert into public.bf34_access_scopes(
   user_id,organization_id,role_id,scope_level,client_id,contract_id,site_id,discipline_code,
   is_active,valid_from,valid_until,created_by
  ) values(
   q.subject_user_id,q.organization_id,q.role_id,q.scope_level,q.client_id,q.contract_id,
   q.site_id,q.discipline_code,true,q.valid_from,q.valid_until,auth.uid()
  )
  on conflict(
   user_id,organization_id,role_id,scope_level,
   (coalesce(client_id,'00000000-0000-0000-0000-000000000000'::uuid)),
   (coalesce(contract_id,'00000000-0000-0000-0000-000000000000'::uuid)),
   (coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)),
   (coalesce(discipline_code,''))
  )
  do update set is_active=true,valid_from=excluded.valid_from,valid_until=excluded.valid_until,updated_at=now()
  returning id into sid;

  insert into public.bf_user_roles(user_id,organization_id,role_id)
  values(q.subject_user_id,q.organization_id,q.role_id)
  on conflict do nothing;

  if q.request_type='change_scope' and q.existing_scope_id is not null then
   update public.bf34_access_scopes
   set is_active=false,updated_at=now()
   where id=q.existing_scope_id and id<>sid and organization_id=q.organization_id;
  end if;
 end if;

 update public.bf39_access_requests
 set status='implemented',decided_by=auth.uid(),decided_at=now(),
     decision_note=nullif(btrim(p_note),''),implemented_scope_id=sid
 where id=q.id;

 return sid;
end $$;

create or replace function public.bf39_review_scope(
 p_scope uuid,
 p_decision text,
 p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf34_access_scopes;
begin
 select * into s from public.bf34_access_scopes where id=p_scope for update;
 if not found then raise exception 'Scope not found'; end if;
 if not public.bf39_can_approve(s.organization_id)
 then raise exception 'Access review approval permission required' using errcode='42501'; end if;
 if p_decision not in('retain','revoke') then raise exception 'Invalid review decision'; end if;

 insert into public.bf39_access_reviews(scope_id,organization_id,reviewer_id,decision,review_note)
 values(s.id,s.organization_id,auth.uid(),p_decision,nullif(btrim(p_note),''));

 if p_decision='revoke' then
  update public.bf34_access_scopes set is_active=false,updated_at=now() where id=s.id;
 end if;
end $$;

create or replace function public.bf39_process_expired()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare n integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

 update public.bf34_access_scopes
 set is_active=false,updated_at=now()
 where is_active
   and valid_until is not null
   and valid_until<current_date;

 get diagnostics n=row_count;
 return n;
end $$;

create or replace function public.bf39_dashboard(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if not public.bf39_can_view(p_org)
 then raise exception 'Access review view permission required' using errcode='42501'; end if;

 select jsonb_build_object(
  'summary',jsonb_build_object(
    'pending_requests',(select count(*) from public.bf39_access_requests where organization_id=p_org and status='pending'),
    'temporary_expiring_30d',(select count(*) from public.bf34_access_scopes
      where organization_id=p_org and is_active and valid_until between current_date and current_date+30),
    'expired_active',(select count(*) from public.bf34_access_scopes
      where organization_id=p_org and is_active and valid_until is not null and valid_until<current_date),
    'active_scopes',(select count(*) from public.bf34_access_scopes where organization_id=p_org and is_active)
  ),
  'requests',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',q.id,'request_no',q.request_no,'request_type',q.request_type,'status',q.status,
      'subject_user_id',q.subject_user_id,'subject_name',pr.full_name,'role_id',q.role_id,
      'role_code',r.code,'scope_level',q.scope_level,'client_id',q.client_id,'contract_id',q.contract_id,
      'site_id',q.site_id,'discipline_code',q.discipline_code,'valid_from',q.valid_from,
      'valid_until',q.valid_until,'justification',q.justification,'requested_at',q.requested_at,
      'qr_payload','bfcmms://access-request/'||q.id::text||'?token='||q.qr_token::text
    ) order by q.requested_at desc)
    from public.bf39_access_requests q
    join public.bf_profiles pr on pr.id=q.subject_user_id
    left join public.bf_roles r on r.id=q.role_id
    where q.organization_id=p_org
  ),'[]'::jsonb),
  'expiring_scopes',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'user_id',s.user_id,'user_name',p.full_name,'role_code',r.code,
      'scope_level',s.scope_level,'valid_until',s.valid_until
    ) order by s.valid_until)
    from public.bf34_access_scopes s
    join public.bf_profiles p on p.id=s.user_id
    join public.bf_roles r on r.id=s.role_id
    where s.organization_id=p_org and s.is_active and s.valid_until is not null
      and s.valid_until<=current_date+30
  ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function
 public.bf39_request_identity(),
 public.bf39_can_view(uuid),
 public.bf39_can_manage(uuid),
 public.bf39_can_approve(uuid)
from public,anon,authenticated;

revoke all on function
 public.bf39_request_access(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,text,date,date,text),
 public.bf39_decide_request(uuid,text,text),
 public.bf39_review_scope(uuid,text,text),
 public.bf39_process_expired(),
 public.bf39_dashboard(uuid)
from public,anon;

grant execute on function
 public.bf39_request_access(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,text,date,date,text),
 public.bf39_decide_request(uuid,text,text),
 public.bf39_review_scope(uuid,text,text),
 public.bf39_process_expired(),
 public.bf39_dashboard(uuid)
to authenticated;

insert into public.bf_migrations(version) values(39);
commit;
