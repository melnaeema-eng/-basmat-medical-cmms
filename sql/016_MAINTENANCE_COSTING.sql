-- Basmat Facilities CMMS — Sprint 15
-- Maintenance Cost Control
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=14) then raise exception 'Install Sprint 14 first'; end if;
 if exists(select 1 from public.bf_migrations where version=15) then raise exception 'Sprint 15 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('costing.view','View maintenance costs'),('costing.manage','Manage maintenance costs')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'costing.%')
   or (r.code='supervisor' and p.code='costing.view')
on conflict do nothing;

create table public.bf15_labor_rates(
 organization_id uuid not null references public.bf_organizations(id),
 technician_id uuid not null references public.bf_profiles(id),
 hourly_rate numeric(18,4) not null check(hourly_rate>=0),
 currency text not null default 'SAR' check(currency ~ '^[A-Z]{3}$'),
 effective_from date not null default current_date,
 effective_to date,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(organization_id,technician_id,effective_from),check(effective_to is null or effective_to>=effective_from)
);

create table public.bf15_work_order_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 work_order_id uuid not null references public.bf_work_orders(id),
 cost_type text not null check(cost_type in('contractor','transport','rental','other')),
 description text not null check(length(btrim(description)) between 3 and 500),
 amount numeric(18,2) not null check(amount>=0),currency text not null default 'SAR' check(currency ~ '^[A-Z]{3}$'),
 cost_date date not null default current_date,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 status text not null default 'active' check(status in('active','void')),voided_by uuid references auth.users(id),voided_at timestamptz,void_reason text
);
create index bf15_cost_wo on public.bf15_work_order_costs(work_order_id,cost_date desc);

do $$ declare t text;begin
 foreach t in array array['bf15_labor_rates','bf15_work_order_costs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;end $$;

create or replace function public.bf15_can(p_org uuid,p_perm text) returns boolean language sql stable security definer set search_path='' as $$select public.bf4_staff(p_org,p_perm);$$;
create policy bf15_rate_read on public.bf15_labor_rates for select to authenticated using(public.bf15_can(organization_id,'costing.view'));
create policy bf15_cost_read on public.bf15_work_order_costs for select to authenticated using(public.bf15_can(organization_id,'costing.view'));

create or replace function public.bf15_save_rate(p_org uuid,p_technician uuid,p_rate numeric,p_currency text,p_from date,p_to date default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.bf15_can(p_org,'costing.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if p_rate is null or p_rate<0 or p_from is null or (p_to is not null and p_to<p_from) then raise exception 'Invalid rate';end if;
 if not exists(select 1 from public.bf_user_roles where organization_id=p_org and user_id=p_technician) then raise exception 'Technician not in organization';end if;
 insert into public.bf15_labor_rates values(p_org,p_technician,p_rate,upper(coalesce(p_currency,'SAR')),p_from,p_to,auth.uid(),now())
 on conflict(organization_id,technician_id,effective_from) do update set hourly_rate=excluded.hourly_rate,currency=excluded.currency,effective_to=excluded.effective_to,updated_by=auth.uid(),updated_at=now();
end $$;

create or replace function public.bf15_add_cost(p_work_order uuid,p_type text,p_description text,p_amount numeric,p_currency text,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.bf_work_orders;cid uuid;begin
 select * into w from public.bf_work_orders where id=p_work_order;if not found then raise exception 'Work order not found';end if;
 if not public.bf15_can(w.organization_id,'costing.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if p_type not in('contractor','transport','rental','other') or length(btrim(coalesce(p_description,'')))<3 or p_amount is null or p_amount<0 then raise exception 'Invalid cost';end if;
 insert into public.bf15_work_order_costs(organization_id,work_order_id,cost_type,description,amount,currency,cost_date,created_by)
 values(w.organization_id,w.id,p_type,btrim(p_description),p_amount,upper(coalesce(p_currency,'SAR')),coalesce(p_date,current_date),auth.uid()) returning id into cid;return cid;end $$;

create or replace function public.bf15_void_cost(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.bf15_work_order_costs;begin
 select * into c from public.bf15_work_order_costs where id=p_id for update;if not found then raise exception 'Cost not found';end if;
 if not public.bf15_can(c.organization_id,'costing.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if c.status<>'active' or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Void reason is required';end if;
 update public.bf15_work_order_costs set status='void',voided_by=auth.uid(),voided_at=now(),void_reason=btrim(p_reason) where id=p_id;end $$;

create or replace function public.bf15_center(p_org uuid default null,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 with wo as (
  select w.id,w.organization_id,w.work_order_number,w.title,w.status,w.created_at
  from public.bf_work_orders w where (p_org is null or w.organization_id=p_org) and public.bf15_can(w.organization_id,'costing.view') order by w.created_at desc limit greatest(1,least(coalesce(p_limit,200),500))
 ),labor as (
  select v.work_order_id,sum((l.minutes::numeric/60)*coalesce((select r.hourly_rate from public.bf15_labor_rates r where r.organization_id=l.organization_id and r.technician_id=l.technician_id and r.effective_from<=l.started_at::date and (r.effective_to is null or r.effective_to>=l.started_at::date) order by r.effective_from desc limit 1),0)) labor_cost
  from public.bf9_labor l join public.bf9_visits v on v.id=l.visit_id where exists(select 1 from wo x where x.id=v.work_order_id) group by v.work_order_id
 ),material as (
  select mr.work_order_id,sum(coalesce(a.consumed_qty,0)*coalesce(ac.unit_cost,0)) material_cost
  from public.bf8_material_requests mr join public.bf8_material_lines ml on ml.request_id=mr.id join public.bf8_allocations a on a.line_id=ml.id left join public.bf8_allocation_costs ac on ac.allocation_id=a.id
  where exists(select 1 from wo x where x.id=mr.work_order_id) group by mr.work_order_id
 ),extra as (
  select work_order_id,sum(amount) extra_cost from public.bf15_work_order_costs where status='active' and exists(select 1 from wo x where x.id=work_order_id) group by work_order_id
 ),rows as (
  select w.*,coalesce(l.labor_cost,0)::numeric(18,2) labor_cost,coalesce(m.material_cost,0)::numeric(18,2) material_cost,coalesce(e.extra_cost,0)::numeric(18,2) extra_cost,
   (coalesce(l.labor_cost,0)+coalesce(m.material_cost,0)+coalesce(e.extra_cost,0))::numeric(18,2) total_cost
  from wo w left join labor l on l.work_order_id=w.id left join material m on m.work_order_id=w.id left join extra e on e.work_order_id=w.id)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from rows r),'[]'::jsonb),
 'totals',jsonb_build_object('labor',coalesce((select sum(labor_cost) from rows),0),'material',coalesce((select sum(material_cost) from rows),0),'extra',coalesce((select sum(extra_cost) from rows),0),'grand',coalesce((select sum(total_cost) from rows),0)),
 'rates',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,p.full_name,p.email from public.bf15_labor_rates r join public.bf_profiles p on p.id=r.technician_id where (p_org is null or r.organization_id=p_org) and public.bf15_can(r.organization_id,'costing.view'))x),'[]'::jsonb),
 'extra_costs',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.bf15_work_order_costs c where c.status='active' and (p_org is null or c.organization_id=p_org) and public.bf15_can(c.organization_id,'costing.view')),'[]'::jsonb)) into result;return result;end $$;

revoke all on function public.bf15_can(uuid,text),public.bf15_save_rate(uuid,uuid,numeric,text,date,date),public.bf15_add_cost(uuid,text,text,numeric,text,date),public.bf15_void_cost(uuid,text),public.bf15_center(uuid,integer) from public,anon;
grant execute on function public.bf15_can(uuid,text),public.bf15_save_rate(uuid,uuid,numeric,text,date,date),public.bf15_add_cost(uuid,text,text,numeric,text,date),public.bf15_void_cost(uuid,text),public.bf15_center(uuid,integer) to authenticated;
insert into public.bf_migrations(version) values(15);
commit;
