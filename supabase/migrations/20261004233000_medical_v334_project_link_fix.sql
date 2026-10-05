
begin;

-- MEDICAL V3.3.4
-- Project create/link fix.
-- Does NOT use bf_tenant_memberships.
-- Uses the current canonical project table: bf35_projects.

create or replace function public.bf_med_create_project(
  p_org uuid,
  p_client uuid,
  p_name text,
  p_start date default null,
  p_end date default null,
  p_contract uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_code text;
  v_row public.bf35_projects%rowtype;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if nullif(btrim(p_name),'') is null then
    raise exception 'Project name required';
  end if;

  if not exists(
    select 1
    from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
      and c.tenant_id=p_org
      and c.status='active'
  ) then
    raise exception 'Owner/client is outside Medical tenant';
  end if;

  if p_contract is not null and not exists(
    select 1
    from public.bf_contracts c
    where c.id=p_contract
      and c.organization_id=p_org
      and c.client_id=p_client
  ) then
    raise exception 'Contract is outside Medical tenant';
  end if;

  v_code := 'MED-P-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.bf35_projects(
    organization_id,
    client_id,
    contract_id,
    project_code,
    name,
    start_date,
    end_date,
    status
  )
  values(
    p_org,
    p_client,
    p_contract,
    v_code,
    btrim(p_name),
    p_start,
    p_end,
    'active'
  )
  returning * into v_row;

  v_id := v_row.id;

  insert into public.bf_med_company_project_links(
    organization_id,
    project_id,
    client_id,
    status
  )
  values(
    p_org,
    v_id,
    p_client,
    'active'
  )
  on conflict(organization_id,project_id) do update
    set client_id=excluded.client_id,
        status='active';

  return jsonb_build_object(
    'id',v_id,
    'project_id',v_id,
    'project_code',v_row.project_code,
    'name',v_row.name,
    'organization_id',v_row.organization_id,
    'client_id',v_row.client_id,
    'contract_id',v_row.contract_id,
    'status',v_row.status
  );
end;
$$;

create or replace function public.bf_med_link_project(
  p_org uuid,
  p_client uuid,
  p_project uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
      and c.tenant_id=p_org
      and c.status='active'
  ) then
    raise exception 'Owner/client is outside Medical tenant';
  end if;

  if not exists(
    select 1
    from public.bf35_projects p
    where p.id=p_project
      and p.organization_id=p_org
      and p.client_id=p_client
      and p.status<>'closed'
  ) then
    raise exception 'Project is outside owner/company scope';
  end if;

  insert into public.bf_med_company_project_links(
    organization_id,
    project_id,
    client_id,
    status
  )
  values(
    p_org,
    p_project,
    p_client,
    'active'
  )
  on conflict(organization_id,project_id) do update
    set client_id=excluded.client_id,
        status='active';
end;
$$;

grant execute on function public.bf_med_create_project(uuid,uuid,text,date,date,uuid) to authenticated;
grant execute on function public.bf_med_link_project(uuid,uuid,uuid) to authenticated;

notify pgrst,'reload schema';

commit;
