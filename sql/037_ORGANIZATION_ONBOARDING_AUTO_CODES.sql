-- Basmat Facilities CMMS — Sprint 36
-- Organization Onboarding + Automatic References + Automatic QR Identity
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=35)
 then raise exception 'Install and verify Sprint 35 first'; end if;
 if exists(select 1 from public.bf_migrations where version=36)
 then raise exception 'Sprint 36 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('organization-onboarding.view','View organization onboarding and identity'),
('organization-onboarding.manage','Create and update organizations')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code='company_admin' and p.code='organization-onboarding.view')
 or (r.code in('owner_director','contractor_director') and p.code='organization-onboarding.view')
on conflict do nothing;

-- Extend the existing organization master without changing existing mandatory columns.
alter table public.bf_organizations add column if not exists organization_type text;
alter table public.bf_organizations add column if not exists name_ar text;
alter table public.bf_organizations add column if not exists name_en text;
alter table public.bf_organizations add column if not exists registration_no text;
alter table public.bf_organizations add column if not exists vat_no text;
alter table public.bf_organizations add column if not exists email text;
alter table public.bf_organizations add column if not exists phone text;
alter table public.bf_organizations add column if not exists city text;
alter table public.bf_organizations add column if not exists address text;
alter table public.bf_organizations add column if not exists qr_token uuid;

update public.bf_organizations
set qr_token=gen_random_uuid()
where qr_token is null;

alter table public.bf_organizations
 alter column qr_token set default gen_random_uuid();

create unique index if not exists bf36_org_qr_token_uq
on public.bf_organizations(qr_token)
where qr_token is not null;

do $$
begin
 if not exists(
  select 1 from pg_constraint
  where conname='bf36_org_type_check'
    and conrelid='public.bf_organizations'::regclass
 ) then
  alter table public.bf_organizations
   add constraint bf36_org_type_check
   check(
    organization_type is null or organization_type in(
     'owner','maintenance_contractor','consultant','subcontractor',
     'service_provider','government_entity','private_company'
    )
   );
 end if;
end $$;

-- System-generated references for entities introduced after the original automatic-code migration.
create table public.bf36_reference_counters(
 entity text primary key,
 last_value bigint not null default 0 check(last_value>=0),
 updated_at timestamptz not null default now()
);
alter table public.bf36_reference_counters enable row level security;
revoke all on public.bf36_reference_counters from public,anon,authenticated;

create or replace function public.bf36_next_reference(p_entity text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
 n bigint;
 prefix text;
 width integer;
begin
 prefix:=case p_entity
  when 'projects' then 'PRJ'
  when 'teams' then 'TEAM'
  when 'contracts' then 'CTR'
  else null
 end;
 width:=case p_entity
  when 'projects' then 6
  when 'teams' then 6
  when 'contracts' then 6
  else null
 end;
 if prefix is null then raise exception 'Unsupported automatic reference entity'; end if;

 insert into public.bf36_reference_counters(entity,last_value)
 values(p_entity,1)
 on conflict(entity) do update
 set last_value=public.bf36_reference_counters.last_value+1,updated_at=now()
 returning last_value into n;

 return prefix||'-'||lpad(n::text,width,'0');
end $$;

revoke all on function public.bf36_next_reference(text) from public,anon,authenticated;

-- Contracts keep their official external contract number, while system_code is always automatic.
alter table public.bf_contracts add column if not exists system_code text;
alter table public.bf_contracts add column if not exists qr_token uuid;

update public.bf_contracts set qr_token=gen_random_uuid() where qr_token is null;
alter table public.bf_contracts alter column qr_token set default gen_random_uuid();

do $$
declare r record;
begin
 for r in select id from public.bf_contracts where system_code is null or btrim(system_code)='' order by created_at,id
 loop
  update public.bf_contracts
  set system_code=public.bf36_next_reference('contracts')
  where id=r.id;
 end loop;
end $$;

create unique index if not exists bf36_contract_system_code_uq on public.bf_contracts(system_code);
create unique index if not exists bf36_contract_qr_token_uq on public.bf_contracts(qr_token);

create or replace function public.bf36_contract_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if tg_op='INSERT' then
  new.system_code:=public.bf36_next_reference('contracts');
  new.qr_token:=coalesce(new.qr_token,gen_random_uuid());
 else
  if new.system_code is distinct from old.system_code then
   raise exception 'System reference is immutable';
  end if;
  if new.qr_token is distinct from old.qr_token then
   raise exception 'QR identity is immutable';
  end if;
 end if;
 return new;
end $$;

drop trigger if exists bf36_contract_identity on public.bf_contracts;
create trigger bf36_contract_identity
before insert or update on public.bf_contracts
for each row execute function public.bf36_contract_identity();

-- Projects and teams: all references and QR identities are generated by the server.
alter table public.bf35_projects add column if not exists qr_token uuid;
alter table public.bf35_teams add column if not exists qr_token uuid;

update public.bf35_projects set qr_token=gen_random_uuid() where qr_token is null;
update public.bf35_teams set qr_token=gen_random_uuid() where qr_token is null;
alter table public.bf35_projects alter column qr_token set default gen_random_uuid();
alter table public.bf35_teams alter column qr_token set default gen_random_uuid();

create unique index if not exists bf36_project_qr_token_uq on public.bf35_projects(qr_token);
create unique index if not exists bf36_team_qr_token_uq on public.bf35_teams(qr_token);

create or replace function public.bf36_project_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if tg_op='INSERT' then
  new.project_code:=public.bf36_next_reference('projects');
  new.qr_token:=coalesce(new.qr_token,gen_random_uuid());
 else
  if new.project_code is distinct from old.project_code then
   raise exception 'Project reference is immutable';
  end if;
  if new.qr_token is distinct from old.qr_token then
   raise exception 'Project QR identity is immutable';
  end if;
 end if;
 return new;
end $$;

create or replace function public.bf36_team_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if tg_op='INSERT' then
  new.team_code:=public.bf36_next_reference('teams');
  new.qr_token:=coalesce(new.qr_token,gen_random_uuid());
 else
  if new.team_code is distinct from old.team_code then
   raise exception 'Team reference is immutable';
  end if;
  if new.qr_token is distinct from old.qr_token then
   raise exception 'Team QR identity is immutable';
  end if;
 end if;
 return new;
end $$;

drop trigger if exists bf36_project_identity on public.bf35_projects;
create trigger bf36_project_identity
before insert or update on public.bf35_projects
for each row execute function public.bf36_project_identity();

drop trigger if exists bf36_team_identity on public.bf35_teams;
create trigger bf36_team_identity
before insert or update on public.bf35_teams
for each row execute function public.bf36_team_identity();

-- Onboarding is a platform-level action. Tenant admins can view their own identity but cannot create new tenants.
create or replace function public.bf36_create_organization(
 p_name_ar text,
 p_name_en text,
 p_type text,
 p_registration_no text default null,
 p_vat_no text default null,
 p_email text default null,
 p_phone text default null,
 p_city text default null,
 p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare rid uuid; display_name text;
begin
 if not public.bf_is_super_admin()
 then raise exception 'Platform administrator required' using errcode='42501'; end if;

 if p_type not in(
  'owner','maintenance_contractor','consultant','subcontractor',
  'service_provider','government_entity','private_company'
 ) then raise exception 'Invalid organization type'; end if;

 display_name:=coalesce(nullif(btrim(p_name_ar),''),nullif(btrim(p_name_en),''));
 if display_name is null then raise exception 'Organization name is required'; end if;

 insert into public.bf_organizations(
  name,status,organization_type,name_ar,name_en,registration_no,vat_no,email,phone,city,address
 ) values(
  display_name,'active',p_type,nullif(btrim(p_name_ar),''),nullif(btrim(p_name_en),''),
  nullif(btrim(p_registration_no),''),nullif(btrim(p_vat_no),''),
  nullif(btrim(p_email),''),nullif(btrim(p_phone),''),
  nullif(btrim(p_city),''),nullif(btrim(p_address),'')
 ) returning id into rid;

 return rid;
end $$;

create or replace function public.bf36_update_organization(
 p_org uuid,
 p_name_ar text,
 p_name_en text,
 p_type text,
 p_registration_no text default null,
 p_vat_no text default null,
 p_email text default null,
 p_phone text default null,
 p_city text default null,
 p_address text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare display_name text;
begin
 if not public.bf_is_super_admin() and not public.bf_can(p_org,'organizations.manage')
 then raise exception 'Organization management permission required' using errcode='42501'; end if;

 display_name:=coalesce(nullif(btrim(p_name_ar),''),nullif(btrim(p_name_en),''));
 if display_name is null then raise exception 'Organization name is required'; end if;

 update public.bf_organizations
 set name=display_name,
     organization_type=p_type,
     name_ar=nullif(btrim(p_name_ar),''),
     name_en=nullif(btrim(p_name_en),''),
     registration_no=nullif(btrim(p_registration_no),''),
     vat_no=nullif(btrim(p_vat_no),''),
     email=nullif(btrim(p_email),''),
     phone=nullif(btrim(p_phone),''),
     city=nullif(btrim(p_city),''),
     address=nullif(btrim(p_address),'')
 where id=p_org;

 if not found then raise exception 'Organization not found'; end if;
end $$;

create or replace function public.bf36_create_project_auto(
 p_org uuid,p_client uuid,p_contract uuid,p_name text,
 p_start date default null,p_end date default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare rid uuid;
begin
 if not public.bf35_can_manage(p_org)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;

 if not exists(select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org)
 then raise exception 'Invalid client'; end if;

 if p_contract is not null and not exists(
  select 1 from public.bf_contracts c
  where c.id=p_contract and c.organization_id=p_org and c.client_id=p_client
 ) then raise exception 'Invalid contract'; end if;

 if length(btrim(coalesce(p_name,'')))<3 then raise exception 'Project name is required'; end if;
 if p_end is not null and p_start is not null and p_end<p_start then raise exception 'Invalid project dates'; end if;

 insert into public.bf35_projects(
  organization_id,client_id,contract_id,project_code,name,start_date,end_date,created_by
 ) values(
  p_org,p_client,p_contract,'AUTO',btrim(p_name),p_start,p_end,auth.uid()
 ) returning id into rid;

 return rid;
end $$;

create or replace function public.bf36_create_team_auto(
 p_project uuid,p_service_line uuid,p_site uuid,p_name text,
 p_discipline text default null,p_shift text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare p public.bf35_projects; rid uuid;
begin
 select * into p from public.bf35_projects where id=p_project;
 if not found then raise exception 'Project not found'; end if;

 if not public.bf35_can_manage(p.organization_id)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;

 if p_service_line is not null and not exists(
  select 1 from public.bf35_service_lines l
  where l.id=p_service_line and l.organization_id=p.organization_id and l.is_active
 ) then raise exception 'Invalid service line'; end if;

 if p_site is not null and not exists(
  select 1 from public.bf35_project_sites ps
  where ps.project_id=p.id and ps.site_id=p_site
 ) then raise exception 'Site must be linked to project first'; end if;

 if length(btrim(coalesce(p_name,'')))<2 then raise exception 'Team name is required'; end if;

 insert into public.bf35_teams(
  organization_id,project_id,service_line_id,site_id,client_id,team_code,name,
  discipline_code,shift_code,created_by
 ) values(
  p.organization_id,p.id,p_service_line,p_site,p.client_id,'AUTO',btrim(p_name),
  nullif(btrim(p_discipline),''),nullif(btrim(p_shift),''),auth.uid()
 ) returning id into rid;

 return rid;
end $$;

create or replace function public.bf36_organization_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,
   'name',o.name,
   'code',o.code,
   'status',o.status,
   'organization_type',o.organization_type,
   'name_ar',o.name_ar,
   'name_en',o.name_en,
   'registration_no',o.registration_no,
   'vat_no',o.vat_no,
   'email',o.email,
   'phone',o.phone,
   'city',o.city,
   'address',o.address,
   'qr_token',o.qr_token,
   'qr_payload','bfcmms://organization/'||o.id::text||'?token='||o.qr_token::text
 ) order by o.name),'[]'::jsonb)
 into result
 from public.bf_organizations o
 where public.bf_is_super_admin()
    or public.bf_can(o.id,'organizations.view')
    or public.bf_can(o.id,'organizations.manage');

 return result;
end $$;

revoke all on function
 public.bf36_contract_identity(),
 public.bf36_project_identity(),
 public.bf36_team_identity()
from public,anon,authenticated;

revoke all on function
 public.bf36_create_organization(text,text,text,text,text,text,text,text,text),
 public.bf36_update_organization(uuid,text,text,text,text,text,text,text,text,text),
 public.bf36_create_project_auto(uuid,uuid,uuid,text,date,date),
 public.bf36_create_team_auto(uuid,uuid,uuid,text,text,text),
 public.bf36_organization_directory()
from public,anon;

grant execute on function
 public.bf36_create_organization(text,text,text,text,text,text,text,text,text),
 public.bf36_update_organization(uuid,text,text,text,text,text,text,text,text,text),
 public.bf36_create_project_auto(uuid,uuid,uuid,text,date,date),
 public.bf36_create_team_auto(uuid,uuid,uuid,text,text,text),
 public.bf36_organization_directory()
to authenticated;

insert into public.bf_migrations(version) values(36);
commit;
