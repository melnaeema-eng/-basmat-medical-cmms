-- Basmat Facilities CMMS — Sprint 27
-- Contract Renewal & SLA Compliance Dashboard
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=26)
 then raise exception 'Install and verify Sprint 26 first'; end if;
 if exists(select 1 from public.bf_migrations where version=27)
 then raise exception 'Sprint 27 already installed'; end if;
 if to_regclass('public.bf_contracts') is null or to_regclass('public.bf_work_orders') is null
 then raise exception 'Required contract/SLA sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('contract-renewal.view','View contract renewal and SLA compliance dashboard'),
 ('contract-renewal.manage','Manage contract renewal follow-up status')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'contract-renewal.%')
 or (r.code='supervisor' and p.code='contract-renewal.view')
on conflict do nothing;

create table public.bf27_renewal_tracking(
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.bf_contracts(id),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 renewal_status text not null default 'not_started'
   check(renewal_status in('not_started','contacted','negotiating','approved','renewed','not_renewing')),
 target_date date,
 note text not null default '',
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(contract_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id)
);

create index bf27_renewal_scope
on public.bf27_renewal_tracking(organization_id,renewal_status,target_date);

alter table public.bf27_renewal_tracking enable row level security;
revoke all on public.bf27_renewal_tracking from public,anon,authenticated;
grant select on public.bf27_renewal_tracking to authenticated;

create or replace function public.bf27_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf27_renewal_read on public.bf27_renewal_tracking
for select to authenticated
using(public.bf27_can(organization_id,'contract-renewal.view'));

create or replace function public.bf27_update_renewal(
 p_contract uuid,
 p_status text,
 p_target_date date default null,
 p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare c public.bf_contracts; rid uuid;
begin
 select * into c from public.bf_contracts where id=p_contract;
 if not found then raise exception 'Contract not found'; end if;

 if not public.bf27_can(c.organization_id,'contract-renewal.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_status not in('not_started','contacted','negotiating','approved','renewed','not_renewing')
 then raise exception 'Invalid renewal status'; end if;

 if p_target_date is not null and c.end_date is not null and p_target_date>c.end_date+365
 then raise exception 'Target date is outside a reasonable renewal horizon'; end if;

 insert into public.bf27_renewal_tracking(
  contract_id,organization_id,client_id,renewal_status,target_date,note,updated_by
 )
 values(
  c.id,c.organization_id,c.client_id,p_status,p_target_date,left(coalesce(p_note,''),4000),auth.uid()
 )
 on conflict(contract_id) do update
 set renewal_status=excluded.renewal_status,target_date=excluded.target_date,
     note=excluded.note,updated_by=auth.uid(),updated_at=now()
 returning id into rid;

 return rid;
end $$;

create or replace function public.bf27_dashboard(
 p_org uuid default null,
 p_client uuid default null,
 p_horizon_days integer default 120,
 p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_horizon_days is null or p_horizon_days not between 1 and 730
 then raise exception 'Horizon must be between 1 and 730 days'; end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;
 if p_org is not null and not public.bf27_can(p_org,'contract-renewal.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with visible_contracts as (
  select
    c.id,c.organization_id,c.client_id,c.contract_number,c.contract_type,
    c.start_date,c.end_date,c.contract_value,c.status,
    cl.name client_name,
    coalesce(rt.renewal_status,'not_started') renewal_status,
    rt.target_date renewal_target_date,
    rt.note renewal_note,
    case
      when c.end_date is null then null
      else c.end_date-current_date
    end days_to_expiry
  from public.bf_contracts c
  join public.bf_clients cl on cl.id=c.client_id
  left join public.bf27_renewal_tracking rt on rt.contract_id=c.id
  where (p_org is null or c.organization_id=p_org)
    and (p_client is null or c.client_id=p_client)
    and public.bf27_can(c.organization_id,'contract-renewal.view')
 ),
 sla as (
  select
    w.contract_id,
    count(*)::int work_orders,
    count(*) filter(where w.sla_status='met')::int sla_met,
    count(*) filter(where w.sla_status='breached')::int sla_breached,
    count(*) filter(where w.status not in('closed','cancelled'))::int open_work_orders,
    round(
      case when count(*) filter(where w.sla_status in('met','breached'))=0 then 0
      else 100.0*count(*) filter(where w.sla_status='met')
           /count(*) filter(where w.sla_status in('met','breached')) end
    ,2) sla_compliance_pct
  from public.bf_work_orders w
  where w.contract_id is not null
    and exists(select 1 from visible_contracts c where c.id=w.contract_id)
  group by w.contract_id
 ),
 joined as (
  select c.*,
    coalesce(s.work_orders,0) work_orders,
    coalesce(s.sla_met,0) sla_met,
    coalesce(s.sla_breached,0) sla_breached,
    coalesce(s.open_work_orders,0) open_work_orders,
    coalesce(s.sla_compliance_pct,0) sla_compliance_pct,
    case
      when c.end_date is null then 'no_expiry'
      when c.end_date<current_date then 'expired'
      when c.end_date=current_date then 'expires_today'
      when c.end_date<=current_date+30 then 'next_30_days'
      when c.end_date<=current_date+60 then 'next_60_days'
      when c.end_date<=current_date+p_horizon_days then 'within_horizon'
      else 'later'
    end expiry_bucket
  from visible_contracts c
  left join sla s on s.contract_id=c.id
 )
 select jsonb_build_object(
  'contracts',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.end_date nulls last,x.contract_number)
    from (
      select * from joined
      where end_date is null
         or end_date<=current_date+p_horizon_days
         or status in('expired','suspended')
         or renewal_status not in('not_started','renewed')
      order by end_date nulls last,contract_number
      limit p_limit
    ) x
  ),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from joined),
    'expired',(select count(*) from joined where expiry_bucket='expired'),
    'next_30_days',(select count(*) from joined where expiry_bucket in('expires_today','next_30_days')),
    'next_60_days',(select count(*) from joined where expiry_bucket in('expires_today','next_30_days','next_60_days')),
    'renewal_in_progress',(select count(*) from joined where renewal_status in('contacted','negotiating','approved')),
    'sla_breaches',(select coalesce(sum(sla_breached),0) from joined),
    'open_work_orders',(select coalesce(sum(open_work_orders),0) from joined),
    'avg_sla_compliance',(
      select coalesce(round(avg(sla_compliance_pct),2),0)
      from joined where sla_met+sla_breached>0
    ),
    'contract_value_at_risk',(
      select coalesce(round(sum(coalesce(contract_value,0)),2),0)
      from joined where expiry_bucket in('expired','expires_today','next_30_days')
        and renewal_status<>'renewed'
    )
  ),
  'horizon_days',p_horizon_days
 ) into result;

 return result;
end $$;

revoke all on function public.bf27_can(uuid,text),
 public.bf27_update_renewal(uuid,text,date,text),
 public.bf27_dashboard(uuid,uuid,integer,integer)
from public,anon;

grant execute on function public.bf27_can(uuid,text),
 public.bf27_update_renewal(uuid,text,date,text),
 public.bf27_dashboard(uuid,uuid,integer,integer)
to authenticated;

insert into public.bf_migrations(version) values(27);
commit;
