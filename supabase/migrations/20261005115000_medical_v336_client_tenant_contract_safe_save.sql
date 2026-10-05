
begin;

-- MEDICAL V3.3.6
-- 1) Ensure a real tenant row exists for a Medical organization.
-- 2) Save contracts through a Medical security-definer RPC.
-- Shared DB safe: only explicit organization passed to the function is touched.

create or replace function public.bf_med_ensure_org_tenant(
  p_org uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org public.bf_organizations%rowtype;
  v_code text;
  v_display text;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  select * into v_org
  from public.bf_organizations
  where id=p_org
    and status='active';

  if v_org.id is null then
    raise exception 'Organization not found or inactive';
  end if;

  if exists(select 1 from public.bf_tenants t where t.id=p_org) then
    return p_org;
  end if;

  v_code := 'MED-' || upper(substr(replace(p_org::text,'-',''),1,12));
  v_display := coalesce(
    nullif(trim(v_org.name_ar),''),
    nullif(trim(v_org.name_en),''),
    nullif(trim(v_org.name),''),
    'Medical Organization'
  );

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
    coalesce(nullif(trim(v_org.name_en),''),nullif(trim(v_org.name_ar),''),nullif(trim(v_org.name),'')),
    v_org.email,
    v_org.phone,
    v_org.logo_url,
    'professional',
    'trial',
    'active',
    jsonb_build_object('scope','medical','organization_id',p_org),
    auth.uid()
  )
  on conflict(id) do nothing;

  return p_org;
end;
$$;

create or replace function public.bf_med_save_contract(
  p_id uuid,
  p_org uuid,
  p_client uuid,
  p_contract_number text,
  p_contract_type text,
  p_start_date date,
  p_end_date date,
  p_contract_value numeric,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.bf_contracts%rowtype;
  v_tenant uuid;
  v_number text;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  v_tenant := public.bf_med_ensure_org_tenant(p_org);

  if not exists(
    select 1
    from public.bf_clients c
    where c.id=p_client
      and c.organization_id=p_org
      and c.tenant_id=v_tenant
      and c.status='active'
  ) then
    raise exception 'Client is outside Medical organization';
  end if;

  if p_end_date is not null
     and p_start_date is not null
     and p_end_date < p_start_date then
    raise exception 'Contract end date cannot be before start date';
  end if;

  v_number := nullif(trim(p_contract_number),'');
  if v_number is null then
    v_number := 'MED-CTR-' || to_char(now(),'YYYY') || '-' ||
                upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  end if;

  if p_id is null then
    insert into public.bf_contracts(
      organization_id,
      client_id,
      contract_number,
      contract_type,
      start_date,
      end_date,
      contract_value,
      status
    )
    values(
      p_org,
      p_client,
      v_number,
      coalesce(nullif(trim(p_contract_type),''),'comprehensive'),
      p_start_date,
      p_end_date,
      coalesce(p_contract_value,0),
      coalesce(nullif(trim(p_status),''),'active')
    )
    returning * into v_row;
  else
    update public.bf_contracts
    set client_id=p_client,
        contract_number=v_number,
        contract_type=coalesce(nullif(trim(p_contract_type),''),contract_type),
        start_date=p_start_date,
        end_date=p_end_date,
        contract_value=coalesce(p_contract_value,contract_value),
        status=coalesce(nullif(trim(p_status),''),status)
    where id=p_id
      and organization_id=p_org
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Contract not found in Medical organization';
    end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.bf_med_ensure_org_tenant(uuid) to authenticated;
grant execute on function public.bf_med_save_contract(uuid,uuid,uuid,text,text,date,date,numeric,text) to authenticated;

notify pgrst,'reload schema';

commit;
