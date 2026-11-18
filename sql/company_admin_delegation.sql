-- Explicit company-admin delegation. No user receives a new role; no global role template changes.
create or replace function public.bf_company_is_admin(p_org uuid,p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.bf_profiles where id=p_user and status='active')
 and exists(select 1 from public.bf_organizations where id=p_org and status='active')
 and exists(select 1 from public.bf_acl_user_organizations where user_id=p_user and organization_id=p_org and is_active)
 and exists(select 1 from public.bf_acl_user_roles ur join public.bf_acl_roles r on r.id=ur.role_id
 where ur.user_id=p_user and ur.organization_id=p_org and ur.is_active and r.is_active and r.role_code='org_admin'
 and (r.organization_id is null or r.organization_id=p_org)
 and (ur.valid_from is null or ur.valid_from<=current_date) and (ur.valid_until is null or ur.valid_until>=current_date))
 and exists(select 1 from public.bf_acl_organization_permissions where organization_id=p_org and permission_key='users.manage' and is_allowed);
$$;
create or replace function public.bf_company_can_assign_role(p_org uuid,p_role uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bf_profiles where id=auth.uid() and status='active')
 and exists(select 1 from public.bf_acl_roles r where r.id=p_role and r.is_active and (r.organization_id is null or r.organization_id=p_org)
 and (public.bf_is_super_admin() or (
 r.role_code not in('super_admin','platform_admin','org_admin','client_admin','client_user','owner_rep','owner_representative','consultant')
 and not exists(select 1 from public.bf_acl_role_permissions rp where rp.role_id=r.id and rp.is_allowed
 and (rp.permission_key='*' or rp.permission_key in('users.manage','roles.manage','access.manage','security.manage','organizations.manage','organization.manage','enterprise-access.manage') or rp.permission_key like 'platform.%')))));
$$;
create or replace function public.bf_company_admin_access(p_org uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('is_platform_admin',public.bf_is_super_admin(),'can_manage',auth.uid() is not null and exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') and (public.bf_is_super_admin() or public.bf_company_is_admin(p_org)),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.role_code,'name_ar',r.role_name_ar,'name_en',r.role_name_en) order by r.role_name_ar) from public.bf_acl_roles r where (public.bf_is_super_admin() or public.bf_company_is_admin(p_org)) and public.bf_company_can_assign_role(p_org,r.id)),'[]'::jsonb));
$$;
create or replace function public.bf_company_create_role(p_org uuid,p_name_ar text,p_name_en text)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=gen_random_uuid();begin
 if not coalesce(public.bf_is_super_admin() or public.bf_company_is_admin(p_org),false) or auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Company administrator required' using errcode='42501';end if;
 if length(btrim(coalesce(p_name_ar,''))) not between 2 and 100 or length(btrim(coalesce(p_name_en,''))) not between 2 and 100 then raise exception 'Role names are required';end if;
 insert into public.bf_acl_roles(id,organization_id,role_code,role_name_ar,role_name_en,module_code,is_system,is_active)
 values(rid,p_org,'company_'||replace(rid::text,'-',''),btrim(p_name_ar),btrim(p_name_en),'shared',false,true);
 insert into public.bf_org_admin_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'company_role_created',jsonb_build_object('role_id',rid));return rid;
end $$;
create or replace function public.bf_company_assign_project(p_user uuid,p_org uuid,p_project uuid,p_role uuid,p_site uuid default null,p_discipline text default null,p_valid_from date default null,p_valid_until date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid;begin
 if not coalesce(public.bf_is_super_admin() or public.bf_company_is_admin(p_org),false) or auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Company administrator required' using errcode='42501';end if;
 if not public.bf_company_can_assign_role(p_org,p_role) then raise exception 'Role cannot be delegated' using errcode='42501';end if;
 if not public.bf61_user_represents(p_user,p_org) then raise exception 'User must belong to this company' using errcode='42501';end if;
 aid:=public.bf62_assign_project_access(p_user,p_org,p_project,p_role,p_site,p_discipline,p_valid_from,p_valid_until);
 perform public.bf_acl_set_user_role(p_org,p_user,p_role,true);
 perform public.bf_acl_set_user_project(p_org,p_user,p_project,'shared',p_site,p_discipline,true);
 update public.bf_acl_user_projects set valid_from=p_valid_from,valid_until=p_valid_until where user_id=p_user and organization_id=p_org and project_id=p_project and site_id is not distinct from p_site and coalesce(discipline_code,'')=coalesce(p_discipline,'');
 insert into public.bf_org_admin_audit(organization_id,actor_id,target_user_id,action,details) values(p_org,auth.uid(),p_user,'project_assigned',jsonb_build_object('project_id',p_project,'assignment_id',aid,'role_id',p_role));return aid;
end $$;
create or replace function public.bf_company_project_directory(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.bf_is_super_admin() or public.bf_company_is_admin(p_org),false) or auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Company administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.project_name,x.user_name) from (
 select a.id,a.user_id,u.full_name user_name,u.email user_email,a.organization_id,a.project_id,p.project_code,p.name project_name,a.site_id,s.name site_name,a.discipline_code,a.is_active,a.valid_from,a.valid_until,'scoped' source,
 jsonb_build_array(jsonb_build_object('id',r.id,'name',r.role_name_en,'name_ar',r.role_name_ar,'code',r.role_code)) roles
 from public.bf62_project_assignments a join public.bf35_projects p on p.id=a.project_id and p.organization_id=a.organization_id join public.bf_profiles u on u.id=a.user_id join public.bf_acl_roles r on r.id=a.role_id left join public.bf_sites s on s.id=a.site_id where a.organization_id=p_org
 union all
 select a.id,a.user_id,u.full_name,u.email,a.organization_id,a.project_id,p.project_code,p.name,a.site_id,s.name,a.discipline_code,a.is_active,a.valid_from,a.valid_until,'canonical','[]'::jsonb
 from public.bf_acl_user_projects a join public.bf35_projects p on p.id=a.project_id and p.organization_id=a.organization_id join public.bf_profiles u on u.id=a.user_id left join public.bf_sites s on s.id=a.site_id where a.organization_id=p_org and not exists(select 1 from public.bf62_project_assignments b where b.user_id=a.user_id and b.organization_id=a.organization_id and b.project_id=a.project_id and b.site_id is not distinct from a.site_id and coalesce(b.discipline_code,'')=coalesce(a.discipline_code,''))
 )x),'[]'::jsonb);
end $$;
create or replace function public.bf_company_set_project_active(p_assignment uuid,p_active boolean,p_source text default 'scoped')
returns void language plpgsql security definer set search_path='' as $$
declare a record;enabled boolean;begin
 if p_source='scoped' then select user_id,organization_id,project_id,site_id,discipline_code,role_id into a from public.bf62_project_assignments where id=p_assignment for update;
 elsif p_source='canonical' then select user_id,organization_id,project_id,site_id,discipline_code,null::uuid role_id into a from public.bf_acl_user_projects where id=p_assignment for update;
 else raise exception 'Invalid assignment source';end if;
 if a is null then raise exception 'Assignment not found';end if;
 if not coalesce(public.bf_is_super_admin() or public.bf_company_is_admin(a.organization_id),false) or auth.uid() is null then raise exception 'Company administrator required' using errcode='42501';end if;
 if p_active and not public.bf61_user_represents(a.user_id,a.organization_id) then raise exception 'Active company membership required' using errcode='42501';end if;
 if p_active and a.role_id is not null and not public.bf_company_can_assign_role(a.organization_id,a.role_id) then raise exception 'Role cannot be delegated' using errcode='42501';end if;
 if p_source='scoped' then perform public.bf62_set_project_assignment_active(p_assignment,p_active);
 select exists(select 1 from public.bf62_project_assignments b where b.user_id=a.user_id and b.organization_id=a.organization_id and b.project_id=a.project_id and b.site_id is not distinct from a.site_id and coalesce(b.discipline_code,'')=coalesce(a.discipline_code,'') and b.is_active) into enabled;
 else enabled:=p_active;end if;
 perform public.bf_acl_set_user_project(a.organization_id,a.user_id,a.project_id,'shared',a.site_id,a.discipline_code,enabled);
 insert into public.bf_org_admin_audit(organization_id,actor_id,target_user_id,action,details) values(a.organization_id,auth.uid(),a.user_id,'project_access_changed',jsonb_build_object('assignment_id',p_assignment,'active',p_active));
end $$;
revoke all on function public.bf_company_is_admin(uuid,uuid),public.bf_company_can_assign_role(uuid,uuid),public.bf_company_admin_access(uuid),public.bf_company_create_role(uuid,text,text),public.bf_company_assign_project(uuid,uuid,uuid,uuid,uuid,text,date,date),public.bf_company_project_directory(uuid),public.bf_company_set_project_active(uuid,boolean,text) from public,anon;
grant execute on function public.bf_company_is_admin(uuid,uuid),public.bf_company_can_assign_role(uuid,uuid),public.bf_company_admin_access(uuid),public.bf_company_create_role(uuid,text,text),public.bf_company_assign_project(uuid,uuid,uuid,uuid,uuid,text,date,date),public.bf_company_project_directory(uuid),public.bf_company_set_project_active(uuid,boolean,text) to authenticated,service_role;
-- Enable only administrative entitlements already present on the existing org_admin template.
insert into public.bf_acl_organization_permissions(organization_id,permission_key,is_allowed)
select o.id,p.permission_key,true from public.bf_organizations o cross join public.bf_acl_permissions p where o.code='ORG-0001' and o.name='شركة بصمة النوابغ' and p.is_active and p.permission_key in('users.view','users.manage','roles.view','roles.manage','access.view','access.manage')
on conflict(organization_id,permission_key) do update set is_allowed=true;

CREATE OR REPLACE FUNCTION public.bf3_assign_role(p_user uuid, p_org uuid, p_role uuid, p_client uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.bf_acl_roles;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_company_can_assign_role(p_org,p_role) then raise exception 'Role cannot be delegated' using errcode='42501';end if;

  if not public.bf_can(
       p_org,
       'users.manage'
     )
     and not public.bf_is_super_admin()
  then
    raise exception 'Permission denied'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf_profiles
    where id=p_user
      and status='active'
  )
  then
    raise exception 'Active user required';
  end if;

  if not exists(
    select 1
    from public.bf_acl_user_organizations uo
    where uo.user_id=p_user
      and uo.organization_id=p_org
      and uo.is_active=true
  )
  then
    raise exception
      'Assign the user to this organization before assigning roles.'
      using errcode='23514';
  end if;

  select *
  into r
  from public.bf_acl_roles
  where id=p_role
    and is_active=true
    and (
      organization_id is null
      or organization_id=p_org
    );

  if not found then
    raise exception 'Invalid role';
  end if;

  if r.role_code='org_admin'
     and not public.bf_is_super_admin()
  then
    raise exception 'Platform administrator required';
  end if;

  if p_client is not null then

    if not exists(
      select 1
      from public.bf_acl_user_projects up
      join public.bf35_projects p
        on p.id=up.project_id
       and p.organization_id=up.organization_id
      where up.user_id=p_user
        and up.organization_id=p_org
        and up.is_active=true
        and p.client_id=p_client
    )
    then
      raise exception
        'Assign project access for this client before assigning the client role.'
        using errcode='23514';
    end if;

  end if;

  insert into public.bf_acl_user_roles(
    user_id,
    organization_id,
    role_id,
    is_active,
    assigned_by,
    assigned_at
  )
  select
    p_user,
    p_org,
    p_role,
    true,
    auth.uid(),
    now()
  where not exists(
    select 1
    from public.bf_acl_user_roles x
    where x.user_id=p_user
      and x.organization_id=p_org
      and x.role_id=p_role
  );

end;
$function$;

CREATE OR REPLACE FUNCTION public.bf_acl_set_user_role(p_org uuid, p_user uuid, p_role uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_company_can_assign_role(p_org,p_role) then raise exception 'Role cannot be delegated' using errcode='42501';end if;
 if not public.bf_acl_can_manage_org(p_org) then
  raise exception 'Permission denied' using errcode='42501';
 end if;

 if not exists(
   select 1 from public.bf_acl_user_organizations
   where user_id=p_user and organization_id=p_org and is_active=true
 ) then
   raise exception 'User is not active in this organization';
 end if;

 if not exists(
   select 1 from public.bf_acl_roles
   where id=p_role and is_active=true and (organization_id is null or organization_id=p_org)
 ) then
   raise exception 'Invalid role';
 end if;

 if p_enabled then
   insert into public.bf_acl_user_roles(
     user_id,organization_id,role_id,is_active,assigned_by,assigned_at
   )
   values(p_user,p_org,p_role,true,auth.uid(),now())
   on conflict (user_id,organization_id,role_id)
   do update set is_active=true,assigned_by=auth.uid(),assigned_at=now();
 else
   update public.bf_acl_user_roles
   set is_active=false
   where user_id=p_user and organization_id=p_org and role_id=p_role;
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bf61_remove_user_role(p_user uuid, p_org uuid, p_role uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_company_can_assign_role(p_org,p_role) then raise exception 'Role cannot be delegated' using errcode='42501';end if;
 if not (public.bf_is_super_admin() or public.bf_can(p_org,'users.manage')) then
  raise exception 'User management permission required' using errcode='42501';
 end if;

 if not public.bf61_user_represents(p_user,p_org) then
  raise exception 'User does not represent this organization';
 end if;

 delete from public.bf_user_roles
 where user_id=p_user and organization_id=p_org and role_id=p_role;
end $function$;

CREATE OR REPLACE FUNCTION public.bf62_assign_project_access(p_user uuid, p_org uuid, p_project uuid, p_role uuid, p_site uuid DEFAULT NULL::uuid, p_discipline text DEFAULT NULL::text, p_valid_from date DEFAULT NULL::date, p_valid_until date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 proj public.bf35_projects;
 rid uuid;
 scope_ids uuid[]:='{}'::uuid[];
 sid uuid;
 scope_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_company_can_assign_role(p_org,p_role) then raise exception 'Role cannot be delegated' using errcode='42501';end if;
 if not public.bf62_can_manage(p_org)
 then raise exception 'Project access management permission required' using errcode='42501'; end if;

 if not public.bf61_user_represents(p_user,p_org)
 then raise exception 'User must actively represent this organization'; end if;

 select * into proj
 from public.bf35_projects
 where id=p_project and organization_id=p_org and status<>'closed';
 if not found then raise exception 'Invalid project'; end if;

 if not exists(
  select 1 from public.bf_roles r
  where r.id=p_role and (r.organization_id is null or r.organization_id=p_org)
    and r.code not in('client_admin','client_user')
 ) then raise exception 'Invalid project role'; end if;

 if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from
 then raise exception 'Invalid validity period'; end if;

 if p_site is not null and not exists(
  select 1 from public.bf35_project_sites ps
  where ps.project_id=p_project and ps.site_id=p_site and ps.organization_id=p_org
 ) then raise exception 'Site is not linked to this project'; end if;

 -- Create the project assignment first.
 insert into public.bf62_project_assignments(
  user_id,organization_id,project_id,role_id,site_id,discipline_code,
  is_active,valid_from,valid_until,assigned_by
 ) values(
  p_user,p_org,p_project,p_role,p_site,nullif(btrim(coalesce(p_discipline,'')),''),
  true,p_valid_from,p_valid_until,auth.uid()
 )
 on conflict(
  user_id,organization_id,project_id,role_id,
  (coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  (coalesce(discipline_code,''))
 ) do update set
  is_active=true,
  valid_from=excluded.valid_from,
  valid_until=excluded.valid_until,
  assigned_by=excluded.assigned_by,
  assigned_at=now(),
  updated_at=now()
 returning id into rid;

 -- Deactivate any previously linked scopes before rebuilding them.
 for scope_id in
  select unnest(access_scope_ids)
  from public.bf62_project_assignments
  where id=rid
 loop
  perform public.bf34_set_scope_active(scope_id,false);
 end loop;

 if p_site is not null then
  scope_id:=public.bf34_assign_scope(
   p_user,p_org,p_role,'site',proj.client_id,null,p_site,null,p_valid_from,p_valid_until
  );
  scope_ids:=array_append(scope_ids,scope_id);
 else
  for sid in
   select ps.site_id
   from public.bf35_project_sites ps
   where ps.project_id=p_project and ps.organization_id=p_org
  loop
   scope_id:=public.bf34_assign_scope(
    p_user,p_org,p_role,'site',proj.client_id,null,sid,null,p_valid_from,p_valid_until
   );
   scope_ids:=array_append(scope_ids,scope_id);
  end loop;
 end if;

 update public.bf62_project_assignments
 set access_scope_ids=scope_ids,updated_at=now()
 where id=rid;

 return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.bf61_set_user_organization(p_user uuid, p_org uuid, p_transfer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_is_super_admin() and (not public.bf_company_is_admin(p_org) or p_transfer or exists(select 1 from public.bf_acl_user_organizations where user_id=p_user and organization_id<>p_org)) then raise exception 'Cross-company transfer is not permitted' using errcode='42501';end if;

  if auth.uid() is null then
    raise exception 'Authentication required'
    using errcode='42501';
  end if;

  if not (
    public.bf_acl_is_super_user()
    or public.bf_acl_has_permission(
      public.bf_acl_home_org(),
      'users.manage'
    )
  ) then
    raise exception 'User management permission required'
    using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.bf_profiles
    where id=p_user
      and status='active'
  ) then
    raise exception 'Active user required';
  end if;

  if not exists (
    select 1
    from public.bf_organizations
    where id=p_org
      and status='active'
  ) then
    raise exception 'Active organization required';
  end if;

  insert into public.bf_acl_user_organizations(
    user_id,
    organization_id,
    is_active,
    assigned_by,
    assigned_at,
    updated_at
  )
  values(
    p_user,
    p_org,
    true,
    auth.uid(),
    now(),
    now()
  )
  on conflict(user_id)
  do update set
    organization_id=excluded.organization_id,
    is_active=true,
    assigned_by=auth.uid(),
    assigned_at=now(),
    updated_at=now();

end;
$function$;

CREATE OR REPLACE FUNCTION public.bf_acl_set_user_project(p_org uuid, p_user uuid, p_project uuid, p_module text, p_site uuid DEFAULT NULL::uuid, p_discipline text DEFAULT NULL::text, p_enabled boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;
 if not public.bf_is_super_admin() and not public.bf61_user_represents(p_user,p_org) then raise exception 'User must belong to this company' using errcode='42501';end if; if p_site is not null and not exists(select 1 from public.bf35_project_sites where project_id=p_project and organization_id=p_org and site_id=p_site) then raise exception 'Site is not linked to this project';end if;
 if not public.bf_acl_can_manage_org(p_org) then
  raise exception 'Permission denied' using errcode='42501';
 end if;

 if not exists(
   select 1 from public.bf35_projects
   where id=p_project and organization_id=p_org and status<>'archived'
 ) then
   raise exception 'Invalid project';
 end if;

 if p_enabled then
   if exists(
     select 1 from public.bf_acl_user_projects
     where user_id=p_user and organization_id=p_org and project_id=p_project
       and coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)
           =coalesce(p_site,'00000000-0000-0000-0000-000000000000'::uuid)
       and coalesce(discipline_code,'')=coalesce(p_discipline,'')
   ) then
     update public.bf_acl_user_projects
     set is_active=true,
         module_code=coalesce(nullif(p_module,''),'shared'),
         assigned_by=auth.uid(),
         assigned_at=now()
     where user_id=p_user and organization_id=p_org and project_id=p_project
       and coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)
           =coalesce(p_site,'00000000-0000-0000-0000-000000000000'::uuid)
       and coalesce(discipline_code,'')=coalesce(p_discipline,'');
   else
     insert into public.bf_acl_user_projects(
       id,user_id,organization_id,project_id,module_code,site_id,discipline_code,
       is_active,assigned_by,assigned_at
     )
     values(
       gen_random_uuid(),p_user,p_org,p_project,
       coalesce(nullif(p_module,''),'shared'),
       p_site,nullif(p_discipline,''),true,auth.uid(),now()
     );
   end if;
 else
   update public.bf_acl_user_projects
   set is_active=false
   where user_id=p_user and organization_id=p_org and project_id=p_project
     and coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)
         =coalesce(p_site,'00000000-0000-0000-0000-000000000000'::uuid)
     and coalesce(discipline_code,'')=coalesce(p_discipline,'');
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bf61_users_directory(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_super boolean := false;
  v_target uuid := p_org;
  v_actor_org uuid;
  v_allowed boolean := false;
  v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;


  if v_uid is null then
    raise exception 'Authentication required'
      using errcode='42501';
  end if;

  -- المصدر الموحد
  v_super := public.bf_is_super_admin();

  if not v_super then

    select uo.organization_id
    into v_actor_org
    from public.bf_acl_user_organizations uo
    where uo.user_id = v_uid
      and coalesce(uo.is_active,true)
    order by uo.organization_id
    limit 1;

    if v_actor_org is null then
      raise exception 'No organization is assigned to this user'
        using errcode='42501';
    end if;

    if v_target is not null
       and v_target <> v_actor_org then
      raise exception 'Cross-organization directory access denied'
        using errcode='42501';
    end if;

    v_target := v_actor_org;

    select exists(
      select 1
      from public.bf_acl_user_roles ur
      join public.bf_acl_role_permissions rp
        on rp.role_id = ur.role_id
      where ur.user_id = v_uid
        and ur.organization_id = v_target
        and coalesce(ur.is_active,true)
        and rp.is_allowed = true
        and rp.permission_key in (
          'users.view',
          'users.manage',
          'access.view',
          'access.manage'
        )
    )
    into v_allowed;

    if not v_allowed then
      raise exception 'User directory permission required'
        using errcode='42501';
    end if;

  end if;

  select jsonb_build_object(

    'organizations',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',o.id,
          'name',o.name,
          'name_ar',o.name_ar,
          'name_en',o.name_en,
          'code',o.code,
          'organization_type',o.organization_type,
          'status',o.status
        )
        order by o.name
      )
      from public.bf_organizations o
      where o.status='active'
        and (
          v_target is null
          or o.id=v_target
        )
    ),'[]'::jsonb),

    'roles',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',r.id,
          'name',r.role_name_ar,
          'name_ar',r.role_name_ar,'name_en',r.role_name_en,
          'code',r.role_code,
          'role_code',r.role_code,
          'organization_id',r.organization_id,
          'is_system',true
        )
        order by r.role_code
      )
      from public.bf_acl_roles r where r.is_active and (r.organization_id is null or r.organization_id=v_target) and (v_target is null and v_super or public.bf_company_can_assign_role(v_target,r.id))
    ),'[]'::jsonb),

    'users',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'full_name',p.full_name,
          'email',p.email,
          'status',p.status,

          'organization_id',uo.organization_id,
          'organization_name',o.name,
          'organization_code',o.code,

          'roles',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',r2.id,
                'name',r2.role_code,
                'code',r2.role_code,
                'role_code',r2.role_code
              )
              order by r2.role_code
            )
            from public.bf_acl_user_roles ur2
            join public.bf_acl_roles r2
              on r2.id = ur2.role_id
            where ur2.user_id = p.id
              and ur2.organization_id = uo.organization_id
              and coalesce(ur2.is_active,true)
          ),'[]'::jsonb)

        )
        order by
          coalesce(o.name,''),
          coalesce(p.full_name,p.email)
      )

      from public.bf_acl_user_organizations uo

      join public.bf_profiles p
        on p.id = uo.user_id

      join public.bf_organizations o
        on o.id = uo.organization_id

      where coalesce(uo.is_active,true)
        and p.status <> 'archived'
        and (
          v_target is null
          or uo.organization_id = v_target
        )

    ),'[]'::jsonb),

    'conflicts',
    '[]'::jsonb

  )
  into v_result;

  return v_result;

end;
$function$;

create or replace function public.bf34_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.bf_is_super_admin() or public.bf_company_is_admin(p_org) or public.bf4_staff(p_org,'enterprise-access.manage');$$;
CREATE OR REPLACE FUNCTION public.bf_acl_set_role_permission(p_role uuid, p_permission text, p_allowed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Active authenticated user required' using errcode='42501';end if;

 if not public.bf_is_super_admin() and not exists(select 1 from public.bf_acl_roles r where r.id=p_role and r.organization_id is not null and not r.is_system and public.bf_company_is_admin(r.organization_id) and public.bf_company_can_assign_role(r.organization_id,r.id)) then
  raise exception 'Company-owned role required' using errcode='42501';
 end if;

 if not exists(select 1 from public.bf_acl_roles where id=p_role and is_active=true) then
  raise exception 'Invalid role';
 end if;

 if not exists(select 1 from public.bf_acl_permissions where permission_key=p_permission and is_active=true) then
  raise exception 'Invalid permission';
 end if;

 if not public.bf_is_super_admin() and (p_permission='*' or p_permission in('users.manage','roles.manage','access.manage','security.manage','organizations.manage','organization.manage','enterprise-access.manage') or p_permission like 'platform.%' or not exists(select 1 from public.bf_acl_roles r join public.bf_acl_organization_permissions op on op.organization_id=r.organization_id where r.id=p_role and op.permission_key=p_permission and op.is_allowed)) then raise exception 'Permission cannot be delegated' using errcode='42501';end if;
 insert into public.bf_acl_role_permissions(role_id,permission_key,is_allowed)
 values(p_role,p_permission,p_allowed)
 on conflict (role_id,permission_key)
 do update set is_allowed=excluded.is_allowed;
end;
$function$;
