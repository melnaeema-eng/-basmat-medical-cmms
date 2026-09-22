begin;
create extension if not exists pgcrypto;
create table if not exists public.bf_migrations(version integer primary key,applied_at timestamptz default now());
do $$ begin
 if exists(select 1 from public.bf_migrations where version=3) then raise exception 'Migration 003 already applied';end if;
 if not exists(select 1 from information_schema.tables where table_schema='public' and table_name='bf_profiles') then raise exception 'Install Sprint 1 and Sprint 2 first';end if;
end $$;

create or replace function public.bf_is_super_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bf_profiles where id=auth.uid() and status='active' and is_super_admin);
$$;
create or replace function public.bf_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.bf_is_super_admin() or exists(
 select 1 from public.bf_user_roles ur
 join public.bf_profiles p on p.id=ur.user_id
 join public.bf_roles r on r.id=ur.role_id
 join public.bf_role_permissions rp on rp.role_id=r.id
 join public.bf_permissions pm on pm.id=rp.permission_id
 where ur.user_id=auth.uid() and p.status='active' and ur.organization_id=p_org
 and (r.organization_id is null or r.organization_id=p_org)
 and r.code not in('client_admin','client_user') and pm.code=p_permission);
$$;
create or replace function public.bf_has_org_access(target_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.bf_can(target_org,'organizations.view');
$$;
insert into public.bf_permissions(code,description) values
('locations.view','View locations'),('locations.manage','Manage locations'),
('assets.view','View assets'),('assets.manage','Manage assets')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code in('company_admin','facility_manager','maintenance_manager','supervisor')
and p.code in('locations.view','locations.manage','assets.view','assets.manage')
on conflict do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code in('technician','help_desk','store_keeper')
and p.code in('locations.view','assets.view')
on conflict do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code='company_admin' and p.code='users.manage'
on conflict do nothing;


-- Complete the foundation role-permission mappings missing from Sprint 2.
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where
 (r.code='company_admin' and p.code in('organizations.view','clients.view','clients.manage','contracts.view','contracts.manage','sites.view','sites.manage','users.view','users.manage'))
 or (r.code in('facility_manager','maintenance_manager') and p.code in('organizations.view','clients.view','contracts.view','sites.view','sites.manage','users.view'))
 or (r.code='supervisor' and p.code in('organizations.view','clients.view','contracts.view','sites.view','users.view'))
 or (r.code in('technician','help_desk','store_keeper') and p.code in('organizations.view','clients.view','contracts.view','sites.view'))
on conflict do nothing;
create unique index if not exists bf_clients_scope3 on public.bf_clients(id,organization_id);
create unique index if not exists bf_contracts_scope3 on public.bf_contracts(id,organization_id,client_id);
create unique index if not exists bf_sites_scope3 on public.bf_sites(id,organization_id);
create unique index if not exists bf_sites_client_scope3 on public.bf_sites(id,organization_id,client_id);
alter table public.bf_contracts add constraint bf3_contract_client foreign key(client_id,organization_id) references public.bf_clients(id,organization_id);
alter table public.bf_sites add constraint bf3_site_client foreign key(client_id,organization_id) references public.bf_clients(id,organization_id);
alter table public.bf_sites add constraint bf3_site_contract foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id);

create table public.bf_client_access(
 user_id uuid not null references public.bf_profiles(id),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 role_code text not null check(role_code in('client_admin','client_user')),
 primary key(user_id,organization_id,client_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id)
);
create or replace function public.bf_can_read(p_org uuid,p_client uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.bf_can(p_org,p_permission) or
 (p_permission in('clients.view','contracts.view','sites.view','locations.view','assets.view')
 and exists(select 1 from public.bf_client_access ca join public.bf_profiles p on p.id=ca.user_id
 where ca.user_id=auth.uid() and ca.organization_id=p_org and ca.client_id=p_client and p.status='active'));
$$;

-- Add tenant keys to the existing Sprint 1 location hierarchy.
alter table public.bf_buildings add column if not exists organization_id uuid;
alter table public.bf_floors add column if not exists organization_id uuid;
alter table public.bf_floors add column if not exists site_id uuid;
alter table public.bf_zones add column if not exists organization_id uuid;
alter table public.bf_zones add column if not exists site_id uuid;
alter table public.bf_rooms add column if not exists organization_id uuid;
alter table public.bf_rooms add column if not exists site_id uuid;
do $$ declare t text;begin
 foreach t in array array['bf_buildings','bf_floors','bf_zones','bf_rooms'] loop
  execute format('alter table public.%I add column if not exists name_ar text',t);
  execute format('alter table public.%I add column if not exists name_en text',t);
  execute format('alter table public.%I add column if not exists code text',t);
  execute format('alter table public.%I add column if not exists description text',t);
  execute format('alter table public.%I add column if not exists status text not null default ''active''',t);
 end loop;
end $$;
update public.bf_buildings b set organization_id=s.organization_id from public.bf_sites s where b.site_id=s.id;
update public.bf_floors f set organization_id=b.organization_id,site_id=b.site_id from public.bf_buildings b where f.building_id=b.id;
update public.bf_zones z set organization_id=f.organization_id,site_id=f.site_id from public.bf_floors f where z.floor_id=f.id;
update public.bf_rooms r set organization_id=z.organization_id,site_id=z.site_id from public.bf_zones z where r.zone_id=z.id;
do $$ declare t text;begin
 foreach t in array array['bf_buildings','bf_floors','bf_zones','bf_rooms'] loop
  execute format('update public.%I set name_en=name where name_en is null',t);
  execute format('alter table public.%I alter column organization_id set not null',t);
  if t<>'bf_buildings' then execute format('alter table public.%I alter column site_id set not null',t);end if;
 end loop;
end $$;
create unique index bf_buildings_scope3 on public.bf_buildings(id,organization_id,site_id);
create unique index bf_floors_scope3 on public.bf_floors(id,organization_id,site_id);
create unique index bf_zones_scope3 on public.bf_zones(id,organization_id,site_id);
create unique index bf_rooms_scope3 on public.bf_rooms(id,organization_id,site_id);
alter table public.bf_buildings add constraint bf3_building_site foreign key(site_id,organization_id) references public.bf_sites(id,organization_id);
alter table public.bf_floors add constraint bf3_floor_parent foreign key(building_id,organization_id,site_id) references public.bf_buildings(id,organization_id,site_id);
alter table public.bf_zones add constraint bf3_zone_parent foreign key(floor_id,organization_id,site_id) references public.bf_floors(id,organization_id,site_id);
alter table public.bf_rooms add constraint bf3_room_parent foreign key(zone_id,organization_id,site_id) references public.bf_zones(id,organization_id,site_id);

create table public.bf_asset_categories(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 parent_id uuid,code text not null,name_ar text not null,name_en text not null,description text,
 status text not null default 'active' check(status in('active','inactive','archived')),
 created_at timestamptz not null default now(),unique(organization_id,code),unique(id,organization_id),
 foreign key(parent_id,organization_id) references public.bf_asset_categories(id,organization_id),
 check(parent_id is null or parent_id<>id)
);
create table public.bf_assets(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,site_id uuid not null,building_id uuid,floor_id uuid,zone_id uuid,room_id uuid,
 category_id uuid not null,parent_asset_id uuid,asset_tag text not null,name_ar text not null,name_en text not null,
 description text,serial_number text,manufacturer text,model text,capacity text,unit text,
 installation_date date,commissioning_date date,purchase_date date,warranty_start date,warranty_end date,warranty_provider text,
 purchase_cost numeric(18,2) check(purchase_cost>=0),replacement_cost numeric(18,2) check(replacement_cost>=0),
 expected_life_years integer check(expected_life_years between 1 and 200),
 criticality text not null default 'medium' check(criticality in('low','medium','high','critical')),
 condition text not null default 'good' check(condition in('excellent','good','fair','poor','failed')),
 operational_status text not null default 'in_service' check(operational_status in('in_service','out_of_service','under_maintenance','disposed')),
 status text not null default 'active' check(status in('active','inactive','archived')),notes text,
 created_by uuid references auth.users(id),updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,asset_tag),unique(id,organization_id,site_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(category_id,organization_id) references public.bf_asset_categories(id,organization_id),
 foreign key(building_id,organization_id,site_id) references public.bf_buildings(id,organization_id,site_id),
 foreign key(floor_id,organization_id,site_id) references public.bf_floors(id,organization_id,site_id),
 foreign key(zone_id,organization_id,site_id) references public.bf_zones(id,organization_id,site_id),
 foreign key(room_id,organization_id,site_id) references public.bf_rooms(id,organization_id,site_id),
 foreign key(parent_asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id),
 check(parent_asset_id is null or parent_asset_id<>id),
 check(warranty_start is null or warranty_end is null or warranty_end>=warranty_start)
);

-- Prevent direct tenant reassignment on the existing operational records.
create or replace function public.bf3_guard_scope()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id then raise exception 'Company reassignment requires a controlled migration';end if;
 if tg_table_name in('bf_contracts','bf_sites') and new.client_id is distinct from old.client_id then raise exception 'Client reassignment requires a controlled migration';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['bf_clients','bf_contracts','bf_sites'] loop
  execute format('create trigger bf3_guard_scope before update on public.%I for each row execute function public.bf3_guard_scope()',t);
 end loop;end $$;
create index bf_assets_site3 on public.bf_assets(organization_id,site_id,status);
create index bf_assets_warranty3 on public.bf_assets(warranty_end);
create table public.bf_asset_events(
 id bigint generated always as identity primary key,organization_id uuid not null,client_id uuid not null,
 asset_id uuid not null references public.bf_assets(id),actor_id uuid,action text not null,
 details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index bf_asset_events_lookup3 on public.bf_asset_events(asset_id,created_at desc);

create or replace function public.bf3_validate_asset()
returns trigger language plpgsql set search_path='' as $$
declare v uuid;
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.client_id<>old.client_id or new.site_id<>old.site_id) then
  raise exception 'Changing asset ownership or site requires a controlled transfer';end if;
 v:=new.parent_asset_id;
 for i in 1..100 loop
  exit when v is null;
  if v=new.id then raise exception 'Asset hierarchy cycle';end if;
  select parent_asset_id into v from public.bf_assets where id=v;
 end loop;
 if v is not null then raise exception 'Asset hierarchy too deep';end if;

 -- The selected location must be one coherent chain, not unrelated rooms/floors.
 if new.room_id is not null and (new.zone_id is null or not exists(select 1 from public.bf_rooms where id=new.room_id and zone_id=new.zone_id)) then raise exception 'Room does not belong to zone';end if;
 if new.zone_id is not null and (new.floor_id is null or not exists(select 1 from public.bf_zones where id=new.zone_id and floor_id=new.floor_id)) then raise exception 'Zone does not belong to floor';end if;
 if new.floor_id is not null and (new.building_id is null or not exists(select 1 from public.bf_floors where id=new.floor_id and building_id=new.building_id)) then raise exception 'Floor does not belong to building';end if;
 new.updated_by:=auth.uid();new.updated_at:=now();
 if tg_op='INSERT' then new.created_by:=auth.uid();end if;
 return new;
end $$;
create trigger bf3_validate_asset before insert or update on public.bf_assets for each row execute function public.bf3_validate_asset();
create or replace function public.bf3_log_asset()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.bf_asset_events(organization_id,client_id,asset_id,actor_id,action,details)
 values(new.organization_id,new.client_id,new.id,auth.uid(),lower(tg_op),jsonb_build_object('asset_tag',new.asset_tag,'status',new.status));
 return new;
end $$;
create trigger bf3_log_asset after insert or update on public.bf_assets for each row execute function public.bf3_log_asset();

create or replace function public.bf3_validate_location()
returns trigger language plpgsql set search_path='' as $$
declare o uuid;s uuid;
begin
 if tg_table_name='bf_buildings' then
  select organization_id,id into o,s from public.bf_sites where id=new.site_id;
 elsif tg_table_name='bf_floors' then
  select organization_id,site_id into o,s from public.bf_buildings where id=new.building_id;
 elsif tg_table_name='bf_zones' then
  select organization_id,site_id into o,s from public.bf_floors where id=new.floor_id;
 else
  select organization_id,site_id into o,s from public.bf_zones where id=new.zone_id;
 end if;
 if o is null then raise exception 'Parent location not found';end if;
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.site_id<>old.site_id) then
  raise exception 'Location transfer is not supported';end if;
 new.organization_id:=o;new.site_id:=s;new.name:=coalesce(nullif(new.name_en,''),new.name_ar,new.name);
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['bf_buildings','bf_floors','bf_zones','bf_rooms'] loop
  execute format('create trigger bf3_validate_location before insert or update on public.%I for each row execute function public.bf3_validate_location()',t);
 end loop;end $$;
create or replace function public.bf3_validate_category()
returns trigger language plpgsql set search_path='' as $$
declare v uuid;
begin
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Company cannot be changed';end if;
 v:=new.parent_id;
 for i in 1..100 loop
  exit when v is null;
  if v=new.id then raise exception 'Category hierarchy cycle';end if;
  select parent_id into v from public.bf_asset_categories where id=v;
 end loop;
 if v is not null then raise exception 'Category hierarchy too deep';end if;
 return new;
end $$;
create trigger bf3_validate_category before insert or update on public.bf_asset_categories for each row execute function public.bf3_validate_category();

-- Replace permissive Sprint 2 policies with one authoritative permission model.
do $$ declare x record;begin
 for x in select schemaname,tablename,policyname from pg_policies
 where schemaname='public' and tablename in
 ('bf_organizations','bf_clients','bf_contracts','bf_sites','bf_buildings','bf_floors',
  'bf_zones','bf_rooms','bf_profiles','bf_roles','bf_permissions','bf_role_permissions',
  'bf_user_roles','bf_client_access','bf_audit_logs','bf_notifications',
  'bf_asset_categories','bf_assets','bf_asset_events') loop
  execute format('drop policy if exists %I on %I.%I',x.policyname,x.schemaname,x.tablename);
 end loop;end $$;
do $$ declare t text;begin
 foreach t in array array['bf_organizations','bf_clients','bf_contracts','bf_sites','bf_buildings','bf_floors','bf_zones','bf_rooms','bf_profiles','bf_roles','bf_permissions','bf_role_permissions','bf_user_roles','bf_client_access','bf_audit_logs','bf_notifications','bf_asset_categories','bf_assets','bf_asset_events'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;end $$;
create policy bf3_org_r on public.bf_organizations for select to authenticated using(public.bf_can(id,'organizations.view') or exists(select 1 from public.bf_client_access ca where ca.organization_id=bf_organizations.id and ca.user_id=auth.uid()));
create policy bf3_org_i on public.bf_organizations for insert to authenticated with check(public.bf_is_super_admin());
create policy bf3_org_u on public.bf_organizations for update to authenticated using(public.bf_is_super_admin()) with check(public.bf_is_super_admin());
create policy bf3_client_r on public.bf_clients for select to authenticated using(public.bf_can_read(organization_id,id,'clients.view'));
create policy bf3_client_i on public.bf_clients for insert to authenticated with check(public.bf_can(organization_id,'clients.manage'));
create policy bf3_client_u on public.bf_clients for update to authenticated using(public.bf_can(organization_id,'clients.manage')) with check(public.bf_can(organization_id,'clients.manage'));
create policy bf3_contract_r on public.bf_contracts for select to authenticated using(public.bf_can_read(organization_id,client_id,'contracts.view'));
create policy bf3_contract_i on public.bf_contracts for insert to authenticated with check(public.bf_can(organization_id,'contracts.manage'));
create policy bf3_contract_u on public.bf_contracts for update to authenticated using(public.bf_can(organization_id,'contracts.manage')) with check(public.bf_can(organization_id,'contracts.manage'));
create policy bf3_site_r on public.bf_sites for select to authenticated using(public.bf_can_read(organization_id,client_id,'sites.view'));
create policy bf3_site_i on public.bf_sites for insert to authenticated with check(public.bf_can(organization_id,'sites.manage'));
create policy bf3_site_u on public.bf_sites for update to authenticated using(public.bf_can(organization_id,'sites.manage')) with check(public.bf_can(organization_id,'sites.manage'));
do $$ declare t text;begin
 foreach t in array array['bf_buildings','bf_floors','bf_zones','bf_rooms'] loop
  execute format('create policy bf3_r on public.%I for select to authenticated using(exists(select 1 from public.bf_sites s where s.id=site_id and s.organization_id=organization_id and public.bf_can_read(s.organization_id,s.client_id,''locations.view'')))',t);
  execute format('create policy bf3_i on public.%I for insert to authenticated with check(public.bf_can(organization_id,''locations.manage''))',t);
  execute format('create policy bf3_u on public.%I for update to authenticated using(public.bf_can(organization_id,''locations.manage'')) with check(public.bf_can(organization_id,''locations.manage''))',t);
 end loop;end $$;
create policy bf3_cat_r on public.bf_asset_categories for select to authenticated using(public.bf_can(organization_id,'assets.view') or exists(select 1 from public.bf_client_access ca where ca.organization_id=bf_asset_categories.organization_id and ca.user_id=auth.uid()));
create policy bf3_cat_i on public.bf_asset_categories for insert to authenticated with check(public.bf_can(organization_id,'assets.manage'));
create policy bf3_cat_u on public.bf_asset_categories for update to authenticated using(public.bf_can(organization_id,'assets.manage')) with check(public.bf_can(organization_id,'assets.manage'));
create policy bf3_asset_r on public.bf_assets for select to authenticated using(public.bf_can_read(organization_id,client_id,'assets.view'));
create policy bf3_asset_i on public.bf_assets for insert to authenticated with check(public.bf_can(organization_id,'assets.manage'));
create policy bf3_asset_u on public.bf_assets for update to authenticated using(public.bf_can(organization_id,'assets.manage')) with check(public.bf_can(organization_id,'assets.manage'));
create policy bf3_event_r on public.bf_asset_events for select to authenticated using(public.bf_can_read(organization_id,client_id,'assets.view'));
create policy bf3_profile_r on public.bf_profiles for select to authenticated using(id=auth.uid() or public.bf_is_super_admin() or exists(select 1 from public.bf_user_roles ur where ur.user_id=bf_profiles.id and public.bf_can(ur.organization_id,'users.view')));
create policy bf3_profile_u on public.bf_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy bf3_role_r on public.bf_roles for select to authenticated using(is_system or public.bf_can(organization_id,'users.view'));
create policy bf3_permission_r on public.bf_permissions for select to authenticated using(true);
create policy bf3_role_permission_r on public.bf_role_permissions for select to authenticated using(exists(select 1 from public.bf_roles r where r.id=role_id and (r.is_system or public.bf_can(r.organization_id,'users.view'))));
create policy bf3_user_role_r on public.bf_user_roles for select to authenticated using(user_id=auth.uid() or public.bf_can(organization_id,'users.view'));
create policy bf3_client_access_r on public.bf_client_access for select to authenticated using(user_id=auth.uid() or public.bf_can(organization_id,'users.view'));
create policy bf3_audit_r on public.bf_audit_logs for select to authenticated using(public.bf_can(organization_id,'users.view'));
create policy bf3_notification_r on public.bf_notifications for select to authenticated using(user_id=auth.uid());
create policy bf3_notification_u on public.bf_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.bf_profiles from anon,authenticated;
grant select on public.bf_profiles to authenticated;
grant update(full_name,phone) on public.bf_profiles to authenticated;
revoke all on public.bf_roles,public.bf_permissions,public.bf_role_permissions,public.bf_user_roles,public.bf_client_access from anon,authenticated;
grant select on public.bf_roles,public.bf_permissions,public.bf_role_permissions,public.bf_user_roles,public.bf_client_access to authenticated;
revoke all on public.bf_asset_events,public.bf_audit_logs from anon,authenticated;
grant select on public.bf_asset_events,public.bf_audit_logs to authenticated;
revoke all on public.bf_asset_categories,public.bf_assets from anon,authenticated;
grant select,insert,update on public.bf_asset_categories,public.bf_assets to authenticated;
revoke all on public.bf_organizations,public.bf_clients,public.bf_contracts,public.bf_sites,public.bf_buildings,public.bf_floors,public.bf_zones,public.bf_rooms from anon,authenticated;
grant select,insert,update on public.bf_organizations,public.bf_clients,public.bf_contracts,public.bf_sites,public.bf_buildings,public.bf_floors,public.bf_zones,public.bf_rooms to authenticated;
revoke all on public.bf_notifications from anon,authenticated;
grant select on public.bf_notifications to authenticated;
grant update(is_read) on public.bf_notifications to authenticated;

create or replace function public.bf3_assign_role(p_user uuid,p_org uuid,p_role uuid,p_client uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not public.bf_can(p_org,'users.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if not exists(select 1 from public.bf_profiles where id=p_user and status='active') then raise exception 'Active user required';end if;
 select * into r from public.bf_roles where id=p_role and (organization_id is null or organization_id=p_org);
 if not found then raise exception 'Invalid role';end if;
 if (r.code='company_admin' or exists(select 1 from public.bf_role_permissions rp join public.bf_permissions pm on pm.id=rp.permission_id where rp.role_id=r.id and pm.code in('organizations.manage','users.manage'))) and not public.bf_is_super_admin() then raise exception 'Platform administrator required';end if;
 if r.code in('client_admin','client_user') then
  if p_client is null or not exists(select 1 from public.bf_clients where id=p_client and organization_id=p_org) then raise exception 'Valid client required';end if;
  insert into public.bf_client_access(user_id,organization_id,client_id,role_code) values(p_user,p_org,p_client,r.code)
  on conflict(user_id,organization_id,client_id) do update set role_code=excluded.role_code;
 else
  if p_client is not null then raise exception 'Staff roles cannot be assigned as client roles';end if;
  insert into public.bf_user_roles(user_id,organization_id,role_id) values(p_user,p_org,p_role) on conflict do nothing;
 end if;
end $$;
revoke all on function public.bf3_assign_role(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.bf3_assign_role(uuid,uuid,uuid,uuid) to authenticated;
create or replace function public.bf3_my_access()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('super_admin',public.bf_is_super_admin(),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('organization_id',ur.organization_id,'code',r.code,'permission',pm.code))
 from public.bf_user_roles ur join public.bf_roles r on r.id=ur.role_id
 join public.bf_role_permissions rp on rp.role_id=r.id join public.bf_permissions pm on pm.id=rp.permission_id
 where ur.user_id=auth.uid() and r.code not in('client_admin','client_user') and (r.organization_id is null or r.organization_id=ur.organization_id)),'[]'::jsonb),
 'clients',coalesce((select jsonb_agg(jsonb_build_object('organization_id',organization_id,'client_id',client_id,'role_code',role_code))
 from public.bf_client_access where user_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function public.bf3_my_access() from public,anon;
grant execute on function public.bf3_my_access() to authenticated;


-- Commercial values require a management permission even when a technician can read an asset.
revoke all on public.bf_assets from anon,authenticated;
grant select(id, created_at, updated_at, created_by, updated_by, organization_id, client_id, site_id, building_id, floor_id, zone_id, room_id, category_id, parent_asset_id, asset_tag, name_ar, name_en, description, serial_number, manufacturer, model, capacity, unit, installation_date, commissioning_date, purchase_date, warranty_start, warranty_end, warranty_provider, expected_life_years, criticality, condition, operational_status, status, notes) on public.bf_assets to authenticated;
create or replace function public.bf3_asset_cost(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a record;
begin
 select organization_id,purchase_cost,replacement_cost into a from public.bf_assets where id=p_id;
 if not found or not public.bf_can(a.organization_id,'assets.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 return jsonb_build_object('purchase_cost',a.purchase_cost,'replacement_cost',a.replacement_cost);
end $$;
create or replace function public.bf3_save_asset(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.bf_assets; old public.bf_assets; target_org uuid;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid asset';end if;
 if p_id is not null then
  select * into old from public.bf_assets where id=p_id for update;
  if not found then raise exception 'Asset not found';end if;
  target_org:=old.organization_id;
 else
  target_org:=(p_payload->>'organization_id')::uuid;
 end if;
 if not public.bf_can(target_org,'assets.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 v:=jsonb_populate_record(old,p_payload - array['id','created_at','created_by','updated_at','updated_by']);
 if p_id is not null then
  if v.organization_id is distinct from old.organization_id or v.client_id is distinct from old.client_id or v.site_id is distinct from old.site_id then
   raise exception 'Controlled transfer required';end if;
  update public.bf_assets set
  organization_id=v.organization_id,
 client_id=v.client_id,
 site_id=v.site_id,
 building_id=v.building_id,
 floor_id=v.floor_id,
 zone_id=v.zone_id,
 room_id=v.room_id,
 category_id=v.category_id,
 parent_asset_id=v.parent_asset_id,
 asset_tag=v.asset_tag,
 name_ar=v.name_ar,
 name_en=v.name_en,
 description=v.description,
 serial_number=v.serial_number,
 manufacturer=v.manufacturer,
 model=v.model,
 capacity=v.capacity,
 unit=v.unit,
 installation_date=v.installation_date,
 commissioning_date=v.commissioning_date,
 purchase_date=v.purchase_date,
 warranty_start=v.warranty_start,
 warranty_end=v.warranty_end,
 warranty_provider=v.warranty_provider,
 purchase_cost=v.purchase_cost,
 replacement_cost=v.replacement_cost,
 expected_life_years=v.expected_life_years,
 criticality=v.criticality,
 condition=v.condition,
 operational_status=v.operational_status,
 status=v.status,
 notes=v.notes
  where id=p_id;
  return p_id;
 end if;
 v.id:=gen_random_uuid();v.created_at:=now();v.updated_at:=now();
 v.status:=coalesce(v.status,'active');v.criticality:=coalesce(v.criticality,'medium');
 v.condition:=coalesce(v.condition,'good');v.operational_status:=coalesce(v.operational_status,'in_service');
 insert into public.bf_assets(id,created_at,updated_at,organization_id, client_id, site_id, building_id, floor_id, zone_id, room_id, category_id, parent_asset_id, asset_tag, name_ar, name_en, description, serial_number, manufacturer, model, capacity, unit, installation_date, commissioning_date, purchase_date, warranty_start, warranty_end, warranty_provider, purchase_cost, replacement_cost, expected_life_years, criticality, condition, operational_status, status, notes)
 values(v.id,v.created_at,v.updated_at,v.organization_id, v.client_id, v.site_id, v.building_id, v.floor_id, v.zone_id, v.room_id, v.category_id, v.parent_asset_id, v.asset_tag, v.name_ar, v.name_en, v.description, v.serial_number, v.manufacturer, v.model, v.capacity, v.unit, v.installation_date, v.commissioning_date, v.purchase_date, v.warranty_start, v.warranty_end, v.warranty_provider, v.purchase_cost, v.replacement_cost, v.expected_life_years, v.criticality, v.condition, v.operational_status, v.status, v.notes);
 return v.id;
end $$;
revoke all on function public.bf3_asset_cost(uuid) from public,anon;
revoke all on function public.bf3_save_asset(uuid,jsonb) from public,anon;
grant execute on function public.bf3_asset_cost(uuid) to authenticated;
grant execute on function public.bf3_save_asset(uuid,jsonb) to authenticated;

create or replace function public.bf3_audit_master()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_value jsonb;after_value jsonb;
begin
 before_value:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 after_value:=to_jsonb(new);
 if tg_table_name='bf_assets' then
  before_value:=before_value - array['purchase_cost','replacement_cost'];
  after_value:=after_value - array['purchase_cost','replacement_cost'];
 end if;
 insert into public.bf_audit_logs(organization_id,user_id,action,entity_type,entity_id,old_data,new_data)
 values(new.organization_id,auth.uid(),lower(tg_op),tg_table_name,new.id,before_value,after_value);
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['bf_buildings','bf_floors','bf_zones','bf_rooms','bf_asset_categories','bf_assets'] loop
  execute format('create trigger bf3_audit_master after insert or update on public.%I for each row execute function public.bf3_audit_master()',t);
 end loop;end $$;
insert into public.bf_migrations(version) values(3);
commit;
