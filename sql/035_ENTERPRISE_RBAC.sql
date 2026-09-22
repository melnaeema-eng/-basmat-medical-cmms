-- Basmat Facilities CMMS — Sprint 34
-- Enterprise RBAC & Scoped Organization Hierarchy
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=33)
 then raise exception 'Install and verify Sprint 33 first'; end if;
 if exists(select 1 from public.bf_migrations where version=34)
 then raise exception 'Sprint 34 already installed'; end if;
end $$;

-- Enterprise scope administration permissions
insert into public.bf_permissions(code,description) values
('enterprise-access.view','View enterprise access matrix and scoped assignments'),
('enterprise-access.manage','Manage enterprise roles and scoped assignments'),
('cleaning.view','View cleaning operations'),
('cleaning.manage','Manage cleaning operations'),
('security-ops.view','View security operations'),
('security-ops.manage','Manage security operations'),
('landscape.view','View landscape operations'),
('landscape.manage','Manage landscape operations'),
('waste.view','View waste-management operations'),
('waste.manage','Manage waste-management operations'),
('pest-control.view','View pest-control operations'),
('pest-control.manage','Manage pest-control operations')
on conflict(code) do nothing;

-- Enterprise system role templates.
insert into public.bf_roles(organization_id,name,code,is_system) values
(null,'Owner Director','owner_director',true),
(null,'Owner Maintenance Manager','owner_maintenance_manager',true),
(null,'Contract Manager','contract_manager',true),
(null,'Site / Facility Manager','site_manager',true),
(null,'Consultant Manager','consultant_manager',true),
(null,'Consultant Engineer','consultant_engineer',true),
(null,'Contractor Director','contractor_director',true),
(null,'Operations Manager','operations_manager',true),
(null,'Project Manager','project_manager',true),
(null,'Senior Technician','senior_technician',true),
(null,'Electrical Supervisor','electrical_supervisor',true),
(null,'Mechanical Supervisor','mechanical_supervisor',true),
(null,'HVAC Supervisor','hvac_supervisor',true),
(null,'Plumbing Supervisor','plumbing_supervisor',true),
(null,'ELV Supervisor','elv_supervisor',true),
(null,'Cleaning Supervisor','cleaning_supervisor',true),
(null,'Cleaner','cleaner',true),
(null,'Security Supervisor','security_supervisor',true),
(null,'Security Guard','security_guard',true),
(null,'Landscape Supervisor','landscape_supervisor',true),
(null,'Gardener','gardener',true),
(null,'Pest Control Worker','pest_control_worker',true),
(null,'Waste Management Worker','waste_worker',true),
(null,'Store Manager','store_manager',true),
(null,'Procurement Manager','procurement_manager',true),
(null,'Buyer','buyer',true),
(null,'Finance Manager','finance_manager',true),
(null,'Accountant','accountant',true),
(null,'HSE Manager','hse_manager',true),
(null,'Safety Officer','safety_officer',true),
(null,'Dispatcher','dispatcher',true),
(null,'Auditor / Read Only','auditor_readonly',true)
on conflict(organization_id,code) do nothing;

-- Keep system-role codes unique even though organization_id is NULL.
create unique index if not exists bf_roles_system_code_uq
on public.bf_roles(code)
where organization_id is null and is_system=true;

-- High-level enterprise access.
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','contractor_director')
   and p.code in('enterprise-access.view','enterprise-access.manage'))
 or
 (r.code in('owner_maintenance_manager','operations_manager','project_manager','facility_manager','maintenance_manager','contract_manager','site_manager','consultant_manager','auditor_readonly')
   and p.code='enterprise-access.view')
on conflict do nothing;

-- Soft-FM role permission templates.
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','owner_maintenance_manager','contractor_director','operations_manager','project_manager','facility_manager')
   and p.code in('cleaning.view','cleaning.manage','security-ops.view','security-ops.manage','landscape.view','landscape.manage','waste.view','waste.manage','pest-control.view','pest-control.manage'))
 or (r.code='cleaning_supervisor' and p.code in('cleaning.view','cleaning.manage'))
 or (r.code='cleaner' and p.code='cleaning.view')
 or (r.code='security_supervisor' and p.code in('security-ops.view','security-ops.manage'))
 or (r.code='security_guard' and p.code='security-ops.view')
 or (r.code='landscape_supervisor' and p.code in('landscape.view','landscape.manage'))
 or (r.code='gardener' and p.code='landscape.view')
 or (r.code='pest_control_worker' and p.code='pest-control.view')
 or (r.code='waste_worker' and p.code='waste.view')
 or (r.code='auditor_readonly' and p.code in('cleaning.view','security-ops.view','landscape.view','waste.view','pest-control.view'))
on conflict do nothing;

-- Reuse existing CMMS permissions conservatively for enterprise role templates.
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('owner_director','owner_maintenance_manager','contractor_director','operations_manager','project_manager','contract_manager','site_manager','consultant_manager','consultant_engineer','auditor_readonly')
  and p.code in('organizations.view','clients.view','contracts.view','sites.view','locations.view','assets.view','corrective.view','ppm.view','reports.view','documents.view','document-control.view'))
 or
 (r.code in('owner_maintenance_manager','contractor_director','operations_manager','project_manager')
  and p.code in('corrective.manage','ppm.manage','sites.manage','assets.manage','document-control.manage'))
 or
 (r.code in('senior_technician','electrical_supervisor','mechanical_supervisor','hvac_supervisor','plumbing_supervisor','elv_supervisor')
  and p.code in('organizations.view','clients.view','contracts.view','sites.view','locations.view','assets.view','corrective.view','corrective.execute','ppm.view'))
 or
 (r.code in('store_manager') and p.code like 'inventory.%')
 or
 (r.code in('procurement_manager','buyer') and p.code like 'procurement.%')
 or
 (r.code in('hse_manager','safety_officer') and p.code like 'hse.%')
 or
 (r.code='auditor_readonly' and (p.code like '%.view' or p.code in('executive.view','security.view')))
on conflict do nothing;

create table public.bf34_access_scopes(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.bf_profiles(id),
 organization_id uuid not null references public.bf_organizations(id),
 role_id uuid not null references public.bf_roles(id),
 scope_level text not null check(scope_level in('organization','client','contract','site','discipline')),
 client_id uuid references public.bf_clients(id),
 contract_id uuid references public.bf_contracts(id),
 site_id uuid references public.bf_sites(id),
 discipline_code text,
 is_active boolean not null default true,
 valid_from date,
 valid_until date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(valid_until is null or valid_from is null or valid_until>=valid_from),
 check(
   (scope_level='organization' and client_id is null and contract_id is null and site_id is null and discipline_code is null)
   or (scope_level='client' and client_id is not null and contract_id is null and site_id is null and discipline_code is null)
   or (scope_level='contract' and client_id is not null and contract_id is not null and site_id is null and discipline_code is null)
   or (scope_level='site' and client_id is not null and site_id is not null and discipline_code is null)
   or (scope_level='discipline' and discipline_code is not null)
 )
);

create index bf34_scope_user on public.bf34_access_scopes(user_id,organization_id,is_active);
create index bf34_scope_target on public.bf34_access_scopes(organization_id,client_id,contract_id,site_id,discipline_code);
create unique index bf34_scope_unique
on public.bf34_access_scopes(
 user_id,organization_id,role_id,scope_level,
 coalesce(client_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(contract_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(discipline_code,'')
);

alter table public.bf34_access_scopes enable row level security;
revoke all on public.bf34_access_scopes from public,anon,authenticated;
grant select on public.bf34_access_scopes to authenticated;

create or replace function public.bf34_can_manage(p_org uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'enterprise-access.manage');
$$;

create policy bf34_scope_read on public.bf34_access_scopes
for select to authenticated
using(
 user_id=auth.uid()
 or public.bf34_can_manage(organization_id)
 or public.bf4_staff(organization_id,'enterprise-access.view')
);

create or replace function public.bf34_scope_match(
 p_org uuid,
 p_client uuid default null,
 p_contract uuid default null,
 p_site uuid default null,
 p_discipline text default null
)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin() or exists(
  select 1
  from public.bf34_access_scopes s
  where s.user_id=auth.uid()
    and s.organization_id=p_org
    and s.is_active
    and (s.valid_from is null or s.valid_from<=current_date)
    and (s.valid_until is null or s.valid_until>=current_date)
    and (
      s.scope_level='organization'
      or (s.scope_level='client' and s.client_id=p_client)
      or (s.scope_level='contract' and s.client_id=p_client and s.contract_id=p_contract)
      or (s.scope_level='site' and s.client_id=p_client and s.site_id=p_site)
      or (s.scope_level='discipline' and lower(s.discipline_code)=lower(p_discipline))
    )
 );
$$;

create or replace function public.bf34_can(
 p_permission text,
 p_org uuid,
 p_client uuid default null,
 p_contract uuid default null,
 p_site uuid default null,
 p_discipline text default null
)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or exists(
  select 1
  from public.bf34_access_scopes s
  join public.bf_roles r on r.id=s.role_id
  join public.bf_role_permissions rp on rp.role_id=r.id
  join public.bf_permissions pm on pm.id=rp.permission_id
  join public.bf_profiles pr on pr.id=s.user_id
  where s.user_id=auth.uid()
    and pr.status='active'
    and s.organization_id=p_org
    and s.is_active
    and pm.code=p_permission
    and (s.valid_from is null or s.valid_from<=current_date)
    and (s.valid_until is null or s.valid_until>=current_date)
    and (
      s.scope_level='organization'
      or (s.scope_level='client' and s.client_id=p_client)
      or (s.scope_level='contract' and s.client_id=p_client and s.contract_id=p_contract)
      or (s.scope_level='site' and s.client_id=p_client and s.site_id=p_site)
      or (s.scope_level='discipline' and lower(s.discipline_code)=lower(p_discipline))
    )
 );
$$;

create or replace function public.bf34_assign_scope(
 p_user uuid,p_org uuid,p_role uuid,p_scope_level text,
 p_client uuid default null,p_contract uuid default null,p_site uuid default null,
 p_discipline text default null,p_valid_from date default null,p_valid_until date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare rid uuid; r public.bf_roles;
begin
 if not public.bf34_can_manage(p_org)
 then raise exception 'Enterprise access management permission required' using errcode='42501'; end if;

 if not exists(select 1 from public.bf_profiles p where p.id=p_user and p.status='active')
 then raise exception 'Active user required'; end if;

 select * into r from public.bf_roles where id=p_role;
 if not found or (r.organization_id is not null and r.organization_id<>p_org)
 then raise exception 'Invalid role for organization'; end if;

 if p_scope_level not in('organization','client','contract','site','discipline')
 then raise exception 'Invalid scope level'; end if;

 if p_client is not null and not exists(
  select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org
 ) then raise exception 'Invalid client scope'; end if;

 if p_contract is not null and not exists(
  select 1 from public.bf_contracts c where c.id=p_contract and c.organization_id=p_org
    and (p_client is null or c.client_id=p_client)
 ) then raise exception 'Invalid contract scope'; end if;

 if p_site is not null and not exists(
  select 1 from public.bf_sites s where s.id=p_site and s.organization_id=p_org
    and (p_client is null or s.client_id=p_client)
 ) then raise exception 'Invalid site scope'; end if;

 if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from
 then raise exception 'Invalid validity period'; end if;

 insert into public.bf34_access_scopes(
  user_id,organization_id,role_id,scope_level,client_id,contract_id,site_id,discipline_code,
  valid_from,valid_until,created_by
 ) values(
  p_user,p_org,p_role,p_scope_level,p_client,p_contract,p_site,nullif(btrim(p_discipline),''),
  p_valid_from,p_valid_until,auth.uid()
 )
 returning id into rid;

 -- Keep the legacy organization role assignment for backward compatibility.
 insert into public.bf_user_roles(user_id,organization_id,role_id)
 values(p_user,p_org,p_role)
 on conflict do nothing;

 return rid;
end $$;

create or replace function public.bf34_set_scope_active(p_scope uuid,p_active boolean)
returns void
language plpgsql security definer set search_path=''
as $$
declare s public.bf34_access_scopes;
begin
 select * into s from public.bf34_access_scopes where id=p_scope for update;
 if not found then raise exception 'Scope assignment not found'; end if;
 if not public.bf34_can_manage(s.organization_id)
 then raise exception 'Enterprise access management permission required' using errcode='42501'; end if;
 update public.bf34_access_scopes set is_active=p_active,updated_at=now() where id=p_scope;
end $$;

create or replace function public.bf34_access_matrix(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.bf4_staff(p_org,'enterprise-access.view')
    and not public.bf34_can_manage(p_org)
    and not public.bf_is_super_admin()
 then raise exception 'Enterprise access view permission required' using errcode='42501'; end if;

 select jsonb_build_object(
  'roles',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.code,'name',r.name,'is_system',r.is_system,
      'permissions',coalesce((
        select jsonb_agg(pm.code order by pm.code)
        from public.bf_role_permissions rp
        join public.bf_permissions pm on pm.id=rp.permission_id
        where rp.role_id=r.id
      ),'[]'::jsonb)
    ) order by r.name)
    from public.bf_roles r
    where r.organization_id is null or r.organization_id=p_org
  ),'[]'::jsonb),
  'assignments',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'user_id',s.user_id,'user_name',p.full_name,'email',p.email,
      'role_id',r.id,'role_code',r.code,'role_name',r.name,
      'scope_level',s.scope_level,'client_id',s.client_id,'contract_id',s.contract_id,
      'site_id',s.site_id,'discipline_code',s.discipline_code,'is_active',s.is_active,
      'valid_from',s.valid_from,'valid_until',s.valid_until
    ) order by p.full_name,r.name)
    from public.bf34_access_scopes s
    join public.bf_profiles p on p.id=s.user_id
    join public.bf_roles r on r.id=s.role_id
    where s.organization_id=p_org
  ),'[]'::jsonb),
  'scope_levels',jsonb_build_array('organization','client','contract','site','discipline')
 ) into result;

 return result;
end $$;

revoke all on function
 public.bf34_can_manage(uuid),
 public.bf34_scope_match(uuid,uuid,uuid,uuid,text),
 public.bf34_can(text,uuid,uuid,uuid,uuid,text),
 public.bf34_assign_scope(uuid,uuid,uuid,text,uuid,uuid,uuid,text,date,date),
 public.bf34_set_scope_active(uuid,boolean),
 public.bf34_access_matrix(uuid)
from public,anon;

grant execute on function
 public.bf34_can_manage(uuid),
 public.bf34_scope_match(uuid,uuid,uuid,uuid,text),
 public.bf34_can(text,uuid,uuid,uuid,uuid,text),
 public.bf34_assign_scope(uuid,uuid,uuid,text,uuid,uuid,uuid,text,date,date),
 public.bf34_set_scope_active(uuid,boolean),
 public.bf34_access_matrix(uuid)
to authenticated;

insert into public.bf_migrations(version) values(34);
commit;
