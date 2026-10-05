
begin;

-- ============================================================
-- MEDICAL V3.3.3 FINAL TENANT-ID FK FIX
-- bf_tenants.id MUST equal bf_organizations.id
-- ============================================================

create or replace function public.bf_med_ensure_company_tenant(
  p_library_company uuid,
  p_org uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lib public.bf_med_company_library%rowtype;
  v_display text;
  v_code text;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Super Admin required' using errcode='42501';
  end if;

  select * into v_lib
  from public.bf_med_company_library
  where id=p_library_company
    and status='active';

  if v_lib.id is null then
    raise exception 'Medical company library record not found';
  end if;

  if not exists(
    select 1 from public.bf_organizations o
    where o.id=p_org
  ) then
    raise exception 'Organization not found';
  end if;

  v_display := coalesce(
    nullif(trim(v_lib.name_ar),''),
    nullif(trim(v_lib.name_en),''),
    'Medical Maintenance Company'
  );

  v_code := 'MED-' || upper(substr(replace(p_org::text,'-',''),1,12));

  insert into public.bf_tenants(
    id,
    tenant_code,
    display_name,
    legal_name,
    email,
    phone,
    logo_url,
    plan_code,
    subscription_status,
    status,
    settings,
    created_by
  )
  values(
    p_org,
    v_code,
    v_display,
    coalesce(nullif(trim(v_lib.name_en),''),nullif(trim(v_lib.name_ar),'')),
    v_lib.email,
    v_lib.phone,
    v_lib.logo_url,
    'professional',
    'trial',
    'active',
    jsonb_build_object(
      'scope','medical',
      'source','medical_knowledge_library',
      'library_company_id',v_lib.id,
      'organization_id',p_org
    ),
    auth.uid()
  )
  on conflict(id) do update
  set tenant_code=excluded.tenant_code,
      display_name=excluded.display_name,
      legal_name=coalesce(excluded.legal_name,public.bf_tenants.legal_name),
      email=coalesce(excluded.email,public.bf_tenants.email),
      phone=coalesce(excluded.phone,public.bf_tenants.phone),
      logo_url=coalesce(excluded.logo_url,public.bf_tenants.logo_url),
      status='active',
      settings=coalesce(public.bf_tenants.settings,'{}'::jsonb)
        || jsonb_build_object(
          'scope','medical',
          'source','medical_knowledge_library',
          'library_company_id',v_lib.id,
          'organization_id',p_org
        ),
      updated_at=now();

  update public.bf_med_company_tenant_links
  set tenant_id=p_org,
      status='active'
  where library_company_id=p_library_company
    and organization_id=p_org;

  if not found then
    insert into public.bf_med_company_tenant_links(
      library_company_id,
      organization_id,
      tenant_id,
      status
    )
    values(
      p_library_company,
      p_org,
      p_org,
      'active'
    );
  end if;

  return p_org;
end;
$$;

create or replace function public.bf_med_tenant_for_org(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select case
    when exists(
      select 1
      from public.bf_tenants t
      where t.id=p_org
        and t.status='active'
    )
    then p_org
    else null::uuid
  end;
$$;

create or replace function public.bf_med_create_or_link_tenant_from_library(
  p_library_company uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lib public.bf_med_company_library%rowtype;
  v_org uuid;
  v_tenant uuid;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Super Admin required' using errcode='42501';
  end if;

  select * into v_lib
  from public.bf_med_company_library
  where id=p_library_company
    and status='active';

  if v_lib.id is null then
    raise exception 'Medical company library record not found';
  end if;

  select organization_id into v_org
  from public.bf_med_company_tenant_links
  where library_company_id=v_lib.id
    and status='active'
  order by created_at
  limit 1;

  if v_org is null then
    insert into public.bf_organizations(
      name,
      name_ar,
      name_en,
      organization_type,
      registration_no,
      vat_no,
      email,
      phone,
      city,
      address,
      logo_url,
      status
    )
    values(
      coalesce(v_lib.name_ar,v_lib.name_en),
      v_lib.name_ar,
      v_lib.name_en,
      'maintenance_contractor',
      v_lib.registration_no,
      v_lib.vat_no,
      v_lib.email,
      v_lib.phone,
      v_lib.city,
      v_lib.address,
      v_lib.logo_url,
      'active'
    )
    returning id into v_org;

    insert into public.bf_med_company_tenant_links(
      library_company_id,
      organization_id,
      status
    )
    values(
      v_lib.id,
      v_org,
      'active'
    )
    on conflict do nothing;
  else
    update public.bf_organizations
    set name=coalesce(v_lib.name_ar,v_lib.name_en,name),
        name_ar=coalesce(v_lib.name_ar,name_ar),
        name_en=coalesce(v_lib.name_en,name_en),
        registration_no=coalesce(v_lib.registration_no,registration_no),
        vat_no=coalesce(v_lib.vat_no,vat_no),
        email=coalesce(v_lib.email,email),
        phone=coalesce(v_lib.phone,phone),
        city=coalesce(v_lib.city,city),
        address=coalesce(v_lib.address,address),
        logo_url=coalesce(v_lib.logo_url,logo_url),
        status='active'
    where id=v_org;
  end if;

  v_tenant := public.bf_med_ensure_company_tenant(v_lib.id,v_org);

  return jsonb_build_object(
    'organization_id',v_org,
    'tenant_id',v_tenant,
    'library_company_id',v_lib.id,
    'name_ar',v_lib.name_ar,
    'name_en',v_lib.name_en,
    'logo_url',v_lib.logo_url
  );
end;
$$;

create or replace function public.bf_med_create_client(
  p_org uuid,
  p_name text,
  p_code text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_client public.bf_clients%rowtype;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'Client name required';
  end if;

  if not exists(
    select 1
    from public.bf_tenants t
    where t.id=p_org
      and t.status='active'
  ) then
    raise exception 'Medical tenant is not initialized for this organization';
  end if;

  insert into public.bf_clients(
    tenant_id,
    organization_id,
    name,
    code,
    email,
    phone,
    status
  )
  values(
    p_org,
    p_org,
    trim(p_name),
    nullif(trim(p_code),''),
    nullif(trim(p_email),''),
    nullif(trim(p_phone),''),
    'active'
  )
  returning * into v_client;

  insert into public.bf_med_company_client_links(
    organization_id,
    client_id,
    status
  )
  values(
    p_org,
    v_client.id,
    'active'
  )
  on conflict(organization_id,client_id) do update
    set status='active';

  return to_jsonb(v_client);
end;
$$;

grant execute on function public.bf_med_ensure_company_tenant(uuid,uuid) to authenticated;
grant execute on function public.bf_med_tenant_for_org(uuid) to authenticated;
grant execute on function public.bf_med_create_or_link_tenant_from_library(uuid) to authenticated;
grant execute on function public.bf_med_create_client(uuid,text,text,text,text) to authenticated;

notify pgrst,'reload schema';

commit;
