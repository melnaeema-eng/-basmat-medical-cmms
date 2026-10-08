-- BASMAT MEDICAL CMMS
-- A2.1 REAL ASSET CORE CORRECTION
-- Canonical physical asset table = public.bf_assets
-- Reuses A1 service engagement/scope; no duplicate asset table is created.

begin;

do $$
declare r record;
begin
  if to_regclass('public.bf_assets') is null then
    raise exception 'bf_assets does not exist';
  end if;
  if to_regclass('public.bf_med_service_scope_assets') is null then
    raise exception 'Run A1 first: bf_med_service_scope_assets missing';
  end if;

  if exists(
    select 1
    from public.bf_med_service_scope_assets s
    left join public.bf_assets a on a.id=s.asset_id
    where a.id is null
  ) then
    raise exception 'Existing service scope contains asset ids not present in bf_assets. Stop and review before migration.';
  end if;

  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid=c.conrelid
     and a.attnum=any(c.conkey)
    where c.contype='f'
      and c.conrelid='public.bf_med_service_scope_assets'::regclass
      and a.attname='asset_id'
  loop
    execute format(
      'alter table public.bf_med_service_scope_assets drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.bf_med_service_scope_assets
  add constraint bf_med_service_scope_asset_fk
  foreign key(asset_id)
  references public.bf_assets(id)
  on delete cascade;

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
    from public.bf_assets a
    where a.id=p_asset
      and a.organization_id=v_org
      and coalesce(a.status,'active')<>'archived'
  ) then
    raise exception 'Asset not found in selected organization';
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
    engagement_id,asset_id,coverage_type,
    ppm_included,corrective_included,spare_parts_included,labor_included,
    start_date,end_date,status,notes,created_by
  )
  values(
    p_engagement,p_asset,coalesce(nullif(p_coverage_type,''),'full'),
    coalesce(p_ppm,true),coalesce(p_corrective,true),
    coalesce(p_spares,false),coalesce(p_labor,true),
    p_start,p_end,'active',p_notes,auth.uid()
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

create or replace view public.bf_med_asset_service_overview as
select
  a.id as asset_id,
  a.organization_id,
  a.client_id,
  a.site_id,
  a.building_id,
  a.floor_id,
  a.zone_id,
  a.room_id,
  a.category_id,

  a.asset_tag,
  a.name_ar as asset_type_ar,
  a.name_en as asset_type_en,
  a.serial_number,
  a.manufacturer as manufacturer_name,
  a.model,
  a.model as exact_model,
  a.operational_status,
  a.status as lifecycle_status,
  a.criticality,

  coalesce(
    to_jsonb(rm)->>'name_ar',
    to_jsonb(rm)->>'name',
    to_jsonb(rm)->>'name_en',
    to_jsonb(z)->>'name_ar',
    to_jsonb(z)->>'name',
    to_jsonb(z)->>'name_en',
    to_jsonb(f)->>'name_ar',
    to_jsonb(f)->>'name',
    to_jsonb(f)->>'name_en',
    to_jsonb(b)->>'name_ar',
    to_jsonb(b)->>'name',
    to_jsonb(b)->>'name_en',
    to_jsonb(s)->>'name'
  ) as location_name_ar,

  coalesce(
    to_jsonb(rm)->>'name_en',
    to_jsonb(rm)->>'name',
    to_jsonb(rm)->>'name_ar',
    to_jsonb(z)->>'name_en',
    to_jsonb(z)->>'name',
    to_jsonb(z)->>'name_ar',
    to_jsonb(f)->>'name_en',
    to_jsonb(f)->>'name',
    to_jsonb(f)->>'name_ar',
    to_jsonb(b)->>'name_en',
    to_jsonb(b)->>'name',
    to_jsonb(b)->>'name_ar',
    to_jsonb(s)->>'name'
  ) as location_name_en,

  coalesce(
    to_jsonb(rm)->>'code',
    to_jsonb(z)->>'code',
    to_jsonb(f)->>'code',
    to_jsonb(b)->>'code',
    to_jsonb(s)->>'code'
  ) as location_code,

  case
    when a.room_id is not null then 'room'
    when a.zone_id is not null then 'zone'
    when a.floor_id is not null then 'floor'
    when a.building_id is not null then 'building'
    when a.site_id is not null then 'site'
    else null
  end as location_type,

  concat_ws(' / ',
    nullif(coalesce(to_jsonb(s)->>'name',''),''),
    nullif(coalesce(to_jsonb(b)->>'name_ar',to_jsonb(b)->>'name',to_jsonb(b)->>'name_en',''),''),
    nullif(coalesce(to_jsonb(f)->>'name_ar',to_jsonb(f)->>'name',to_jsonb(f)->>'name_en',''),''),
    nullif(coalesce(to_jsonb(z)->>'name_ar',to_jsonb(z)->>'name',to_jsonb(z)->>'name_en',''),''),
    nullif(coalesce(to_jsonb(rm)->>'name_ar',to_jsonb(rm)->>'name',to_jsonb(rm)->>'name_en',''),'')
  ) as location_path,

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
  coalesce(scope.end_date,eng.end_date,c.end_date) as service_end_date

from public.bf_assets a
left join public.bf_sites s on s.id=a.site_id
left join public.bf_buildings b on b.id=a.building_id
left join public.bf_floors f on f.id=a.floor_id
left join public.bf_zones z on z.id=a.zone_id
left join public.bf_rooms rm on rm.id=a.room_id

left join lateral(
  select ss.*
  from public.bf_med_service_scope_assets ss
  join public.bf_med_project_service_companies ee
    on ee.id=ss.engagement_id
  where ss.asset_id=a.id
    and ss.status='active'
    and ee.status='active'
    and (ss.start_date is null or ss.start_date<=current_date)
    and (ss.end_date is null or ss.end_date>=current_date)
    and (ee.start_date is null or ee.start_date<=current_date)
    and (ee.end_date is null or ee.end_date>=current_date)
  order by ee.is_primary desc,ss.updated_at desc
  limit 1
) scope on true

left join public.bf_med_project_service_companies eng
  on eng.id=scope.engagement_id
left join public.bf_med_service_companies sc
  on sc.id=eng.company_id
left join public.bf_contracts c
  on c.id=eng.contract_id;

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
  select organization_id
  into v_org
  from public.bf_assets
  where id=p_asset;

  if v_org is null then
    raise exception 'Asset not found';
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
        select jsonb_agg(to_jsonb(p) order by
          coalesce((to_jsonb(p)->>'next_due_date')::date,current_date+interval '100 years')
        )
        from public.bf_ppm_plans p
        where p.asset_id=p_asset
      ),'[]'::jsonb),

    'medical_work_orders',
      coalesce((
        select jsonb_agg(to_jsonb(w) order by w.created_at desc)
        from public.bf_work_orders w
        where w.asset_id=p_asset
      ),'[]'::jsonb),

    'lifecycle',
      coalesce((
        select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
        from public.bf_asset_lifecycle_events e
        where e.asset_id=p_asset
      ),'[]'::jsonb),

    'service_history',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'scope',to_jsonb(ss),
            'engagement',to_jsonb(g),
            'company',to_jsonb(mc),
            'contract',to_jsonb(cc)
          )
          order by coalesce(ss.start_date,g.start_date,cc.start_date) desc nulls last
        )
        from public.bf_med_service_scope_assets ss
        join public.bf_med_project_service_companies g
          on g.id=ss.engagement_id
        left join public.bf_med_service_companies mc
          on mc.id=g.company_id
        left join public.bf_contracts cc
          on cc.id=g.contract_id
        where ss.asset_id=p_asset
      ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

grant select on public.bf_med_asset_service_overview to authenticated;
grant execute on function public.bf_med_asset_operational_context(uuid) to authenticated;

notify pgrst,'reload schema';
commit;

select
  (select count(*) from public.bf_assets) as real_assets,
  (select count(*) from public.bf_med_asset_service_overview) as cockpit_assets,
  (
    select count(*)
    from public.bf_med_asset_service_overview
    where asset_tag='AST-000008'
  ) as test_asset_ast_000008;
