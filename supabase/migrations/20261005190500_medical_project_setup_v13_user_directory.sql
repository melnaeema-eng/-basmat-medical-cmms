-- Basmat Medical CMMS - Project Setup V1.3
-- Fix Project Setup user dropdown only.

begin;

create or replace function public.bf_med_ps_user_directory(p_org uuid)
returns setof jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id',p.id,
    'user_id',p.id,
    'full_name',p.full_name,
    'email',p.email,
    'status',p.status,
    'organization_id',p_org
  )
  from public.bf_profiles p
  where p.status='active'
    and (
      exists(
        select 1
        from public.bf61_user_home_organizations h
        where h.user_id=p.id
          and h.organization_id=p_org
          and h.is_active
      )
      or exists(
        select 1
        from public.bf_user_roles ur
        where ur.user_id=p.id
          and ur.organization_id=p_org
      )
    )
    and (
      public.bf_acl_is_super_user(auth.uid())
      or public.bf62_can_manage(p_org)
    )
  order by coalesce(p.full_name,p.email),p.email;
$$;

revoke all on function public.bf_med_ps_user_directory(uuid) from public,anon;
grant execute on function public.bf_med_ps_user_directory(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
