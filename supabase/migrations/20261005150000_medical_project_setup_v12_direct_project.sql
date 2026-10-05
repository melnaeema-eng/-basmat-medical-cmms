-- Basmat Medical CMMS - Project Setup V1.2
-- Direct canonical project creation on bf35_projects.
-- Removes Project Setup dependency on bf36_create_project_auto / bf_tenant_memberships.
-- Adds latitude/longitude support to site creation.
-- Medical project only. No Facilities/PPM/WO/Inventory/Finance changes.

begin;

create or replace function public.bf_med_ps_create_project(
  p_org uuid,
  p_client uuid,
  p_contract uuid,
  p_name text,
  p_start date,
  p_end date
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Project setup administrator permission required' using errcode='42501';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated user required' using errcode='42501';
  end if;

  if p_org is null or not exists(
    select 1 from public.bf_organizations o
    where o.id=p_org and o.status<>'archived'
  ) then
    raise exception 'Invalid maintenance company';
  end if;

  if p_client is null or not exists(
    select 1 from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
      and c.tenant_id=p_org
      and c.status<>'archived'
  ) then
    raise exception 'Invalid owner/client for this maintenance company';
  end if;

  if p_contract is not null and not exists(
    select 1 from public.bf_contracts c
    where c.id=p_contract
      and c.organization_id=p_org
      and c.client_id=p_client
      and c.status<>'archived'
  ) then
    raise exception 'Invalid contract for this owner/client';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'Project name is required';
  end if;

  if p_start is not null and p_end is not null and p_end<p_start then
    raise exception 'Project end date cannot be before start date';
  end if;

  if not exists(select 1 from public.bf_tenants t where t.id=p_org) then
    raise exception 'Maintenance company tenant record is missing. Add/select the company from Project Setup first.';
  end if;

  v_code :=
    'MED-' ||
    to_char(clock_timestamp(),'YYYYMMDDHH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.bf35_projects(
    organization_id,
    tenant_id,
    client_id,
    contract_id,
    project_code,
    name,
    status,
    start_date,
    end_date,
    created_by
  )
  values(
    p_org,
    p_org,
    p_client,
    p_contract,
    v_code,
    trim(p_name),
    'active',
    p_start,
    p_end,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.bf_med_ps_create_project(uuid,uuid,uuid,text,date,date) from public,anon;
grant execute on function public.bf_med_ps_create_project(uuid,uuid,uuid,text,date,date) to authenticated;


create or replace function public.bf_med_ps_save_reference(
  p_kind text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_org uuid;
  v_client uuid;
  v_contract uuid;
  v_name text;
  v_row jsonb;
  v_lat numeric;
  v_lng numeric;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Project setup administrator permission required' using errcode='42501';
  end if;

  if p_kind='organization' then
    v_name=nullif(trim(p_data->>'name'),'');
    if v_name is null then raise exception 'Company name is required'; end if;

    select id into v_id
    from public.bf_organizations
    where lower(trim(name))=lower(v_name)
      and status<>'archived'
    limit 1;

    if v_id is null then
      insert into public.bf_organizations(name,status)
      values(v_name,'active')
      returning id into v_id;
    end if;

    if not exists(select 1 from public.bf_tenants where id=v_id) then
      insert into public.bf_tenants(
        id,tenant_code,display_name,legal_name,plan_code,subscription_status,status,settings
      )
      values(
        v_id,
        'MED-'||upper(substr(replace(v_id::text,'-',''),1,10)),
        v_name,
        v_name,
        'professional',
        'trial',
        'active',
        '{}'::jsonb
      );
    end if;

    select to_jsonb(o) into v_row
    from public.bf_organizations o
    where o.id=v_id;

    return v_row;

  elsif p_kind='client' then
    v_org=(p_data->>'organization_id')::uuid;
    v_name=nullif(trim(p_data->>'name'),'');

    if v_org is null or v_name is null then
      raise exception 'Organization and owner name are required';
    end if;

    if not exists(select 1 from public.bf_tenants where id=v_org) then
      raise exception 'Maintenance company tenant record is missing';
    end if;

    select id into v_id
    from public.bf_clients
    where organization_id=v_org
      and lower(trim(name))=lower(v_name)
      and status<>'archived'
    limit 1;

    if v_id is null then
      insert into public.bf_clients(
        tenant_id,organization_id,name,email,phone,status
      )
      values(
        v_org,v_org,v_name,
        nullif(p_data->>'email',''),
        nullif(p_data->>'phone',''),
        'active'
      )
      returning id into v_id;
    end if;

    select to_jsonb(c) into v_row
    from public.bf_clients c
    where c.id=v_id;

    return v_row;

  elsif p_kind='contract' then
    v_org=(p_data->>'organization_id')::uuid;
    v_client=(p_data->>'client_id')::uuid;

    if v_org is null or v_client is null then
      raise exception 'Organization and owner are required';
    end if;

    select public.bf_med_save_contract(
      null,
      v_org,
      v_client,
      nullif(p_data->>'contract_number',''),
      nullif(p_data->>'contract_type',''),
      nullif(p_data->>'start_date','')::date,
      nullif(p_data->>'end_date','')::date,
      nullif(p_data->>'contract_value','')::numeric,
      'active'
    )
    into v_row;

    return v_row;

  elsif p_kind='site' then
    v_org=(p_data->>'organization_id')::uuid;
    v_client=(p_data->>'client_id')::uuid;
    v_contract=nullif(p_data->>'contract_id','')::uuid;
    v_name=nullif(trim(p_data->>'name'),'');
    v_lat=nullif(p_data->>'latitude','')::numeric;
    v_lng=nullif(p_data->>'longitude','')::numeric;

    if v_org is null or v_client is null or v_name is null then
      raise exception 'Organization, owner and site name are required';
    end if;

    if v_lat is null or v_lng is null
       or v_lat not between -90 and 90
       or v_lng not between -180 and 180 then
      raise exception 'Active site requires valid latitude and longitude';
    end if;

    select id into v_id
    from public.bf_sites
    where organization_id=v_org
      and client_id=v_client
      and lower(trim(name))=lower(v_name)
      and status<>'archived'
    limit 1;

    if v_id is null then
      insert into public.bf_sites(
        organization_id,
        client_id,
        contract_id,
        name,
        city,
        address,
        latitude,
        longitude,
        status
      )
      values(
        v_org,
        v_client,
        v_contract,
        v_name,
        nullif(p_data->>'city',''),
        nullif(p_data->>'address',''),
        v_lat,
        v_lng,
        'active'
      )
      returning id into v_id;
    else
      update public.bf_sites
      set contract_id=coalesce(v_contract,contract_id),
          city=coalesce(nullif(p_data->>'city',''),city),
          address=coalesce(nullif(p_data->>'address',''),address),
          latitude=v_lat,
          longitude=v_lng,
          updated_at=now()
      where id=v_id;
    end if;

    select to_jsonb(s) into v_row
    from public.bf_sites s
    where s.id=v_id;

    return v_row;
  end if;

  raise exception 'Unsupported project setup reference type: %',p_kind;
end;
$$;

revoke all on function public.bf_med_ps_save_reference(text,jsonb) from public,anon;
grant execute on function public.bf_med_ps_save_reference(text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
