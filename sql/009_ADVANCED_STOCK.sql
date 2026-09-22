-- Basmat Facilities CMMS | Sprint 8 | Controlled advanced stock operations.
-- Requires migration 008. Does not migrate, merge, or alter legacy balances.
begin;
do $$
begin
 if to_regclass('public.bf7_stock_lots') is null
    or to_regclass('public.bf_inv_parts') is null
    or to_regclass('public.bf_work_orders') is null
    or to_regclass('public.bf7_stock_moves') is null
    or not exists(select 1 from public.bf_migrations where version=7)
 then raise exception 'Sprint 7 migration 008 is required'; end if;
 if exists(select 1 from public.bf_migrations where version=8)
 then raise exception 'Sprint 8 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('inventory.cost.view','View internal inventory consumption costs')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code in('company_admin','facility_manager','maintenance_manager')
and p.code='inventory.cost.view'
on conflict do nothing;

create table public.bf8_material_requests(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 work_order_id uuid not null,
 number text not null,
 status text not null default 'submitted'
  check(status in('submitted','approved','rejected','cancelled','closed')),
 reason text not null check(length(btrim(reason))>=5),
 created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 approved_at timestamptz,closed_at timestamptz,closing_reason text,
 unique(organization_id,number),unique(id,organization_id),
 foreign key(work_order_id) references public.bf_work_orders(id)
);
create sequence public.bf8_request_seq;
revoke all on sequence public.bf8_request_seq from public,anon,authenticated;

create table public.bf8_material_lines(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 request_id uuid not null,
 part_id uuid not null,
 owner_client_id uuid,
 quantity numeric(18,3) not null check(quantity>0),
 reserved_qty numeric(18,3) not null default 0,
 issued_qty numeric(18,3) not null default 0,
 received_qty numeric(18,3) not null default 0,
 consumed_qty numeric(18,3) not null default 0,
 returned_received_qty numeric(18,3) not null default 0,
 returned_unreceived_qty numeric(18,3) not null default 0,
unique nulls not distinct (request_id,part_id,owner_client_id),
 unique(id,organization_id),
 foreign key(request_id,organization_id) references public.bf8_material_requests(id,organization_id),
 foreign key(part_id,organization_id) references public.bf_inv_parts(id,organization_id),
 foreign key(owner_client_id,organization_id) references public.bf_clients(id,organization_id),
 check(reserved_qty>=0 and issued_qty>=0 and received_qty>=0 and consumed_qty>=0
   and returned_received_qty>=0 and returned_unreceived_qty>=0),
 check(reserved_qty+issued_qty<=quantity),
 check(received_qty+returned_unreceived_qty<=issued_qty),
 check(consumed_qty+returned_received_qty<=received_qty)
);
create table public.bf8_allocations(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 line_id uuid not null,
 stock_lot_id uuid not null,
 reserved_qty numeric(18,3) not null default 0,
 issued_qty numeric(18,3) not null default 0,
 received_qty numeric(18,3) not null default 0,
 consumed_qty numeric(18,3) not null default 0,
 returned_received_qty numeric(18,3) not null default 0,
 returned_unreceived_qty numeric(18,3) not null default 0,
 unique(line_id,stock_lot_id),
 unique(id,organization_id),
 foreign key(line_id,organization_id) references public.bf8_material_lines(id,organization_id),
 foreign key(stock_lot_id,organization_id) references public.bf7_stock_lots(id,organization_id),
 check(reserved_qty>=0 and issued_qty>=0 and received_qty>=0 and consumed_qty>=0
   and returned_received_qty>=0 and returned_unreceived_qty>=0),
 check(received_qty+returned_unreceived_qty<=issued_qty),
 check(consumed_qty+returned_received_qty<=received_qty)
);
-- Commercial values are deliberately kept out of the technician-facing tables.
create table public.bf8_allocation_costs(
 allocation_id uuid primary key references public.bf8_allocations(id),
 organization_id uuid not null references public.bf_organizations(id),
 unit_cost numeric(18,4) not null check(unit_cost>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now()
);
create table public.bf8_material_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.bf_organizations(id),
 request_id uuid not null references public.bf8_material_requests(id),
 line_id uuid references public.bf8_material_lines(id),
 allocation_id uuid references public.bf8_allocations(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 quantity numeric(18,3),
 stock_snapshot jsonb,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.bf8_idempotency(
 key uuid primary key,
 organization_id uuid not null,
 actor_id uuid not null,
 request_id uuid not null,
 action text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);

do $$ declare t text;
begin
 foreach t in array array['bf8_material_requests','bf8_material_lines',
 'bf8_allocations','bf8_allocation_costs','bf8_material_events','bf8_idempotency']
 loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.bf8_material_requests,public.bf8_material_lines,
 public.bf8_allocations,public.bf8_material_events to authenticated;
create policy bf8_requests_read on public.bf8_material_requests for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf8_lines_read on public.bf8_material_lines for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf8_allocations_read on public.bf8_allocations for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf8_events_read on public.bf8_material_events for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf8_costs_read on public.bf8_allocation_costs for select to authenticated
using(public.bf4_staff(organization_id,'inventory.cost.view'));

-- Idempotency is checked under a transaction advisory lock. An identical
-- retry returns the original request; changed payloads or actors are rejected.
create or replace function public.bf8_action(
 p_action text,p_request uuid,p_data jsonb default '{}'::jsonb,p_key uuid default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 r public.bf8_material_requests;
 l public.bf8_material_lines;
 a public.bf8_allocations;
 st public.bf7_stock_lots;
 wo public.bf_work_orders;
 old_event public.bf8_idempotency;
 org uuid; v uuid; q numeric(18,3); remaining numeric(18,3);
 owner_id uuid; stock_id uuid; line_id uuid; allocation_id uuid; cost_allocation_id uuid;
 manager boolean; approver boolean; executor boolean;
 snapshot jsonb; event_details jsonb:='{}'::jsonb;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_key is null then raise exception 'Idempotency key required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768
 then raise exception 'Invalid payload';end if;
 if p_action not in('create','add_line','submit','approve','reject','reserve',
 'release','issue','receive','consume','return','cancel','close')
 then raise exception 'Invalid action';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into old_event from public.bf8_idempotency where key=p_key;
 if found then
  if old_event.actor_id<>auth.uid() or old_event.action<>p_action
   or old_event.payload is distinct from p_data
   or (p_request is not null and old_event.request_id<>p_request)
   or not public.bf4_staff(old_event.organization_id,'inventory.view')
  then raise exception 'Idempotency key conflict' using errcode='42501';end if;
  return old_event.request_id;
 end if;

 if p_action='create' then
  select * into wo from public.bf_work_orders where id=(p_data->>'work_order_id')::uuid;
  if not found or wo.status in('closed','cancelled') then raise exception 'Active work order required';end if;
  org:=wo.organization_id;
  if not(public.bf4_staff(org,'inventory.request') or
   (public.bf4_staff(org,'corrective.execute') and public.bf4_assigned(wo.id)))
  then raise exception 'Permission denied' using errcode='42501';end if;
  insert into public.bf8_material_requests(organization_id,work_order_id,number,reason,created_by)
  values(org,wo.id,'AMR-'||to_char(now(),'YYYY')||'-'||
   lpad(nextval('public.bf8_request_seq')::text,6,'0'),p_data->>'reason',auth.uid())
  returning * into r;
 else
  select * into r from public.bf8_material_requests where id=p_request for update;
  if not found then raise exception 'Material request not found';end if;
  org:=r.organization_id;
 end if;
 manager:=public.bf4_staff(org,'inventory.manage');
 approver:=public.bf4_staff(org,'inventory.approve');
 executor:=public.bf4_staff(org,'inventory.request') and
  (r.created_by=auth.uid() or public.bf4_assigned(r.work_order_id));
 if p_action<>'create' and not(manager or approver or executor)
 then raise exception 'Permission denied' using errcode='42501';end if;

 if p_action='add_line' then
  if r.status<>'submitted' or not(manager or executor) then raise exception 'Request is not editable';end if;
  -- No quantities may have been approved or allocated before editing.
  if r.approved_at is not null then raise exception 'Approved request is immutable';end if;
  select * into wo from public.bf_work_orders where id=r.work_order_id;
  select id into v
   from public.bf_inv_parts where id=(p_data->>'part_id')::uuid
   and organization_id=r.organization_id and status='active';
  if not found then raise exception 'Invalid part';end if;
  owner_id:=nullif(p_data->>'owner_client_id','')::uuid;
  if owner_id is not null and owner_id<>wo.client_id then raise exception 'Stock owner must match work order client';end if;
  q:=(p_data->>'quantity')::numeric;
  if q is null or q<=0 then raise exception 'Positive quantity required';end if;
  insert into public.bf8_material_lines(organization_id,request_id,part_id,owner_client_id,quantity)
  values(r.organization_id,r.id,v,owner_id,q)
  on conflict(request_id,part_id,owner_client_id) do update set quantity=excluded.quantity
  returning id into line_id;
 elsif p_action='submit' then
  -- Requests start submitted; explicit submit is retained as a validation action.
  if r.status<>'submitted' or not(manager or executor) or
   not exists(select 1 from public.bf8_material_lines where request_id=r.id)
  then raise exception 'Request requires at least one line';end if;
 elsif p_action in('approve','reject') then
  if not approver or r.status<>'submitted' or r.created_by=auth.uid()
  then raise exception 'Independent approval required or invalid state' using errcode='42501';end if;
  if not exists(select 1 from public.bf8_material_lines where request_id=r.id)
  then raise exception 'Add material lines first';end if;
  if p_action='reject' and length(btrim(coalesce(p_data->>'reason','')))<5
  then raise exception 'Rejection reason required';end if;
  update public.bf8_material_requests set status=case when p_action='approve' then 'approved' else 'rejected' end,
   approved_by=auth.uid(),approved_at=now(),closing_reason=p_data->>'reason' where id=r.id;
 elsif p_action in('reserve','release','issue','receive','consume','return') then
  if r.status<>'approved' then raise exception 'Approved request required';end if;
  line_id:=(p_data->>'line_id')::uuid;
  select * into l from public.bf8_material_lines where id=line_id and request_id=r.id for update;
  if not found then raise exception 'Invalid material line';end if;
  q:=(p_data->>'quantity')::numeric;
  if q is null or q<=0 then raise exception 'Positive quantity required';end if;
  if p_action in('reserve','release','issue','return') and not manager
   or p_action in('receive','consume') and not(manager or executor)
  then raise exception 'Permission denied' using errcode='42501';end if;
  allocation_id:=nullif(p_data->>'allocation_id','')::uuid;
  if p_action='reserve' then
   stock_id:=(p_data->>'stock_lot_id')::uuid;
   select * into st from public.bf7_stock_lots where id=stock_id and organization_id=org for update;
   if not found or st.part_id<>l.part_id or st.owner_client_id is distinct from l.owner_client_id
   then raise exception 'Stock identity or owner mismatch';end if;
   if st.expires_on is not null and st.expires_on<current_date
   then raise exception 'Expired stock cannot be reserved';end if;
   if not exists(select 1 from public.bf_inv_parts where id=st.part_id and status='active')
   or not exists(select 1 from public.bf_inv_warehouses where id=st.warehouse_id and status='active')
   then raise exception 'Stock location or part is inactive';end if;
   if st.serial_number<>'' and q<>1 then raise exception 'Serialized stock requires a whole unit';end if;
   if not exists(select 1 from public.bf_work_orders where id=r.work_order_id and status not in('closed','cancelled'))
   then raise exception 'Work order is closed';end if;
   if st.quantity-st.reserved<q or l.quantity-l.issued_qty-l.reserved_qty<q
   then raise exception 'Insufficient available or requested quantity';end if;
   insert into public.bf8_allocations(organization_id,line_id,stock_lot_id,reserved_qty)
   values(org,l.id,st.id,q)
   on conflict(line_id,stock_lot_id) do update set reserved_qty=public.bf8_allocations.reserved_qty+excluded.reserved_qty
   returning id into allocation_id;
   update public.bf7_stock_lots set reserved=reserved+q where id=st.id;
   update public.bf8_material_lines set reserved_qty=reserved_qty+q where id=l.id;
   insert into public.bf8_allocation_costs(allocation_id,organization_id,unit_cost,currency)
   values(allocation_id,org,st.unit_cost,st.currency)
   on conflict(allocation_id) do nothing;
   cost_allocation_id:=allocation_id;
   if exists(select 1 from public.bf8_allocation_costs c
    where c.allocation_id=cost_allocation_id
    and (c.unit_cost<>st.unit_cost or c.currency<>st.currency))
   then raise exception 'Allocation cost changed; use a separate valuation allocation';end if;
  else
   select * into a from public.bf8_allocations where id=allocation_id and line_id=l.id for update;
   if not found then raise exception 'Invalid allocation';end if;
   select * into st from public.bf7_stock_lots where id=a.stock_lot_id and organization_id=org for update;
   if not found or st.part_id<>l.part_id
    or st.owner_client_id is distinct from l.owner_client_id
   then raise exception 'Stock lot identity mismatch';end if;
   if st.serial_number<>'' and q<>1 then raise exception 'Serialized stock requires a whole unit';end if;
   if p_action='release' then
    if a.reserved_qty<q then raise exception 'Insufficient reservation';end if;
    update public.bf7_stock_lots set reserved=reserved-q where id=st.id;
    update public.bf8_allocations set reserved_qty=reserved_qty-q where id=a.id;
    update public.bf8_material_lines set reserved_qty=reserved_qty-q where id=l.id;
   elsif p_action='issue' then
    if a.reserved_qty<q or st.quantity<q then raise exception 'Insufficient reservation';end if;
    if not exists(select 1 from public.bf_work_orders where id=r.work_order_id and status not in('closed','cancelled'))
    then raise exception 'Work order is closed';end if;
    update public.bf7_stock_lots set quantity=quantity-q,reserved=reserved-q where id=st.id;
    update public.bf8_allocations set reserved_qty=reserved_qty-q,issued_qty=issued_qty+q where id=a.id;
    update public.bf8_material_lines set reserved_qty=reserved_qty-q,issued_qty=issued_qty+q where id=l.id;
   elsif p_action='receive' then
    remaining:=a.issued_qty-a.received_qty-a.returned_unreceived_qty;
    if remaining<q then raise exception 'Quantity not awaiting receipt';end if;
    update public.bf8_allocations set received_qty=received_qty+q where id=a.id;
    update public.bf8_material_lines set received_qty=received_qty+q where id=l.id;
   elsif p_action='consume' then
    remaining:=a.received_qty-a.consumed_qty-a.returned_received_qty;
    if remaining<q then raise exception 'Quantity not available for consumption';end if;
    update public.bf8_allocations set consumed_qty=consumed_qty+q where id=a.id;
    update public.bf8_material_lines set consumed_qty=consumed_qty+q where id=l.id;
   elsif p_action='return' then
    if p_data->>'custody'='received' then
     remaining:=a.received_qty-a.consumed_qty-a.returned_received_qty;
     if remaining<q then raise exception 'Insufficient returnable received quantity';end if;
     update public.bf8_allocations set returned_received_qty=returned_received_qty+q where id=a.id;
     update public.bf8_material_lines set returned_received_qty=returned_received_qty+q where id=l.id;
    elsif p_data->>'custody'='unreceived' then
     remaining:=a.issued_qty-a.received_qty-a.returned_unreceived_qty;
     if remaining<q then raise exception 'Insufficient returnable issued quantity';end if;
     update public.bf8_allocations set returned_unreceived_qty=returned_unreceived_qty+q where id=a.id;
     update public.bf8_material_lines set returned_unreceived_qty=returned_unreceived_qty+q where id=l.id;
    else raise exception 'Return custody must be received or unreceived';end if;
    if st.expires_on is not null and st.expires_on<current_date
    then raise exception 'Expired returns require quarantine workflow';end if;
    if not exists(select 1 from public.bf_inv_warehouses where id=st.warehouse_id and status='active')
    then raise exception 'Inactive warehouse';end if;
    -- Serial numbers remain attached to the same stock identity. A serial may
    -- only return to a zero-balance row; other serialized quantities are rejected.
    if st.serial_number<>'' and (q<>1 or st.quantity<>0) then raise exception 'Serialized return conflict';end if;
    update public.bf7_stock_lots set quantity=quantity+q where id=st.id;
   end if;
  end if;
  if p_action in('issue','return') then
   insert into public.bf7_stock_moves(organization_id,part_id,source_lot_id,destination_lot_id,
    action,quantity,reference,work_order_id,actor_id)
   values(org,l.part_id,case when p_action='issue' then st.id else null end,
    case when p_action='return' then st.id else null end,p_action,q,
    r.number||' / '||left(coalesce(p_data->>'reference',p_action),100),r.work_order_id,auth.uid());
  end if;
  snapshot:=jsonb_build_object('part_id',st.part_id,'owner_client_id',st.owner_client_id,
   'lot_code',st.lot_code,'serial_number',st.serial_number,'expires_on',st.expires_on,
   'warehouse_id',st.warehouse_id,'bin_id',st.bin_id);
  insert into public.bf8_material_events(organization_id,request_id,line_id,allocation_id,actor_id,action,quantity,stock_snapshot,details)
  values(org,r.id,l.id,allocation_id,auth.uid(),p_action,q,snapshot,
   jsonb_build_object('custody',p_data->>'custody','reference',p_data->>'reference'));
 elsif p_action='cancel' then
  if not(manager or executor) or r.status not in('submitted','approved')
  then raise exception 'Invalid cancellation';end if;
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Cancellation reason required';end if;
  if exists(select 1 from public.bf8_material_lines where request_id=r.id and issued_qty>0)
  then raise exception 'Issued requests must be closed after custody reconciliation';end if;
  -- Release allocations in deterministic order, locking each stock row.
  for a in select a0.* from public.bf8_allocations a0
   join public.bf8_material_lines l0 on l0.id=a0.line_id
   where l0.request_id=r.id order by a0.stock_lot_id,a0.id
  loop
   select * into st from public.bf7_stock_lots where id=a.stock_lot_id for update;
   update public.bf7_stock_lots set reserved=reserved-a.reserved_qty where id=st.id;
   update public.bf8_allocations set reserved_qty=0 where id=a.id;
  end loop;
  update public.bf8_material_lines set reserved_qty=0 where request_id=r.id;
  update public.bf8_material_requests set status='cancelled',closed_at=now(),closing_reason=p_data->>'reason' where id=r.id;
 elsif p_action='close' then
  if not manager or r.status<>'approved' then raise exception 'Manager approval required';end if;
  if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Closing reason required';end if;
  if exists(select 1 from public.bf8_material_lines where request_id=r.id
   and (reserved_qty>0 or issued_qty<>consumed_qty+returned_received_qty+returned_unreceived_qty))
  then raise exception 'Release reservations and reconcile all issued stock first';end if;
  update public.bf8_material_requests set status='closed',closed_at=now(),closing_reason=p_data->>'reason' where id=r.id;
 end if;
 if p_action not in('reserve','release','issue','receive','consume','return') then
  insert into public.bf8_material_events(organization_id,request_id,line_id,actor_id,action,details)
  values(org,r.id,line_id,auth.uid(),p_action,p_data);
 end if;
 insert into public.bf8_idempotency(key,organization_id,actor_id,request_id,action,payload)
 values(p_key,org,auth.uid(),r.id,p_action,p_data);
 return r.id;
end $$;
revoke all on function public.bf8_action(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.bf8_action(text,uuid,jsonb,uuid) to authenticated;

-- Cost totals are grouped by currency; unlike the operational tables they
-- cannot be read by the general inventory-view permission.
create or replace function public.bf8_costs(p_org uuid,p_work_order uuid default null)
returns table(work_order_id uuid,currency text,actual_cost numeric)
language sql stable security definer set search_path=''
as $$
 select r.work_order_id,c.currency,sum(a.consumed_qty*c.unit_cost)
 from public.bf8_material_requests r
 join public.bf8_material_lines l on l.request_id=r.id
 join public.bf8_allocations a on a.line_id=l.id
 join public.bf8_allocation_costs c on c.allocation_id=a.id
 where r.organization_id=p_org and (p_work_order is null or r.work_order_id=p_work_order)
 and public.bf4_staff(p_org,'inventory.cost.view')
 group by r.work_order_id,c.currency;
$$;
revoke all on function public.bf8_costs(uuid,uuid) from public,anon;
grant execute on function public.bf8_costs(uuid,uuid) to authenticated;
insert into public.bf_migrations(version) values(8);
commit;
