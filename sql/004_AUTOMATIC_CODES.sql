-- Sprint 3.2: automatic reference codes.
-- Run once after migration 003. Existing references are preserved.
begin;
create table if not exists public.bf_migrations(
 version integer primary key,applied_at timestamptz default now()
);
do $$ begin
 if exists(select 1 from public.bf_migrations where version=32) then
  raise exception 'Automatic codes migration already applied';
 end if;
 if not exists(select 1 from public.bf_migrations where version=3) then
  raise exception 'Migration 003 must be installed first';
 end if;
end $$;

-- Serialize migration against writes so no legacy reference is missed.
lock table public.bf_organizations,public.bf_clients,public.bf_sites,
 public.bf_buildings,public.bf_floors,public.bf_zones,public.bf_rooms,
 public.bf_asset_categories,public.bf_assets in share row exclusive mode;

-- One global sequence per entity type: codes remain unique across tenants.
-- The primary keys remain UUIDs. These codes are human-readable references.
create table public.bf_code_counters(
 entity text primary key,
 last_value bigint not null default 0 check(last_value>=0),
 updated_at timestamptz not null default now()
);
revoke all on public.bf_code_counters from public,anon,authenticated;
alter table public.bf_code_counters enable row level security;

-- Keep issued references forever, including archived/deleted records.
create table public.bf_code_registry(
 entity text not null,
 code text not null,
 record_id uuid not null,
 issued_at timestamptz not null default now(),
 issued boolean not null default false,
 primary key(entity,record_id)
);
revoke all on public.bf_code_registry from public,anon,authenticated;
alter table public.bf_code_registry enable row level security;

create or replace function public.bf32_allocate_code(p_entity text,p_prefix text,p_width integer)
returns text language plpgsql security definer set search_path=''
as $$
declare n bigint; candidate text; target_table text; occupied boolean;
begin
 -- Internal use only. No direct API access is granted.
 if p_width not between 1 and 12 or p_prefix is null or p_prefix !~ '^[A-Z]{2,8}$' then raise exception 'Invalid code format';end if;
 if p_entity not in('organizations','clients','sites','buildings','floors','zones','rooms','categories','assets') then
  raise exception 'Unsupported entity';
 end if;
 target_table:=case when p_entity='categories' then 'bf_asset_categories'
                    when p_entity='assets' then 'bf_assets'
                    else 'bf_'||p_entity end;
 loop
  insert into public.bf_code_counters(entity,last_value)
  values(p_entity,1)
  on conflict(entity) do update
   set last_value=public.bf_code_counters.last_value+1,updated_at=now()
  returning last_value into n;
  candidate:=p_prefix||'-'||case when length(n::text)>p_width then n::text else lpad(n::text,p_width,'0') end;
  -- The reserved namespace never reuses a previously issued code.
  if exists(select 1 from public.bf_code_registry where entity=p_entity and code=candidate) then
   continue;
  end if;
  -- Existing data may contain manually issued codes not yet in the registry.
  -- All tables have an entity-specific lookup; no user-supplied SQL identifiers.
  execute format('select exists(select 1 from public.%I where %I=$1)',target_table,
     case when p_entity='assets' then 'asset_tag' else 'code' end)
   into occupied using candidate;
  if occupied then continue;end if;
  return candidate;
 end loop;
end $$;

create or replace function public.bf32_assign_code()
returns trigger language plpgsql security definer set search_path=''
as $$
declare entity text; prefix text; width integer; reference text; old_reference text;
begin
 entity:=case tg_table_name
  when 'bf_asset_categories' then 'categories'
  when 'bf_assets' then 'assets'
  else substring(tg_table_name from 4) end;
 prefix:=case entity
  when 'organizations' then 'ORG' when 'clients' then 'CL'
  when 'sites' then 'SITE' when 'buildings' then 'BLD'
  when 'floors' then 'FL' when 'zones' then 'ZN'
  when 'rooms' then 'RM' when 'categories' then 'CAT'
  when 'assets' then 'AST' end;
 width:=case when entity='assets' then 6 else 4 end;
 if prefix is null then raise exception 'Unsupported code entity';end if;
 if tg_op='UPDATE' then
  old_reference:=case when entity='assets' then to_jsonb(old)->>'asset_tag' else to_jsonb(old)->>'code' end;
  reference:=case when entity='assets' then to_jsonb(new)->>'asset_tag' else to_jsonb(new)->>'code' end;
  if reference is distinct from old_reference then
   raise exception 'Reference code is immutable';
  end if;
  return new;
 end if;
 -- For every new row, discard client-supplied codes and allocate on the server.
 reference:=public.bf32_allocate_code(entity,prefix,width);
 new:=jsonb_populate_record(new,jsonb_build_object(case when entity='assets' then 'asset_tag' else 'code' end,reference));
 insert into public.bf_code_registry(entity,code,record_id,issued)
 values(entity,reference,new.id,true);
 return new;
end $$;

-- Existing values remain untouched. Record them before enabling new allocation.
do $$
declare x record;
begin
 for x in select * from (values
  ('organizations','bf_organizations','code'),
  ('clients','bf_clients','code'),
  ('sites','bf_sites','code'),
  ('buildings','bf_buildings','code'),
  ('floors','bf_floors','code'),
  ('zones','bf_zones','code'),
  ('rooms','bf_rooms','code'),
  ('categories','bf_asset_categories','code'),
  ('assets','bf_assets','asset_tag')
 ) v(entity,table_name,column_name) loop
  execute format(
   'insert into public.bf_code_registry(entity,code,record_id) select $1,%I,id from public.%I where %I is not null and btrim(%I)<>'''' on conflict(entity,record_id) do nothing',
   x.column_name,x.table_name,x.column_name,x.column_name
  ) using x.entity;
 end loop;
end $$;

-- Locate missing legacy references without altering existing non-empty codes.
-- The same allocator is used for the backfill and normal inserts.
do $$
declare x record; r record; new_code text; prefix text; width integer;
begin
 for x in select * from (values
  ('organizations','bf_organizations','code','ORG',4),
  ('clients','bf_clients','code','CL',4),
  ('sites','bf_sites','code','SITE',4),
  ('buildings','bf_buildings','code','BLD',4),
  ('floors','bf_floors','code','FL',4),
  ('zones','bf_zones','code','ZN',4),
  ('rooms','bf_rooms','code','RM',4),
  ('categories','bf_asset_categories','code','CAT',4),
  ('assets','bf_assets','asset_tag','AST',6)
 ) v(entity,table_name,column_name,prefix,width) loop
  for r in execute format('select id from public.%I where %I is null or btrim(%I)='''' order by id',x.table_name,x.column_name,x.column_name)
  loop
   new_code:=public.bf32_allocate_code(x.entity,x.prefix,x.width);
   execute format('update public.%I set %I=$1 where id=$2',x.table_name,x.column_name)
     using new_code,r.id;
   insert into public.bf_code_registry(entity,code,record_id,issued)
     values(x.entity,new_code,r.id,true);
  end loop;
 end loop;
end $$;


-- Preserve legacy codes even when two tenants used the same reference.
-- Generated codes are globally unique through the serialized counter and registry.
-- A partial uniqueness guard prevents two newly issued references from colliding.
create unique index bf32_issued_code_unique
 on public.bf_code_registry(entity,code) where issued=true;

do $$
declare x record;
begin
 for x in select * from (values
  ('bf_organizations'),('bf_clients'),('bf_sites'),('bf_buildings'),
  ('bf_floors'),('bf_zones'),('bf_rooms'),('bf_asset_categories'),('bf_assets')
 ) v(table_name) loop
  execute format('drop trigger if exists bf32_auto_code on public.%I',x.table_name);
  execute format('create trigger bf32_auto_code before insert or update on public.%I for each row execute function public.bf32_assign_code()',x.table_name);
 end loop;
end $$;

revoke all on function public.bf32_allocate_code(text,text,integer) from public,anon,authenticated;
revoke all on function public.bf32_assign_code() from public,anon,authenticated;
-- Existing RPC clients cannot change or invent an asset reference.
-- Preserve the existing authorization, tenant guard, cost handling and validation.
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
 v:=jsonb_populate_record(old,p_payload - array['id','created_at','created_by','updated_at','updated_by','asset_tag']);
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

revoke all on function public.bf3_save_asset(uuid,jsonb) from public,anon;
grant execute on function public.bf3_save_asset(uuid,jsonb) to authenticated;

insert into public.bf_migrations(version) values(32);
commit;
