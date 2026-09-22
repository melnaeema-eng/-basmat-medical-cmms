-- Basmat Facilities CMMS
-- Sprint 39 Hotfix — secure directory for Access Review
-- Root cause: bf_user_roles is empty, so bf4_staff_directory returns no users.
-- Also avoids relying on direct browser SELECT from bf_roles.

begin;

create or replace function public.bf39_directory(p_org uuid)
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
   'users',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',p.id,
       'full_name',p.full_name,
       'email',p.email,
       'status',p.status
     ) order by p.full_name,p.email)
     from public.bf_profiles p
     where p.status='active'
   ),'[]'::jsonb),
   'roles',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',r.id,
       'name',r.name,
       'code',r.code,
       'organization_id',r.organization_id,
       'is_system',r.is_system
     ) order by r.name)
     from public.bf_roles r
     where r.organization_id is null or r.organization_id=p_org
   ),'[]'::jsonb),
   'scopes',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',s.id,
       'user_id',s.user_id,
       'user_name',p.full_name,
       'role_id',s.role_id,
       'role_code',r.code,
       'scope_level',s.scope_level,
       'client_id',s.client_id,
       'contract_id',s.contract_id,
       'site_id',s.site_id,
       'discipline_code',s.discipline_code,
       'is_active',s.is_active,
       'valid_from',s.valid_from,
       'valid_until',s.valid_until
     ) order by p.full_name,r.name)
     from public.bf34_access_scopes s
     join public.bf_profiles p on p.id=s.user_id
     join public.bf_roles r on r.id=s.role_id
     where s.organization_id=p_org
   ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf39_directory(uuid) from public,anon;
grant execute on function public.bf39_directory(uuid) to authenticated;

commit;
