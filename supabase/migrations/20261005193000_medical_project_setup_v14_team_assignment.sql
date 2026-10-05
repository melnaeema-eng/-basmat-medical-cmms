-- Basmat Medical CMMS - Project Setup V1.4
-- Dedicated Project Setup team assignment.
-- Does not modify bf62_can_manage or global project-access permissions.

begin;

create or replace function public.bf_med_ps_assign_project_user(
  p_user uuid,
  p_org uuid,
  p_project uuid,
  p_role uuid,
  p_site uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Project setup administrator permission required' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf35_projects p
    where p.id=p_project
      and p.organization_id=p_org
      and p.status<>'closed'
  ) then
    raise exception 'Invalid project';
  end if;

  if not exists(
    select 1
    from public.bf_profiles p
    where p.id=p_user
      and p.status='active'
  ) then
    raise exception 'Invalid active user';
  end if;

  if not exists(
    select 1
    from public.bf_roles r
    where r.id=p_role
      and (r.organization_id is null or r.organization_id=p_org)
      and r.code not in('client_admin','client_user')
  ) then
    raise exception 'Invalid project role';
  end if;

  if p_site is not null and not exists(
    select 1
    from public.bf35_project_sites ps
    where ps.project_id=p_project
      and ps.organization_id=p_org
      and ps.site_id=p_site
  ) then
    raise exception 'Site is not linked to this project';
  end if;

  insert into public.bf62_project_assignments(
    user_id,
    organization_id,
    project_id,
    role_id,
    site_id,
    discipline_code,
    is_active,
    valid_from,
    valid_until,
    assigned_by
  )
  values(
    p_user,
    p_org,
    p_project,
    p_role,
    p_site,
    null,
    true,
    null,
    null,
    auth.uid()
  )
  on conflict(
    user_id,
    organization_id,
    project_id,
    role_id,
    (coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(discipline_code,''))
  )
  do update set
    is_active=true,
    assigned_by=excluded.assigned_by,
    assigned_at=now(),
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.bf_med_ps_assign_project_user(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.bf_med_ps_assign_project_user(uuid,uuid,uuid,uuid,uuid) to authenticated;

notify pgrst,'reload schema';

commit;
