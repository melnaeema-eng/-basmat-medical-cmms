
-- BASMAT MEDICAL CMMS
-- MEDICAL OPERATIONAL RESET V1
-- Safe for shared DB with Facilities:
--   * no destructive changes
--   * no Facilities fallback
--   * Medical scope is explicit through mapping/meta tables
--   * existing bf_* master records remain authoritative

begin;

create extension if not exists pgcrypto;

-- 1) Medical tenant registry: existing bf_organizations remain the master.
create table if not exists public.bf_med_tenant_companies(
  organization_id uuid primary key references public.bf_organizations(id) on delete cascade,
  name_ar text,
  name_en text,
  logo_url text,
  brand_color text,
  report_footer text,
  registration_no text,
  vat_no text,
  email text,
  phone text,
  city text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Explicit Medical client scope: existing bf_clients remain authoritative.
create table if not exists public.bf_med_tenant_clients(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid not null references public.bf_clients(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id, client_id)
);

-- 3) Explicit Medical hospital/site scope.
create table if not exists public.bf_med_tenant_sites(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid not null references public.bf_clients(id) on delete cascade,
  site_id uuid not null references public.bf_sites(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id, site_id)
);

-- 4) Explicit Medical asset scope.
create table if not exists public.bf_med_tenant_assets(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid null references public.bf_clients(id) on delete set null,
  site_id uuid null references public.bf_sites(id) on delete set null,
  asset_id uuid not null references public.bf_assets(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id, asset_id)
);

-- 5) Owner portal users are tightly scoped.
create table if not exists public.bf_med_owner_representatives(
  user_id uuid not null,
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid not null references public.bf_clients(id) on delete cascade,
  site_id uuid null references public.bf_sites(id) on delete cascade,
  can_create_report boolean not null default true,
  can_view_work_orders boolean not null default true,
  can_view_reports boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(user_id, organization_id, client_id, site_id)
);

-- 6) Owner report source record.
create table if not exists public.bf_med_owner_reports(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bf_organizations(id),
  client_id uuid not null references public.bf_clients(id),
  site_id uuid not null references public.bf_sites(id),
  asset_id uuid not null references public.bf_assets(id),
  reported_by uuid not null default auth.uid(),
  complaint text not null,
  priority text not null default 'P3',
  status text not null default 'submitted',
  work_order_id uuid null,
  work_order_number text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7) Unified Medical work-order metadata, linked to existing bf_work_orders.
create table if not exists public.bf_med_work_order_meta(
  work_order_id uuid primary key references public.bf_work_orders(id) on delete cascade,
  organization_id uuid not null references public.bf_organizations(id),
  client_id uuid null references public.bf_clients(id),
  site_id uuid null references public.bf_sites(id),
  asset_id uuid null references public.bf_assets(id),
  source_type text not null check(source_type in (
    'OWNER_REPORTED',
    'PPM_GENERATED',
    'INTERNAL',
    'CALIBRATION',
    'INSPECTION',
    'RECALL'
  )),
  owner_report_id uuid null references public.bf_med_owner_reports(id),
  maintenance_type text not null default 'corrective',
  final_disposition text null check(final_disposition is null or final_disposition in (
    'PASS_RETURN_TO_SERVICE',
    'PASS_WITH_OBSERVATION',
    'CORRECTIVE_REQUIRED',
    'FAILED_OUT_OF_SERVICE'
  )),
  technical_review_status text not null default 'not_submitted',
  customer_acceptance_status text not null default 'not_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8) Executable maintenance checklist results.
create table if not exists public.bf_med_work_order_step_results(
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.bf_work_orders(id) on delete cascade,
  template_id uuid null,
  step_id uuid null,
  step_order integer not null default 0,
  step_title text not null,
  instruction text null,
  response_type text not null default 'pass_fail',
  result_status text null check(result_status is null or result_status in (
    'PASS','FAIL','NA','OBSERVATION'
  )),
  reading_value numeric null,
  reading_text text null,
  unit text null,
  min_value numeric null,
  max_value numeric null,
  notes text null,
  evidence_url text null,
  corrective_required boolean not null default false,
  completed_by uuid null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

-- 9) Historical branding snapshot for issued reports.
create table if not exists public.bf_med_report_brand_snapshots(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bf_organizations(id),
  client_id uuid null references public.bf_clients(id),
  site_id uuid null references public.bf_sites(id),
  work_order_id uuid null references public.bf_work_orders(id),
  report_type text not null default 'service_report',
  organization_name_ar text,
  organization_name_en text,
  organization_logo_url text,
  organization_brand_color text,
  organization_registration_no text,
  organization_vat_no text,
  organization_email text,
  organization_phone text,
  organization_city text,
  organization_address text,
  report_footer text,
  client_name text,
  site_name text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists bf_med_owner_reports_scope_idx
  on public.bf_med_owner_reports(organization_id,client_id,site_id,created_at desc);

create index if not exists bf_med_work_order_meta_scope_idx
  on public.bf_med_work_order_meta(organization_id,client_id,site_id,source_type);

create index if not exists bf_med_step_results_wo_idx
  on public.bf_med_work_order_step_results(work_order_id,step_order);

-- -----------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------

create or replace function public.bf_med_is_tenant_member(p_org uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    public.bf_acl_is_super_user(p_user)
    or exists(
      select 1
      from public.bf_acl_user_organizations uo
      where uo.user_id=p_user
        and uo.organization_id=p_org
        and coalesce(uo.is_active,true)
    );
$$;

create or replace function public.bf_med_is_owner_rep(
  p_org uuid,
  p_client uuid,
  p_site uuid default null,
  p_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.bf_med_owner_representatives r
    where r.user_id=p_user
      and r.organization_id=p_org
      and r.client_id=p_client
      and (r.site_id is null or p_site is null or r.site_id=p_site)
      and r.is_active
  );
$$;

-- -----------------------------------------------------------
-- Tenant / client / site registration using existing master rows
-- -----------------------------------------------------------

create or replace function public.bf_med_register_tenant_company(p_org uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Super Admin required' using errcode='42501';
  end if;

  insert into public.bf_med_tenant_companies(
    organization_id,name_ar,name_en,logo_url,registration_no,vat_no,email,phone,city,address,status
  )
  select
    id,name_ar,name_en,logo_url,registration_no,vat_no,email,phone,city,address,coalesce(status,'active')
  from public.bf_organizations
  where id=p_org
  on conflict(organization_id) do update set
    name_ar=excluded.name_ar,
    name_en=excluded.name_en,
    logo_url=excluded.logo_url,
    registration_no=excluded.registration_no,
    vat_no=excluded.vat_no,
    email=excluded.email,
    phone=excluded.phone,
    city=excluded.city,
    address=excluded.address,
    status=excluded.status,
    updated_at=now();

  if not found then
    raise exception 'Organization not found';
  end if;
end;
$$;

create or replace function public.bf_med_link_client(p_org uuid,p_client uuid)
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
    select 1 from public.bf_clients c
    where c.id=p_client and c.organization_id=p_org
  ) then
    raise exception 'Client is not owned by this maintenance company';
  end if;

  insert into public.bf_med_tenant_clients(organization_id,client_id)
  values(p_org,p_client)
  on conflict do nothing;
end;
$$;

create or replace function public.bf_med_link_site(p_org uuid,p_client uuid,p_site uuid)
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
    select 1 from public.bf_sites s
    where s.id=p_site
      and s.organization_id=p_org
      and s.client_id=p_client
  ) then
    raise exception 'Site is outside this Medical tenant/client scope';
  end if;

  insert into public.bf_med_tenant_sites(organization_id,client_id,site_id)
  values(p_org,p_client,p_site)
  on conflict do nothing;
end;
$$;

create or replace function public.bf_med_link_asset(
  p_org uuid,p_client uuid,p_site uuid,p_asset uuid
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
    select 1 from public.bf_assets a
    where a.id=p_asset
      and a.organization_id=p_org
      and a.site_id=p_site
  ) then
    raise exception 'Asset is outside this Medical tenant/site scope';
  end if;

  insert into public.bf_med_tenant_assets(
    organization_id,client_id,site_id,asset_id
  )
  values(p_org,p_client,p_site,p_asset)
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------
-- Read bundle: ONLY records explicitly registered in Medical scope.
-- No Facilities fallback.
-- -----------------------------------------------------------

create or replace function public.bf_med_operational_directory(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'tenant',coalesce((
      select to_jsonb(x)
      from public.bf_med_tenant_companies x
      where x.organization_id=p_org
    ),'{}'::jsonb),
    'clients',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
      from public.bf_med_tenant_clients mc
      join public.bf_clients c on c.id=mc.client_id
      where mc.organization_id=p_org
        and mc.status='active'
    ),'[]'::jsonb),
    'sites',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.name)
      from public.bf_med_tenant_sites ms
      join public.bf_sites s on s.id=ms.site_id
      where ms.organization_id=p_org
        and ms.status='active'
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id)
      from public.bf_med_tenant_assets ma
      join public.bf_assets a on a.id=ma.asset_id
      where ma.organization_id=p_org
        and ma.status='active'
    ),'[]'::jsonb)
  ) into v;

  return v;
end;
$$;

-- -----------------------------------------------------------
-- Owner report -> automatic Work Order
-- Uses existing bf_work_orders table while keeping a Medical source record.
-- No separate "manual conversion" step.
-- -----------------------------------------------------------

create or replace function public.bf_med_owner_report_create(
  p_org uuid,
  p_client uuid,
  p_site uuid,
  p_asset uuid,
  p_complaint text,
  p_priority text default 'P3'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_report uuid;
  v_wo uuid;
  v_no text;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not public.bf_med_is_owner_rep(p_org,p_client,p_site,auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Owner representative scope denied' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf_med_tenant_assets ma
    where ma.organization_id=p_org
      and ma.client_id=p_client
      and ma.site_id=p_site
      and ma.asset_id=p_asset
      and ma.status='active'
  ) then
    raise exception 'Medical asset is outside authorized owner scope';
  end if;

  insert into public.bf_med_owner_reports(
    organization_id,client_id,site_id,asset_id,complaint,priority
  )
  values(
    p_org,p_client,p_site,p_asset,trim(p_complaint),coalesce(nullif(p_priority,''),'P3')
  )
  returning id into v_report;

  v_title := 'Owner Reported Medical Corrective';

  -- Existing shared work order table is authoritative.
  -- We insert only Medical-scoped columns known in the current schema.
  -- Any existing workflow triggers continue to apply.
  insert into public.bf_work_orders(
    organization_id,client_id,site_id,asset_id,
    title,description,priority,status,approval_status,sla_status
  )
  values(
    p_org,p_client,p_site,p_asset,
    v_title,trim(p_complaint),coalesce(nullif(p_priority,''),'P3'),
    'draft','not_submitted','not_configured'
  )
  returning id,work_order_number into v_wo,v_no;

  insert into public.bf_med_work_order_meta(
    work_order_id,organization_id,client_id,site_id,asset_id,
    source_type,owner_report_id,maintenance_type
  )
  values(
    v_wo,p_org,p_client,p_site,p_asset,
    'OWNER_REPORTED',v_report,'corrective'
  );

  update public.bf_med_owner_reports
  set work_order_id=v_wo,
      work_order_number=v_no,
      status='work_order_created',
      updated_at=now()
  where id=v_report;

  return jsonb_build_object(
    'report_id',v_report,
    'work_order_id',v_wo,
    'work_order_number',v_no,
    'source_type','OWNER_REPORTED'
  );
end;
$$;

-- -----------------------------------------------------------
-- Internal Work Order creator for Medical company staff
-- -----------------------------------------------------------

create or replace function public.bf_med_internal_work_order_create(
  p_org uuid,
  p_client uuid,
  p_site uuid,
  p_asset uuid,
  p_title text,
  p_description text default null,
  p_priority text default 'P3',
  p_source_type text default 'INTERNAL',
  p_maintenance_type text default 'corrective'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_wo uuid;
  v_no text;
begin
  if not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if p_source_type not in ('INTERNAL','CALIBRATION','INSPECTION','RECALL') then
    raise exception 'Invalid internal source type';
  end if;

  if not exists(
    select 1 from public.bf_med_tenant_assets ma
    where ma.organization_id=p_org
      and ma.asset_id=p_asset
      and ma.status='active'
  ) then
    raise exception 'Medical asset is outside tenant scope';
  end if;

  insert into public.bf_work_orders(
    organization_id,client_id,site_id,asset_id,
    title,description,priority,status,approval_status,sla_status
  )
  values(
    p_org,p_client,p_site,p_asset,
    trim(p_title),p_description,coalesce(nullif(p_priority,''),'P3'),
    'draft','not_submitted','not_configured'
  )
  returning id,work_order_number into v_wo,v_no;

  insert into public.bf_med_work_order_meta(
    work_order_id,organization_id,client_id,site_id,asset_id,
    source_type,maintenance_type
  )
  values(
    v_wo,p_org,p_client,p_site,p_asset,
    p_source_type,coalesce(nullif(p_maintenance_type,''),'corrective')
  );

  return jsonb_build_object(
    'work_order_id',v_wo,
    'work_order_number',v_no,
    'source_type',p_source_type
  );
end;
$$;

-- -----------------------------------------------------------
-- Work Order checklist execution
-- -----------------------------------------------------------

create or replace function public.bf_med_wo_step_result_save(
  p_work_order uuid,
  p_step_order integer,
  p_step_title text,
  p_result_status text,
  p_instruction text default null,
  p_response_type text default 'pass_fail',
  p_reading_value numeric default null,
  p_reading_text text default null,
  p_unit text default null,
  p_notes text default null,
  p_evidence_url text default null,
  p_corrective_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select m.organization_id into v_org
  from public.bf_med_work_order_meta m
  where m.work_order_id=p_work_order;

  if v_org is null then
    raise exception 'Medical work order metadata not found';
  end if;

  if not public.bf_med_is_tenant_member(v_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  insert into public.bf_med_work_order_step_results(
    work_order_id,step_order,step_title,instruction,response_type,
    result_status,reading_value,reading_text,unit,notes,evidence_url,
    corrective_required,completed_by,completed_at
  )
  values(
    p_work_order,p_step_order,trim(p_step_title),p_instruction,p_response_type,
    p_result_status,p_reading_value,p_reading_text,p_unit,p_notes,p_evidence_url,
    coalesce(p_corrective_required,false),auth.uid(),now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------
-- Report identity snapshot
-- -----------------------------------------------------------

create or replace function public.bf_med_capture_report_brand_snapshot(
  p_org uuid,
  p_client uuid default null,
  p_site uuid default null,
  p_work_order uuid default null,
  p_report_type text default 'service_report'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if not public.bf_med_is_tenant_member(p_org,auth.uid())
     and not public.bf_med_is_owner_rep(p_org,p_client,p_site,auth.uid()) then
    raise exception 'Report scope denied' using errcode='42501';
  end if;

  insert into public.bf_med_report_brand_snapshots(
    organization_id,client_id,site_id,work_order_id,report_type,
    organization_name_ar,organization_name_en,
    organization_logo_url,organization_brand_color,
    organization_registration_no,organization_vat_no,
    organization_email,organization_phone,organization_city,organization_address,
    report_footer,client_name,site_name
  )
  select
    t.organization_id,p_client,p_site,p_work_order,coalesce(p_report_type,'service_report'),
    coalesce(t.name_ar,o.name_ar),coalesce(t.name_en,o.name_en),
    coalesce(t.logo_url,o.logo_url),t.brand_color,
    coalesce(t.registration_no,o.registration_no),coalesce(t.vat_no,o.vat_no),
    coalesce(t.email,o.email),coalesce(t.phone,o.phone),
    coalesce(t.city,o.city),coalesce(t.address,o.address),
    t.report_footer,c.name,s.name
  from public.bf_med_tenant_companies t
  join public.bf_organizations o on o.id=t.organization_id
  left join public.bf_clients c on c.id=p_client
  left join public.bf_sites s on s.id=p_site
  where t.organization_id=p_org
  returning id into v_id;

  if v_id is null then raise exception 'Medical tenant not registered'; end if;
  return v_id;
end;
$$;

grant execute on function public.bf_med_is_tenant_member(uuid,uuid) to authenticated;
grant execute on function public.bf_med_is_owner_rep(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.bf_med_register_tenant_company(uuid) to authenticated;
grant execute on function public.bf_med_link_client(uuid,uuid) to authenticated;
grant execute on function public.bf_med_link_site(uuid,uuid,uuid) to authenticated;
grant execute on function public.bf_med_link_asset(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.bf_med_operational_directory(uuid) to authenticated;
grant execute on function public.bf_med_owner_report_create(uuid,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.bf_med_internal_work_order_create(uuid,uuid,uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.bf_med_wo_step_result_save(uuid,integer,text,text,text,text,numeric,text,text,text,text,boolean) to authenticated;
grant execute on function public.bf_med_capture_report_brand_snapshot(uuid,uuid,uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';

commit;
