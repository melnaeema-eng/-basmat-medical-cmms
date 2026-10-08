-- BASMAT MEDICAL CMMS
-- REBUILD SPRINT A1 — ASSET / SERVICE / CONTRACT CORE ALIGNMENT
-- Reuses existing medical asset, location, maintenance-company library, contracts, PPM and work-order tables.
-- Does NOT create a parallel asset library or parallel project/location model.

begin;

-- =========================================================
-- 1) Extend the EXISTING project-service-company relation.
--    This remains the operational engagement between:
--    owner/project/site <-> maintenance company <-> contract
-- =========================================================

alter table if exists public.bf_med_project_service_companies
  add column if not exists contract_id uuid,
  add column if not exists owner_organization_id uuid,
  add column if not exists scope_notes text,
  add column if not exists coverage_type text default 'full',
  add column if not exists is_primary boolean not null default false;

do $$
begin
  if to_regclass('public.bf_contracts') is not null
     and not exists (
       select 1 from pg_constraint
       where conname='bf_med_psc_contract_fk'
     ) then
    alter table public.bf_med_project_service_companies
      add constraint bf_med_psc_contract_fk
      foreign key(contract_id)
      references public.bf_contracts(id)
      on delete set null;
  end if;

  if to_regclass('public.bf_organizations') is not null
     and not exists (
       select 1 from pg_constraint
       where conname='bf_med_psc_owner_org_fk'
     ) then
    alter table public.bf_med_project_service_companies
      add constraint bf_med_psc_owner_org_fk
      foreign key(owner_organization_id)
      references public.bf_organizations(id)
      on delete set null;
  end if;
end $$;

create index if not exists bf_med_psc_contract_idx
on public.bf_med_project_service_companies(contract_id);

create index if not exists bf_med_psc_owner_idx
on public.bf_med_project_service_companies(owner_organization_id);

create index if not exists bf_med_psc_company_active_idx
on public.bf_med_project_service_companies(company_id,status,start_date,end_date);


-- =========================================================
-- 2) Contract scope at PHYSICAL MEDICAL ASSET level.
--    One asset can move between contracts/companies over its lifecycle.
-- =========================================================

create table if not exists public.bf_med_service_scope_assets(
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null
    references public.bf_med_project_service_companies(id)
    on delete cascade,
  asset_id uuid not null
    references public.bf_med_assets(id)
    on delete cascade,
  coverage_type text not null default 'full'
    check(coverage_type in ('full','ppm','corrective','calibration','inspection','other')),
  ppm_included boolean not null default true,
  corrective_included boolean not null default true,
  spare_parts_included boolean not null default false,
  labor_included boolean not null default true,
  start_date date,
  end_date date,
  status text not null default 'active'
    check(status in ('active','expired','suspended','archived')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(engagement_id,asset_id)
);

create index if not exists bf_med_service_scope_asset_idx
on public.bf_med_service_scope_assets(asset_id,status);

create index if not exists bf_med_service_scope_engagement_idx
on public.bf_med_service_scope_assets(engagement_id,status);


-- =========================================================
-- 3) Permission helper.
--    Uses the CURRENT medical permission model already used by the
--    physical medical asset registration function.
-- =========================================================

create or replace function public.bf_med_rebuild_can_manage(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    coalesce(public.bf_is_super_admin(),false)
    or coalesce(public.bf_can(p_org,'medical.manage'),false);
$$;

revoke all on function public.bf_med_rebuild_can_manage(uuid) from public,anon;
grant execute on function public.bf_med_rebuild_can_manage(uuid) to authenticated;


-- =========================================================
-- 4) Create/update maintenance engagement.
--    Maintenance-company library remains REFERENCE DATA.
--    This function creates the OPERATIONAL use of that company.
-- =========================================================

create or replace function public.bf_med_service_engagement_upsert(
  p_id uuid,
  p_organization uuid,
  p_owner_organization uuid,
  p_project uuid,
  p_site uuid,
  p_company uuid,
  p_contract uuid,
  p_start date,
  p_end date,
  p_coverage_type text default 'full',
  p_is_primary boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if not public.bf_med_rebuild_can_manage(p_organization) then
    raise exception 'Medical maintenance management permission required'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf_med_service_companies c
    where c.id=p_company and c.status='active'
  ) then
    raise exception 'Maintenance company not found or inactive';
  end if;

  if p_contract is not null and not exists(
    select 1
    from public.bf_contracts c
    where c.id=p_contract
      and c.organization_id=p_organization
      and c.status in ('draft','active','suspended')
  ) then
    raise exception 'Contract not found for selected organization';
  end if;

  if p_site is not null and not exists(
    select 1
    from public.bf_sites s
    where s.id=p_site
      and s.organization_id=p_organization
      and s.status<>'archived'
  ) then
    raise exception 'Site not found for selected organization';
  end if;

  if p_start is not null and p_end is not null and p_end<p_start then
    raise exception 'Contract/service end date cannot be before start date';
  end if;

  if p_id is null then
    insert into public.bf_med_project_service_companies(
      organization_id,
      owner_organization_id,
      project_id,
      site_id,
      company_id,
      contract_id,
      relationship_role,
      contract_reference,
      start_date,
      end_date,
      coverage_type,
      is_primary,
      scope_notes,
      notes,
      status,
      created_by
    )
    values(
      p_organization,
      p_owner_organization,
      p_project,
      p_site,
      p_company,
      p_contract,
      'medical_maintenance_provider',
      case
        when p_contract is null then null
        else (select contract_number from public.bf_contracts where id=p_contract)
      end,
      p_start,
      p_end,
      coalesce(nullif(p_coverage_type,''),'full'),
      coalesce(p_is_primary,false),
      p_notes,
      p_notes,
      'active',
      auth.uid()
    )
    returning id into v_id;
  else
    update public.bf_med_project_service_companies
    set
      owner_organization_id=p_owner_organization,
      project_id=p_project,
      site_id=p_site,
      company_id=p_company,
      contract_id=p_contract,
      contract_reference=case
        when p_contract is null then null
        else (select contract_number from public.bf_contracts where id=p_contract)
      end,
      start_date=p_start,
      end_date=p_end,
      coverage_type=coalesce(nullif(p_coverage_type,''),'full'),
      is_primary=coalesce(p_is_primary,false),
      scope_notes=p_notes,
      notes=p_notes,
      updated_at=now()
    where id=p_id
      and organization_id=p_organization
    returning id into v_id;

    if v_id is null then
      raise exception 'Maintenance engagement not found';
    end if;
  end if;

  if p_is_primary then
    update public.bf_med_project_service_companies x
    set is_primary=false,updated_at=now()
    where x.id<>v_id
      and x.organization_id=p_organization
      and x.status='active'
      and x.is_primary
      and (p_project is null or x.project_id=p_project)
      and (p_site is null or x.site_id=p_site);
  end if;

  return v_id;
end;
$$;

revoke all on function public.bf_med_service_engagement_upsert(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,date,text,boolean,text
) from public,anon;

grant execute on function public.bf_med_service_engagement_upsert(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,date,text,boolean,text
) to authenticated;


-- =========================================================
-- 5) Add/remove physical assets from service-contract scope.
-- =========================================================

create or replace function public.bf_med_service_scope_asset_set(
  p_engagement uuid,
  p_asset uuid,
  p_enabled boolean default true,
  p_coverage_type text default 'full',
  p_ppm boolean default true,
  p_corrective boolean default true,
  p_spares boolean default false,
  p_labor boolean default true,
  p_start date default null,
  p_end date default null,
  p_notes text default null
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
  select e.organization_id
  into v_org
  from public.bf_med_project_service_companies e
  where e.id=p_engagement;

  if v_org is null then
    raise exception 'Maintenance engagement not found';
  end if;

  if not public.bf_med_rebuild_can_manage(v_org) then
    raise exception 'Medical maintenance management permission required'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.bf_med_assets a
    where a.id=p_asset
      and a.organization_id=v_org
      and a.lifecycle_status<>'retired'
  ) then
    raise exception 'Medical asset not found in selected organization';
  end if;

  if not coalesce(p_enabled,true) then
    update public.bf_med_service_scope_assets
    set status='archived',updated_at=now()
    where engagement_id=p_engagement
      and asset_id=p_asset
    returning id into v_id;

    return v_id;
  end if;

  insert into public.bf_med_service_scope_assets(
    engagement_id,
    asset_id,
    coverage_type,
    ppm_included,
    corrective_included,
    spare_parts_included,
    labor_included,
    start_date,
    end_date,
    status,
    notes,
    created_by
  )
  values(
    p_engagement,
    p_asset,
    coalesce(nullif(p_coverage_type,''),'full'),
    coalesce(p_ppm,true),
    coalesce(p_corrective,true),
    coalesce(p_spares,false),
    coalesce(p_labor,true),
    p_start,
    p_end,
    'active',
    p_notes,
    auth.uid()
  )
  on conflict(engagement_id,asset_id)
  do update set
    coverage_type=excluded.coverage_type,
    ppm_included=excluded.ppm_included,
    corrective_included=excluded.corrective_included,
    spare_parts_included=excluded.spare_parts_included,
    labor_included=excluded.labor_included,
    start_date=excluded.start_date,
    end_date=excluded.end_date,
    status='active',
    notes=excluded.notes,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.bf_med_service_scope_asset_set(
  uuid,uuid,boolean,text,boolean,boolean,boolean,boolean,date,date,text
) from public,anon;

grant execute on function public.bf_med_service_scope_asset_set(
  uuid,uuid,boolean,text,boolean,boolean,boolean,boolean,date,date,text
) to authenticated;


-- =========================================================
-- 6) Operational view: ONE ROW PER PHYSICAL MEDICAL ASSET
--    Shows where it is, what it is, who maintains it,
--    contract dates, and current PPM status.
-- =========================================================

create or replace view public.bf_med_asset_service_overview as
select
  a.id as asset_id,
  a.organization_id,
  a.project_context_id,
  a.site_id,
  a.location_node_id,
  a.asset_tag,
  a.serial_number,
  a.exact_model,
  a.model,
  a.operational_status,
  a.lifecycle_status,
  a.criticality,

  mt.id as master_type_id,
  mt.name_ar as asset_type_ar,
  mt.name_en as asset_type_en,

  mf.id as manufacturer_id,
  mf.name as manufacturer_name,

  loc.code as location_code,
  loc.name_ar as location_name_ar,
  loc.name_en as location_name_en,
  loc.node_type as location_type,

  scope.id as service_scope_id,
  scope.coverage_type,
  scope.ppm_included,
  scope.corrective_included,
  scope.spare_parts_included,
  scope.labor_included,

  eng.id as engagement_id,
  eng.company_id as maintenance_company_id,
  coalesce(sc.name_ar,sc.name_en) as maintenance_company_name,
  sc.accreditation as maintenance_company_accreditation,
  sc.license_reference as maintenance_company_license,
  eng.contract_id,
  c.contract_number,
  c.contract_type,
  coalesce(scope.start_date,eng.start_date,c.start_date) as service_start_date,
  coalesce(scope.end_date,eng.end_date,c.end_date) as service_end_date,

  pp.id as ppm_plan_id,
  pp.template_id as ppm_template_id,
  pp.next_due_date as ppm_next_due_date,
  pp.interval_months as ppm_interval_months,
  pp.status as ppm_status

from public.bf_med_assets a
left join public.bf_med_master_types mt
  on mt.id=a.master_type_id
left join public.bf_med_manufacturers mf
  on mf.id=a.manufacturer_id
left join public.bf_location_nodes loc
  on loc.id=a.location_node_id
left join lateral (
  select s.*
  from public.bf_med_service_scope_assets s
  join public.bf_med_project_service_companies e0
    on e0.id=s.engagement_id
  where s.asset_id=a.id
    and s.status='active'
    and e0.status='active'
    and (s.start_date is null or s.start_date<=current_date)
    and (s.end_date is null or s.end_date>=current_date)
    and (e0.start_date is null or e0.start_date<=current_date)
    and (e0.end_date is null or e0.end_date>=current_date)
  order by e0.is_primary desc,s.updated_at desc
  limit 1
) scope on true
left join public.bf_med_project_service_companies eng
  on eng.id=scope.engagement_id
left join public.bf_med_service_companies sc
  on sc.id=eng.company_id
left join public.bf_contracts c
  on c.id=eng.contract_id
left join lateral (
  select p.*
  from public.bf_med_ppm_plans p
  where p.asset_id=a.id
    and p.status='active'
  order by p.next_due_date nulls last,p.created_at desc
  limit 1
) pp on true;


-- =========================================================
-- 7) Read RPC for asset operational context.
-- =========================================================

create or replace function public.bf_med_asset_operational_context(p_asset uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_result jsonb;
begin
  select organization_id into v_org
  from public.bf_med_assets
  where id=p_asset;

  if v_org is null then
    raise exception 'Medical asset not found';
  end if;

  if not public.bf_med_rebuild_can_manage(v_org) then
    raise exception 'Medical maintenance access required'
      using errcode='42501';
  end if;

  select jsonb_build_object(
    'overview',
      (select to_jsonb(v)
       from public.bf_med_asset_service_overview v
       where v.asset_id=p_asset),

    'ppm_plans',
      coalesce((
        select jsonb_agg(to_jsonb(p) order by p.next_due_date)
        from public.bf_med_ppm_plans p
        where p.asset_id=p_asset
      ),'[]'::jsonb),

    'medical_work_orders',
      coalesce((
        select jsonb_agg(to_jsonb(w) order by w.opened_at desc)
        from public.bf_med_work_orders w
        where w.asset_id=p_asset
      ),'[]'::jsonb),

    'lifecycle',
      coalesce((
        select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
        from public.bf_asset_lifecycle_events e
        where e.asset_domain='medical'
          and e.asset_id=p_asset
      ),'[]'::jsonb),

    'service_history',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'scope',to_jsonb(s),
            'engagement',to_jsonb(g),
            'company',to_jsonb(mc),
            'contract',to_jsonb(c)
          )
          order by coalesce(s.start_date,g.start_date,c.start_date) desc nulls last
        )
        from public.bf_med_service_scope_assets s
        join public.bf_med_project_service_companies g on g.id=s.engagement_id
        left join public.bf_med_service_companies mc on mc.id=g.company_id
        left join public.bf_contracts c on c.id=g.contract_id
        where s.asset_id=p_asset
      ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.bf_med_asset_operational_context(uuid) from public,anon;
grant execute on function public.bf_med_asset_operational_context(uuid) to authenticated;


-- =========================================================
-- 8) RLS: reads allowed through existing medical permission.
--    Writes are via SECURITY DEFINER RPCs above.
-- =========================================================

alter table public.bf_med_service_scope_assets enable row level security;

revoke all on public.bf_med_service_scope_assets from public,anon;
grant select on public.bf_med_service_scope_assets to authenticated;

drop policy if exists bf_med_service_scope_assets_read
on public.bf_med_service_scope_assets;

create policy bf_med_service_scope_assets_read
on public.bf_med_service_scope_assets
for select
to authenticated
using (
  exists(
    select 1
    from public.bf_med_project_service_companies e
    where e.id=engagement_id
      and public.bf_med_rebuild_can_manage(e.organization_id)
  )
);

grant select on public.bf_med_asset_service_overview to authenticated;

notify pgrst,'reload schema';

commit;


-- =========================================================
-- VERIFY
-- =========================================================
select
  to_regclass('public.bf_med_assets') is not null as physical_assets_ready,
  to_regclass('public.bf_med_service_companies') is not null as company_library_ready,
  to_regclass('public.bf_med_project_service_companies') is not null as engagement_ready,
  to_regclass('public.bf_med_service_scope_assets') is not null as asset_scope_ready,
  to_regclass('public.bf_med_ppm_plans') is not null as ppm_ready,
  to_regclass('public.bf_med_work_orders') is not null as corrective_ready,
  to_regclass('public.bf_location_nodes') is not null as location_ready,
  to_regclass('public.bf_contracts') is not null as contracts_ready;
