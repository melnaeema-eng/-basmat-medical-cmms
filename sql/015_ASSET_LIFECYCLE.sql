-- Basmat Facilities CMMS — Sprint 14
-- Asset Lifecycle, Inspections & Warranty
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=13)
 or to_regclass('public.bf_assets') is null
 then raise exception 'Install and verify Sprint 13 first'; end if;
 if exists(select 1 from public.bf_migrations where version=14)
 then raise exception 'Sprint 14 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('lifecycle.view','View asset lifecycle and warranty records'),
 ('lifecycle.inspect','Record asset condition inspections'),
 ('lifecycle.manage','Manage warranty claims and lifecycle plans')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'lifecycle.%')
 or (r.code='supervisor' and p.code in('lifecycle.view','lifecycle.inspect'))
 or (r.code='technician' and p.code='lifecycle.inspect')
on conflict do nothing;

-- Sprint 14 child tables reference (asset_id, organization_id).
-- bf_assets already has a global PK on id and a scoped unique key on
-- (id, organization_id, site_id), but PostgreSQL still requires a unique
-- key matching the exact referenced pair.
create unique index if not exists bf_assets_id_org_uq
on public.bf_assets(id,organization_id);

create table public.bf14_asset_inspections(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 asset_id uuid not null,
 condition text not null check(condition in('excellent','good','fair','poor','failed')),
 operational_status text not null check(operational_status in('in_service','out_of_service','under_maintenance','disposed')),
 score integer check(score between 0 and 100),
 notes text not null default '',
 inspected_by uuid not null references auth.users(id),
 inspected_at timestamptz not null default now(),
 next_inspection_date date,
 unique(id,organization_id),
 foreign key(asset_id,organization_id) references public.bf_assets(id,organization_id)
);
create index bf14_inspection_asset on public.bf14_asset_inspections(asset_id,inspected_at desc);

create table public.bf14_warranty_claims(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 asset_id uuid not null,
 claim_number text not null,
 provider text not null,
 status text not null default 'open' check(status in('open','submitted','approved','rejected','closed','cancelled')),
 issue text not null check(length(btrim(issue)) between 5 and 4000),
 submitted_at timestamptz,
 decision_at timestamptz,
 resolution text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,claim_number),
 foreign key(asset_id,organization_id) references public.bf_assets(id,organization_id)
);
create index bf14_claim_scope on public.bf14_warranty_claims(organization_id,status,created_at desc);

create table public.bf14_replacement_plans(
 asset_id uuid primary key,
 organization_id uuid not null references public.bf_organizations(id),
 target_date date,
 priority text not null default 'medium' check(priority in('low','medium','high','critical')),
 reason text not null default '',
 estimated_cost numeric(18,2) check(estimated_cost>=0),
 currency text not null default 'SAR' check(length(currency)=3),
 status text not null default 'planned' check(status in('planned','budgeted','approved','completed','cancelled')),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 foreign key(asset_id,organization_id) references public.bf_assets(id,organization_id)
);

do $$ declare t text; begin
 foreach t in array array['bf14_asset_inspections','bf14_warranty_claims','bf14_replacement_plans'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf14_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf14_inspection_read on public.bf14_asset_inspections for select to authenticated
using(public.bf14_can(organization_id,'lifecycle.view') or public.bf14_can(organization_id,'lifecycle.inspect'));
create policy bf14_claim_read on public.bf14_warranty_claims for select to authenticated
using(public.bf14_can(organization_id,'lifecycle.view'));
create policy bf14_plan_read on public.bf14_replacement_plans for select to authenticated
using(public.bf14_can(organization_id,'lifecycle.view'));

create or replace function public.bf14_center(p_org uuid default null,p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid limit'; end if;
 select jsonb_build_object(
  'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag) from (
    select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,a.name_ar,a.name_en,
      a.condition,a.operational_status,a.criticality,a.warranty_end,a.expected_life_years,
      a.commissioning_date,a.replacement_cost,
      case when a.warranty_end is not null then a.warranty_end-current_date end warranty_days,
      case when a.commissioning_date is not null and a.expected_life_years is not null
        then (a.commissioning_date+(a.expected_life_years||' years')::interval)::date end expected_replacement_date
    from public.bf_assets a
    where a.status='active' and (p_org is null or a.organization_id=p_org)
     and public.bf14_can(a.organization_id,'lifecycle.view')
    limit p_limit
  ) x),'[]'::jsonb),
  'inspections',coalesce((select jsonb_agg(to_jsonb(i) order by i.inspected_at desc)
    from public.bf14_asset_inspections i
    where (p_org is null or i.organization_id=p_org)
      and (public.bf14_can(i.organization_id,'lifecycle.view') or public.bf14_can(i.organization_id,'lifecycle.inspect'))
  ),'[]'::jsonb),
  'claims',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc)
    from public.bf14_warranty_claims c
    where (p_org is null or c.organization_id=p_org) and public.bf14_can(c.organization_id,'lifecycle.view')
  ),'[]'::jsonb),
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc)
    from public.bf14_replacement_plans p
    where (p_org is null or p.organization_id=p_org) and public.bf14_can(p.organization_id,'lifecycle.view')
  ),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.bf14_inspect(
 p_asset uuid,p_condition text,p_operational_status text,p_score integer,p_notes text,p_next date)
returns uuid language plpgsql security definer set search_path=''
as $$
declare a public.bf_assets; iid uuid;
begin
 select * into a from public.bf_assets where id=p_asset for update;
 if not found then raise exception 'Asset not found'; end if;
 if not public.bf14_can(a.organization_id,'lifecycle.inspect') then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_condition not in('excellent','good','fair','poor','failed') then raise exception 'Invalid condition'; end if;
 if p_operational_status not in('in_service','out_of_service','under_maintenance','disposed') then raise exception 'Invalid operational status'; end if;
 if p_score is not null and p_score not between 0 and 100 then raise exception 'Invalid score'; end if;
 insert into public.bf14_asset_inspections(organization_id,asset_id,condition,operational_status,score,notes,inspected_by,next_inspection_date)
 values(a.organization_id,p_asset,p_condition,p_operational_status,p_score,coalesce(p_notes,''),auth.uid(),p_next)
 returning id into iid;
 update public.bf_assets set condition=p_condition,operational_status=p_operational_status,updated_by=auth.uid(),updated_at=now()
 where id=p_asset;
 return iid;
end $$;

create or replace function public.bf14_claim(
 p_action text,p_id uuid default null,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare a public.bf_assets;c public.bf14_warranty_claims;cid uuid;
begin
 if p_action='create' then
  select * into a from public.bf_assets where id=(p_data->>'asset_id')::uuid;
  if not found then raise exception 'Asset not found'; end if;
  if not public.bf14_can(a.organization_id,'lifecycle.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if a.warranty_end is null then raise exception 'Asset has no warranty end date'; end if;
  if length(btrim(coalesce(p_data->>'issue','')))<5 then raise exception 'Issue is required'; end if;
  insert into public.bf14_warranty_claims(organization_id,asset_id,claim_number,provider,issue,created_by)
  values(a.organization_id,a.id,btrim(p_data->>'claim_number'),coalesce(nullif(btrim(p_data->>'provider'),''),a.warranty_provider,'Unknown'),
    btrim(p_data->>'issue'),auth.uid()) returning id into cid;
  return cid;
 end if;

 select * into c from public.bf14_warranty_claims where id=p_id for update;
 if not found then raise exception 'Claim not found'; end if;
 if not public.bf14_can(c.organization_id,'lifecycle.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_action='status' then
  if p_data->>'status' not in('open','submitted','approved','rejected','closed','cancelled') then raise exception 'Invalid claim status'; end if;
  update public.bf14_warranty_claims set status=p_data->>'status',
    submitted_at=case when p_data->>'status'='submitted' and submitted_at is null then now() else submitted_at end,
    decision_at=case when p_data->>'status' in('approved','rejected') then now() else decision_at end,
    resolution=coalesce(nullif(p_data->>'resolution',''),resolution),updated_at=now()
  where id=c.id;
  return c.id;
 end if;
 raise exception 'Invalid claim action';
end $$;

create or replace function public.bf14_plan(
 p_asset uuid,p_target date,p_priority text,p_reason text,p_cost numeric,p_currency text,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare a public.bf_assets;
begin
 select * into a from public.bf_assets where id=p_asset;
 if not found then raise exception 'Asset not found'; end if;
 if not public.bf14_can(a.organization_id,'lifecycle.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_priority not in('low','medium','high','critical') then raise exception 'Invalid priority'; end if;
 if p_status not in('planned','budgeted','approved','completed','cancelled') then raise exception 'Invalid status'; end if;
 if p_cost is not null and p_cost<0 then raise exception 'Invalid cost'; end if;
 insert into public.bf14_replacement_plans(asset_id,organization_id,target_date,priority,reason,estimated_cost,currency,status,updated_by,updated_at)
 values(a.id,a.organization_id,p_target,p_priority,coalesce(p_reason,''),p_cost,upper(coalesce(p_currency,'SAR')),p_status,auth.uid(),now())
 on conflict(asset_id) do update set target_date=excluded.target_date,priority=excluded.priority,reason=excluded.reason,
  estimated_cost=excluded.estimated_cost,currency=excluded.currency,status=excluded.status,updated_by=auth.uid(),updated_at=now();
end $$;

revoke all on function public.bf14_center(uuid,integer),public.bf14_inspect(uuid,text,text,integer,text,date),
 public.bf14_claim(text,uuid,jsonb),public.bf14_plan(uuid,date,text,text,numeric,text,text),public.bf14_can(uuid,text) from public,anon;
grant execute on function public.bf14_center(uuid,integer),public.bf14_inspect(uuid,text,text,integer,text,date),
 public.bf14_claim(text,uuid,jsonb),public.bf14_plan(uuid,date,text,text,numeric,text,text),public.bf14_can(uuid,text) to authenticated;

insert into public.bf_migrations(version) values(14);
commit;
