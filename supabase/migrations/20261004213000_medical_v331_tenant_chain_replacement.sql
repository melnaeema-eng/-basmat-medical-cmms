
begin;

-- ============================================================
-- BASMAT MEDICAL V3.3.1
-- COMPLETE REPLACEMENT FOR COMPANY -> TENANT -> OWNER -> PROJECT -> SITE
-- Medical-only. No Facilities fallback.
-- ============================================================

-- 1) Keep the existing Medical company -> organization link,
--    but now store the real bf_tenants.id as well.
alter table public.bf_med_company_tenant_links
  add column if not exists tenant_id uuid null references public.bf_tenants(id) on delete restrict;

create index if not exists bf_med_company_tenant_links_tenant_idx
  on public.bf_med_company_tenant_links(tenant_id)
  where tenant_id is not null;

-- 2) Helper: create a safe tenant code from a UUID.
create or replace function public.bf_med_make_tenant_code(p_seed uuid)
returns text
language sql
immutable
as $$
  select 'MED-' || upper(substr(replace(p_seed::text,'-',''),1,12));
$$;

-- 3) Repair / create the real Tenant for a Medical maintenance company.
--    If the organization already has clients carrying a tenant_id, reuse that tenant.
--    Otherwise create a new bf_tenants row using the Medical library identity.
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
  v_tenant uuid;
  v_lib public.bf_med_company_library%rowtype;
  v_display text;
  v_code text;
  v_has_org_tenant boolean := false;
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

  -- Existing explicit Medical mapping.
  select l.tenant_id into v_tenant
  from public.bf_med_company_tenant_links l
  where l.library_company_id=p_library_company
    and l.organization_id=p_org
    and l.status='active'
    and l.tenant_id is not null
  limit 1;

  -- Compatibility: if this organization already has a client with a valid tenant,
  -- reuse it instead of creating a duplicate tenant.
  if v_tenant is null then
    select c.tenant_id into v_tenant
    from public.bf_clients c
    join public.bf_tenants t on t.id=c.tenant_id
    where c.organization_id=p_org
      and c.tenant_id is not null
    order by c.created_at nulls last, c.id
    limit 1;
  end if;

  -- Compatibility: some shared DB versions may carry tenant_id directly on bf_organizations.
  if v_tenant is null then
    select exists(
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='bf_organizations'
        and column_name='tenant_id'
    ) into v_has_org_tenant;

    if v_has_org_tenant then
      execute 'select tenant_id from public.bf_organizations where id=$1'
      into v_tenant
      using p_org;

      if v_tenant is not null
         and not exists(select 1 from public.bf_tenants t where t.id=v_tenant) then
        v_tenant := null;
      end if;
    end if;
  end if;

  -- Create a real tenant only if no valid one exists.
  if v_tenant is null then
    v_tenant := gen_random_uuid();
    v_display := coalesce(
      nullif(trim(v_lib.name_ar),''),
      nullif(trim(v_lib.name_en),''),
      'Medical Maintenance Company'
    );
    v_code := public.bf_med_make_tenant_code(v_tenant);

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
      v_tenant,
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
    );
  end if;

  update public.bf_med_company_tenant_links
  set tenant_id=v_tenant,
      status='active'
  where library_company_id=p_library_company
    and organization_id=p_org;

  if not found then
    insert into public.bf_med_company_tenant_links(
      library_company_id,organization_id,tenant_id,status
    )
    values(p_library_company,p_org,v_tenant,'active');
  end if;

  -- If bf_organizations has tenant_id in this shared schema, keep it in sync.
  if exists(
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bf_organizations'
      and column_name='tenant_id'
  ) then
    execute 'update public.bf_organizations set tenant_id=$1 where id=$2'
    using v_tenant,p_org;
  end if;

  return v_tenant;
end;
$$;

-- 4) Replace the company create/link function.
--    It now ALWAYS returns a valid real tenant_id.
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
      name,name_ar,name_en,organization_type,
      registration_no,vat_no,email,phone,city,address,logo_url,status
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
      library_company_id,organization_id,status
    )
    values(v_lib.id,v_org,'active')
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

-- 5) Resolve the valid real tenant for an operating Medical organization.
create or replace function public.bf_med_tenant_for_org(p_org uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
begin
  select l.tenant_id into v_tenant
  from public.bf_med_company_tenant_links l
  join public.bf_tenants t on t.id=l.tenant_id
  where l.organization_id=p_org
    and l.status='active'
    and t.status='active'
  order by l.created_at
  limit 1;

  if v_tenant is null then
    select c.tenant_id into v_tenant
    from public.bf_clients c
    join public.bf_tenants t on t.id=c.tenant_id
    where c.organization_id=p_org
    order by c.created_at nulls last,c.id
    limit 1;
  end if;

  return v_tenant;
end;
$$;

-- 6) Owner/client creation is now DB-controlled and tenant-safe.
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
  v_tenant uuid;
  v_client uuid;
  v_row public.bf_clients%rowtype;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'Client name required';
  end if;

  v_tenant := public.bf_med_tenant_for_org(p_org);

  if v_tenant is null then
    raise exception 'Medical company has no valid tenant. Re-link the maintenance company first.';
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
    v_tenant,
    p_org,
    trim(p_name),
    nullif(trim(p_code),''),
    nullif(trim(p_email),''),
    nullif(trim(p_phone),''),
    'active'
  )
  returning * into v_row;

  v_client := v_row.id;

  insert into public.bf_med_company_client_links(
    organization_id,client_id,status
  )
  values(p_org,v_client,'active')
  on conflict(organization_id,client_id) do update
    set status='active';

  return to_jsonb(v_row);
end;
$$;

-- 7) Site/hospital creation is also DB-controlled.
--    If bf_sites has tenant_id in this schema, include it dynamically.
create or replace function public.bf_med_create_site(
  p_org uuid,
  p_client uuid,
  p_project uuid,
  p_name text,
  p_code text default null,
  p_city text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
  v_site uuid;
  v_result jsonb;
  v_has_tenant boolean;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'Site name required';
  end if;

  if not exists(
    select 1
    from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
  ) then
    raise exception 'Client is outside tenant';
  end if;

  v_tenant := public.bf_med_tenant_for_org(p_org);
  if v_tenant is null then
    raise exception 'Medical company has no valid tenant';
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bf_sites'
      and column_name='tenant_id'
  ) into v_has_tenant;

  if v_has_tenant then
    execute $q$
      insert into public.bf_sites(
        tenant_id,organization_id,client_id,
        name,code,city,address,status
      )
      values($1,$2,$3,$4,$5,$6,$7,'active')
      returning id
    $q$
    into v_site
    using v_tenant,p_org,p_client,trim(p_name),
          nullif(trim(p_code),''),
          nullif(trim(p_city),''),
          nullif(trim(p_address),'');
  else
    insert into public.bf_sites(
      organization_id,client_id,
      name,code,city,address,status
    )
    values(
      p_org,p_client,
      trim(p_name),
      nullif(trim(p_code),''),
      nullif(trim(p_city),''),
      nullif(trim(p_address),''),
      'active'
    )
    returning id into v_site;
  end if;

  insert into public.bf_med_company_site_links(
    organization_id,client_id,project_id,site_id,status
  )
  values(p_org,p_client,p_project,v_site,'active')
  on conflict(organization_id,site_id) do update
    set client_id=excluded.client_id,
        project_id=excluded.project_id,
        status='active';

  select to_jsonb(s) into v_result
  from public.bf_sites s
  where s.id=v_site;

  return v_result;
end;
$$;

-- 8) Ensure link operations reject cross-tenant clients.
create or replace function public.bf_med_link_client(
  p_org uuid,
  p_client uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  v_tenant := public.bf_med_tenant_for_org(p_org);

  if not exists(
    select 1
    from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
      and (v_tenant is null or c.tenant_id=v_tenant)
  ) then
    raise exception 'Client is outside Medical tenant';
  end if;

  insert into public.bf_med_company_client_links(
    organization_id,client_id,status
  )
  values(p_org,p_client,'active')
  on conflict(organization_id,client_id) do update
    set status='active';
end;
$$;

grant execute on function public.bf_med_make_tenant_code(uuid) to authenticated;
grant execute on function public.bf_med_ensure_company_tenant(uuid,uuid) to authenticated;
grant execute on function public.bf_med_create_or_link_tenant_from_library(uuid) to authenticated;
grant execute on function public.bf_med_tenant_for_org(uuid) to authenticated;
grant execute on function public.bf_med_create_client(uuid,text,text,text,text) to authenticated;
grant execute on function public.bf_med_create_site(uuid,uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.bf_med_link_client(uuid,uuid) to authenticated;

notify pgrst,'reload schema';

commit;
