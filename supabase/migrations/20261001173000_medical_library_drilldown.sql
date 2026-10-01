begin;

create or replace function public.bf_med_library_maintenance_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_templates jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_steps_source text := null;
  v_ok boolean := false;
  v_table text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select exists(
    select 1
    from public.bf_acl_user_roles ur
    join public.bf_acl_roles r on r.id=ur.role_id
    left join public.bf_acl_role_permissions rp on rp.role_id=r.id
    where ur.user_id=auth.uid()
      and coalesce(ur.is_active,true)
      and (
        r.role_code='super_admin'
        or (
          rp.is_allowed=true
          and rp.permission_key in(
            'medical.assets.view','medical.assets.manage',
            'medical.ppm.view','medical.ppm.manage'
          )
        )
      )
  ) into v_ok;

  if not v_ok then
    raise exception 'Medical library permission required' using errcode='42501';
  end if;

  if to_regclass('public.bf_med_master_pm_templates') is not null then
    execute
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.id),''[]''::jsonb)
       from public.bf_med_master_pm_templates t'
    into v_templates;
  end if;

  foreach v_table in array array[
    'bf_med_master_pm_steps',
    'bf_med_master_pm_template_steps',
    'bf_med_pm_template_steps',
    'bf_med_pm_steps',
    'bf_master_ppm_steps'
  ]
  loop
    if to_regclass('public.'||v_table) is not null then
      begin
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from public.%I s',
          v_table
        )
        into v_steps;
        v_steps_source:=v_table;
        exit;
      exception when others then
        v_steps:='[]'::jsonb;
        v_steps_source:=null;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'templates',coalesce(v_templates,'[]'::jsonb),
    'steps',coalesce(v_steps,'[]'::jsonb),
    'steps_source',v_steps_source
  );
end
$$;

revoke all on function public.bf_med_library_maintenance_catalog() from public,anon;
grant execute on function public.bf_med_library_maintenance_catalog() to authenticated;

notify pgrst,'reload schema';
commit;
