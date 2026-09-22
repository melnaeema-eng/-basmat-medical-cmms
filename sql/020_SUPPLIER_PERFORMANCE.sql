-- Basmat Facilities CMMS — Sprint 19
-- Supplier Performance & Evaluation
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=18)
 then raise exception 'Install and verify Sprint 18 first'; end if;
 if exists(select 1 from public.bf_migrations where version=19)
 then raise exception 'Sprint 19 already installed'; end if;
 if to_regclass('public.bf7_suppliers') is null
 or to_regclass('public.bf7_purchase_orders') is null
 or to_regclass('public.bf7_po_lines') is null
 or to_regclass('public.bf7_receipts') is null
 then raise exception 'Procurement foundation is missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('supplier-performance.view','View supplier performance dashboard'),
 ('supplier-performance.manage','Create supplier performance evaluations')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'supplier-performance.%')
 or (r.code in('supervisor','store_keeper') and p.code='supplier-performance.view')
on conflict do nothing;

create table public.bf19_supplier_evaluations(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 supplier_id uuid not null references public.bf7_suppliers(id),
 evaluation_date date not null default current_date,
 quality_score integer not null check(quality_score between 1 and 5),
 delivery_score integer not null check(delivery_score between 1 and 5),
 service_score integer not null check(service_score between 1 and 5),
 commercial_score integer not null check(commercial_score between 1 and 5),
 overall_score numeric(4,2) generated always as
   ((quality_score+delivery_score+service_score+commercial_score)::numeric/4) stored,
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

create index bf19_supplier_eval_lookup
on public.bf19_supplier_evaluations(organization_id,supplier_id,evaluation_date desc,created_at desc);

alter table public.bf19_supplier_evaluations enable row level security;
revoke all on public.bf19_supplier_evaluations from public,anon,authenticated;
grant select on public.bf19_supplier_evaluations to authenticated;

create or replace function public.bf19_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf19_eval_read on public.bf19_supplier_evaluations
for select to authenticated
using(public.bf19_can(organization_id,'supplier-performance.view'));

create or replace function public.bf19_evaluate(
 p_supplier uuid,
 p_quality integer,
 p_delivery integer,
 p_service integer,
 p_commercial integer,
 p_notes text default '',
 p_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf7_suppliers; eid uuid;
begin
 select * into s from public.bf7_suppliers where id=p_supplier;
 if not found then raise exception 'Supplier not found'; end if;

 if not public.bf19_can(s.organization_id,'supplier-performance.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_quality not between 1 and 5
 or p_delivery not between 1 and 5
 or p_service not between 1 and 5
 or p_commercial not between 1 and 5
 then raise exception 'Scores must be between 1 and 5'; end if;

 if p_date is null or p_date>current_date+1
 then raise exception 'Invalid evaluation date'; end if;

 insert into public.bf19_supplier_evaluations(
  organization_id,supplier_id,evaluation_date,quality_score,delivery_score,
  service_score,commercial_score,notes,created_by
 )
 values(
  s.organization_id,s.id,p_date,p_quality,p_delivery,p_service,p_commercial,
  left(coalesce(p_notes,''),4000),auth.uid()
 )
 returning id into eid;

 return eid;
end $$;

create or replace function public.bf19_dashboard(
 p_org uuid default null,
 p_from date default (current_date-365),
 p_to date default current_date,
 p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null
 then raise exception 'Authentication required' using errcode='42501'; end if;

 if p_from is null or p_to is null or p_from>p_to
 then raise exception 'Invalid date range'; end if;

 if p_to-p_from>730
 then raise exception 'Date range cannot exceed 730 days'; end if;

 if p_limit is null or p_limit not between 1 and 500
 then raise exception 'Invalid limit'; end if;

 if p_org is not null and not public.bf19_can(p_org,'supplier-performance.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with suppliers as (
  select s.id,s.organization_id,s.code,s.name,s.status
  from public.bf7_suppliers s
  where s.status<>'archived'
    and (p_org is null or s.organization_id=p_org)
    and public.bf19_can(s.organization_id,'supplier-performance.view')
 ),
 po_value as (
  select po.supplier_id,
    count(*)::int po_count,
    count(*) filter(where po.status in('received','part_received'))::int fulfilled_po_count,
    coalesce(sum(l.quantity*l.unit_price),0)::numeric(18,2) ordered_value,
    coalesce(sum(l.received_qty*l.unit_price),0)::numeric(18,2) received_value
  from public.bf7_purchase_orders po
  join public.bf7_po_lines l on l.po_id=po.id
  where po.status<>'cancelled'
    and po.created_at::date between p_from and p_to
    and exists(select 1 from suppliers s where s.id=po.supplier_id)
  group by po.supplier_id
 ),
 receipt_stats as (
  select po.supplier_id,
    count(r.id)::int receipt_count,
    coalesce(sum(r.quantity),0)::numeric(18,3) received_qty,
    round(coalesce(avg(extract(epoch from (r.received_at-coalesce(po.approved_at,po.created_at)))/86400),0)::numeric,2) avg_receipt_days
  from public.bf7_purchase_orders po
  join public.bf7_receipts r on r.po_id=po.id
  where r.received_at::date between p_from and p_to
    and exists(select 1 from suppliers s where s.id=po.supplier_id)
  group by po.supplier_id
 ),
 evals as (
  select e.supplier_id,
    count(*)::int evaluation_count,
    round(avg(e.overall_score),2) avg_score,
    round(avg(e.quality_score),2) quality_score,
    round(avg(e.delivery_score),2) delivery_score,
    round(avg(e.service_score),2) service_score,
    round(avg(e.commercial_score),2) commercial_score
  from public.bf19_supplier_evaluations e
  where e.evaluation_date between p_from and p_to
    and exists(select 1 from suppliers s where s.id=e.supplier_id)
  group by e.supplier_id
 ),
 rows as (
  select
    s.id,s.organization_id,s.code,s.name,s.status,
    coalesce(p.po_count,0) po_count,
    coalesce(p.fulfilled_po_count,0) fulfilled_po_count,
    coalesce(p.ordered_value,0) ordered_value,
    coalesce(p.received_value,0) received_value,
    coalesce(r.receipt_count,0) receipt_count,
    coalesce(r.received_qty,0) received_qty,
    coalesce(r.avg_receipt_days,0) avg_receipt_days,
    coalesce(e.evaluation_count,0) evaluation_count,
    e.avg_score,e.quality_score,e.delivery_score,e.service_score,e.commercial_score
  from suppliers s
  left join po_value p on p.supplier_id=s.id
  left join receipt_stats r on r.supplier_id=s.id
  left join evals e on e.supplier_id=s.id
 )
 select jsonb_build_object(
   'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.name)
     from (select * from rows order by name limit p_limit)x),'[]'::jsonb),
   'summary',jsonb_build_object(
     'suppliers',(select count(*) from rows),
     'purchase_orders',coalesce((select sum(po_count) from rows),0),
     'ordered_value',coalesce((select sum(ordered_value) from rows),0),
     'received_value',coalesce((select sum(received_value) from rows),0),
     'evaluations',coalesce((select sum(evaluation_count) from rows),0),
     'avg_score',coalesce((select round(avg(avg_score),2) from rows where avg_score is not null),0)
   ),
   'recent_evaluations',coalesce((
     select jsonb_agg(to_jsonb(x) order by x.evaluation_date desc,x.created_at desc)
     from (
       select e.id,e.organization_id,e.supplier_id,s.name supplier_name,e.evaluation_date,
         e.quality_score,e.delivery_score,e.service_score,e.commercial_score,e.overall_score,
         e.notes,e.created_at,p.full_name,p.email
       from public.bf19_supplier_evaluations e
       join public.bf7_suppliers s on s.id=e.supplier_id
       left join public.bf_profiles p on p.id=e.created_by
       where e.evaluation_date between p_from and p_to
         and (p_org is null or e.organization_id=p_org)
         and public.bf19_can(e.organization_id,'supplier-performance.view')
       order by e.evaluation_date desc,e.created_at desc
       limit 50
     ) x
   ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function public.bf19_can(uuid,text),
 public.bf19_evaluate(uuid,integer,integer,integer,integer,text,date),
 public.bf19_dashboard(uuid,date,date,integer) from public,anon;

grant execute on function public.bf19_can(uuid,text),
 public.bf19_evaluate(uuid,integer,integer,integer,integer,text,date),
 public.bf19_dashboard(uuid,date,date,integer) to authenticated;

insert into public.bf_migrations(version) values(19);
commit;
