-- Basmat Medical CMMS - CLEAN CORE REBUILD V2
-- Owner -> Maintenance Company -> Consultant -> Project -> Site -> Building -> Floor -> Zone -> Room -> Team
-- New core is isolated from obsolete membership/client/location dependencies.
begin;

create table if not exists public.bf_med2_projects(
 id uuid primary key default gen_random_uuid(),
 owner_org_id uuid not null references public.bf_organizations(id),
 maintenance_org_id uuid not null references public.bf_organizations(id),
 consultant_org_id uuid null references public.bf_organizations(id),
 name text not null check(length(btrim(name))>=2),
 status text not null default 'active' check(status in('active','closed','archived')),
 start_date date,
 end_date date,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.bf_med2_sites(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bf_med2_projects(id) on delete cascade,
 name text not null,
 city text,
 address text,
 latitude numeric,
 longitude numeric,
 status text not null default 'active' check(status in('active','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.bf_med2_locations(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bf_med2_projects(id) on delete cascade,
 site_id uuid not null references public.bf_med2_sites(id) on delete cascade,
 kind text not null check(kind in('building','floor','zone','room')),
 parent_id uuid null references public.bf_med2_locations(id) on delete cascade,
 name text not null,
 code text,
 level_no integer,
 status text not null default 'active' check(status in('active','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.bf_med2_project_users(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bf_med2_projects(id) on delete cascade,
 site_id uuid null references public.bf_med2_sites(id) on delete cascade,
 user_id uuid not null,
 role_id uuid not null,
 is_active boolean not null default true,
 assigned_by uuid not null,
 assigned_at timestamptz not null default now(),
 unique(project_id,user_id,role_id,site_id)
);

revoke all on public.bf_med2_projects,public.bf_med2_sites,public.bf_med2_locations,public.bf_med2_project_users from public,anon,authenticated;

create or replace function public.bf_med2_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(public.bf_acl_is_super_user(auth.uid()),false); $$;

create or replace function public.bf_med2_catalog()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if not public.bf_med2_admin() then raise exception 'Project setup administrator permission required' using errcode='42501'; end if;
 select jsonb_build_object(
  'organizations',coalesce((select jsonb_agg(to_jsonb(o) order by o.name) from public.bf_organizations o where o.status<>'archived'),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.bf_med2_projects p where p.status<>'archived'),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.bf_med2_sites s where s.status<>'archived'),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.bf_med2_locations l where l.status<>'archived'),'[]'::jsonb),
  'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email)) from public.bf_profiles p where p.status='active'),'[]'::jsonb),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'code',r.code,'organization_id',r.organization_id)) from public.bf_roles r),'[]'::jsonb)
 ) into v;
 return v;
end $$;

create or replace function public.bf_med2_save_organization(p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 if nullif(btrim(p_name),'') is null then raise exception 'Organization name required'; end if;
 select id into v from public.bf_organizations where lower(btrim(name))=lower(btrim(p_name)) and status<>'archived' limit 1;
 if v is null then
  insert into public.bf_organizations(name,status) values(btrim(p_name),'active') returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med2_save_project(
 p_id uuid,p_owner uuid,p_maintenance uuid,p_consultant uuid,p_name text,p_start date,p_end date
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_owner is null or p_maintenance is null or nullif(btrim(p_name),'') is null then raise exception 'Owner, maintenance company and project name are required'; end if;
 if p_start is not null and p_end is not null and p_end<p_start then raise exception 'Invalid project dates'; end if;
 if p_id is null then
  insert into public.bf_med2_projects(owner_org_id,maintenance_org_id,consultant_org_id,name,start_date,end_date,created_by)
  values(p_owner,p_maintenance,p_consultant,btrim(p_name),p_start,p_end,auth.uid()) returning id into v;
 else
  update public.bf_med2_projects set owner_org_id=p_owner,maintenance_org_id=p_maintenance,consultant_org_id=p_consultant,
   name=btrim(p_name),start_date=p_start,end_date=p_end,updated_at=now()
  where id=p_id returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med2_save_site(
 p_id uuid,p_project uuid,p_name text,p_city text,p_address text,p_lat numeric,p_lng numeric
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 if not exists(select 1 from public.bf_med2_projects where id=p_project and status='active') then raise exception 'Invalid project'; end if;
 if nullif(btrim(p_name),'') is null then raise exception 'Site name required'; end if;
 if p_id is null then
  insert into public.bf_med2_sites(project_id,name,city,address,latitude,longitude)
  values(p_project,btrim(p_name),nullif(btrim(coalesce(p_city,'')),''),nullif(btrim(coalesce(p_address,'')),''),p_lat,p_lng)
  returning id into v;
 else
  update public.bf_med2_sites set name=btrim(p_name),city=p_city,address=p_address,latitude=p_lat,longitude=p_lng,updated_at=now()
  where id=p_id and project_id=p_project returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med2_save_location(
 p_kind text,p_id uuid,p_project uuid,p_site uuid,p_parent uuid,p_name text,p_code text,p_level_no integer
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid; pkind text;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_kind not in('building','floor','zone','room') then raise exception 'Invalid location type'; end if;
 if not exists(select 1 from public.bf_med2_sites where id=p_site and project_id=p_project and status='active') then raise exception 'Invalid site'; end if;
 if nullif(btrim(p_name),'') is null then raise exception 'Name required'; end if;

 if p_kind='building' then
  if p_parent is not null then raise exception 'Building cannot have a parent location'; end if;
 else
  select kind into pkind from public.bf_med2_locations where id=p_parent and project_id=p_project and site_id=p_site and status='active';
  if (p_kind='floor' and pkind<>'building') or (p_kind='zone' and pkind<>'floor') or (p_kind='room' and pkind<>'zone') then
   raise exception 'Invalid parent location';
  end if;
 end if;

 if p_id is null then
  insert into public.bf_med2_locations(project_id,site_id,kind,parent_id,name,code,level_no)
  values(p_project,p_site,p_kind,p_parent,btrim(p_name),nullif(btrim(coalesce(p_code,'')),''),p_level_no) returning id into v;
 else
  update public.bf_med2_locations set parent_id=p_parent,name=btrim(p_name),code=nullif(btrim(coalesce(p_code,'')),''),level_no=p_level_no,updated_at=now()
  where id=p_id and project_id=p_project and site_id=p_site and kind=p_kind returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med2_save_team_member(
 p_id uuid,p_project uuid,p_site uuid,p_user uuid,p_role uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 if not exists(select 1 from public.bf_med2_projects where id=p_project and status='active') then raise exception 'Invalid project'; end if;
 if p_site is not null and not exists(select 1 from public.bf_med2_sites where id=p_site and project_id=p_project and status='active') then raise exception 'Invalid site'; end if;
 if not exists(select 1 from public.bf_profiles where id=p_user and status='active') then raise exception 'Invalid user'; end if;
 if not exists(select 1 from public.bf_roles where id=p_role) then raise exception 'Invalid role'; end if;
 if p_id is null then
  insert into public.bf_med2_project_users(project_id,site_id,user_id,role_id,assigned_by)
  values(p_project,p_site,p_user,p_role,auth.uid())
  on conflict(project_id,user_id,role_id,site_id) do update set is_active=true,assigned_by=auth.uid(),assigned_at=now()
  returning id into v;
 else
  update public.bf_med2_project_users set site_id=p_site,user_id=p_user,role_id=p_role,is_active=true,assigned_by=auth.uid(),assigned_at=now()
  where id=p_id and project_id=p_project returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med2_project_get(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if not public.bf_med2_admin() then raise exception 'Permission denied' using errcode='42501'; end if;
 select jsonb_build_object(
  'project',(select to_jsonb(p) from public.bf_med2_projects p where p.id=p_project),
  'sites',coalesce((select jsonb_agg(to_jsonb(s)) from public.bf_med2_sites s where s.project_id=p_project and s.status<>'archived'),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(to_jsonb(l)) from public.bf_med2_locations l where l.project_id=p_project and l.status<>'archived'),'[]'::jsonb),
  'team',coalesce((select jsonb_agg(to_jsonb(t)) from public.bf_med2_project_users t where t.project_id=p_project and t.is_active),'[]'::jsonb)
 ) into v;
 return v;
end $$;

revoke all on function public.bf_med2_admin() from public,anon;
grant execute on function public.bf_med2_admin() to authenticated;
revoke all on function public.bf_med2_catalog() from public,anon;
grant execute on function public.bf_med2_catalog() to authenticated;
revoke all on function public.bf_med2_save_organization(text) from public,anon;
grant execute on function public.bf_med2_save_organization(text) to authenticated;
revoke all on function public.bf_med2_save_project(uuid,uuid,uuid,uuid,text,date,date) from public,anon;
grant execute on function public.bf_med2_save_project(uuid,uuid,uuid,uuid,text,date,date) to authenticated;
revoke all on function public.bf_med2_save_site(uuid,uuid,text,text,text,numeric,numeric) from public,anon;
grant execute on function public.bf_med2_save_site(uuid,uuid,text,text,text,numeric,numeric) to authenticated;
revoke all on function public.bf_med2_save_location(text,uuid,uuid,uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.bf_med2_save_location(text,uuid,uuid,uuid,uuid,text,text,integer) to authenticated;
revoke all on function public.bf_med2_save_team_member(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.bf_med2_save_team_member(uuid,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.bf_med2_project_get(uuid) from public,anon;
grant execute on function public.bf_med2_project_get(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
