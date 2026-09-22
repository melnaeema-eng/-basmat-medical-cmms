-- Sprint 7: Procurement and traceable-stock foundation.
-- Creates a separate owner/lot-aware stock ledger. Existing Sprint 6 balances
-- remain untouched and cannot be silently merged into this ledger.
begin;
do $$ begin
 if not exists(select 1 from public.bf_migrations where version=6) then raise exception 'Install migration 007 first';end if;
 if exists(select 1 from public.bf_migrations where version=7) then raise exception 'Sprint 7 already installed';end if;
end $$;
insert into public.bf_permissions(code,description) values
('procurement.view','View procurement'),('procurement.manage','Manage suppliers and purchasing'),
('procurement.request','Submit purchase requisitions'),('procurement.approve','Approve purchasing')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'procurement.%')
or (r.code='store_keeper' and p.code in('procurement.view','procurement.request'))
or (r.code='supervisor' and p.code in('procurement.view','procurement.request'))
on conflict do nothing;

create table public.bf7_suppliers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 code text not null,name text not null check(length(btrim(name))>=2),
 tax_number text,contact_name text,email text,phone text,address text,
 status text not null default 'active' check(status in('active','inactive','archived')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,code),unique(id,organization_id)
);
create table public.bf7_requisitions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 number text not null,work_order_id uuid,reason text not null,
 status text not null default 'draft' check(status in('draft','submitted','approved','rejected','ordered','cancelled')),
 created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),approved_at timestamptz,
 unique(organization_id,number),unique(id,organization_id),
 foreign key(work_order_id) references public.bf_work_orders(id)
);
create table public.bf7_requisition_lines(
 id uuid primary key default gen_random_uuid(),requisition_id uuid not null references public.bf7_requisitions(id),
 part_id uuid not null references public.bf_inv_parts(id),
 quantity numeric(18,3) not null check(quantity>0),notes text,
 unique(requisition_id,part_id)
);
create table public.bf7_purchase_orders(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 requisition_id uuid not null, supplier_id uuid not null,
 number text not null,number_mode text not null default 'automatic' check(number_mode in('automatic','manual')),
 currency text not null default 'SAR' check(currency ~ '^[A-Z]{3}$'),
 status text not null default 'draft' check(status in('draft','approved','part_received','received','cancelled')),
 approved_by uuid references auth.users(id),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),approved_at timestamptz,
 unique(organization_id,number),
 unique(id,organization_id),
 foreign key(requisition_id,organization_id) references public.bf7_requisitions(id,organization_id),
 foreign key(supplier_id,organization_id) references public.bf7_suppliers(id,organization_id)
);
create unique index bf7_one_live_po_per_pr on public.bf7_purchase_orders(requisition_id) where status<>'cancelled';
create table public.bf7_po_lines(
 id uuid primary key default gen_random_uuid(),po_id uuid not null references public.bf7_purchase_orders(id),
 part_id uuid not null references public.bf_inv_parts(id),
 quantity numeric(18,3) not null check(quantity>0),
 unit_price numeric(18,4) not null check(unit_price>=0),
 received_qty numeric(18,3) not null default 0 check(received_qty>=0 and received_qty<=quantity),
 unique(po_id,part_id)
);
create table public.bf7_stock_lots(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.bf_organizations(id),
 part_id uuid not null,owner_client_id uuid,lot_code text not null default '',
 serial_number text not null default '',expires_on date,
 warehouse_id uuid not null,bin_id uuid not null,
 quantity numeric(18,3) not null default 0 check(quantity>=0),
 reserved numeric(18,3) not null default 0 check(reserved>=0 and reserved<=quantity),
 unit_cost numeric(18,4) not null default 0 check(unit_cost>=0),currency text not null default 'SAR',
 created_at timestamptz not null default now(),
 unique(id,organization_id),
 foreign key(part_id,organization_id) references public.bf_inv_parts(id,organization_id),
 foreign key(owner_client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(warehouse_id,organization_id) references public.bf_inv_warehouses(id,organization_id),
 foreign key(bin_id,organization_id,warehouse_id) references public.bf_inv_bins(id,organization_id,warehouse_id),
 check(serial_number='' or quantity<=1)
);
create unique index bf7_stock_identity on public.bf7_stock_lots(
 organization_id,part_id,bin_id,owner_client_id,lot_code,serial_number,expires_on,currency,unit_cost
) nulls not distinct;
create unique index bf7_serial_identity on public.bf7_stock_lots(organization_id,part_id,serial_number)
where serial_number<>'';
create table public.bf7_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 po_id uuid not null,po_line_id uuid not null,stock_lot_id uuid not null,
 number text not null,supplier_reference text not null,idempotency_key uuid not null,quantity numeric(18,3) not null check(quantity>0),
 owner_client_id uuid,lot_code text,serial_number text,expires_on date,
 received_by uuid not null references auth.users(id),received_at timestamptz not null default now(),
 unique(organization_id,number),unique(organization_id,idempotency_key),
 foreign key(po_id,organization_id) references public.bf7_purchase_orders(id,organization_id),
 foreign key(po_line_id) references public.bf7_po_lines(id),
 foreign key(stock_lot_id) references public.bf7_stock_lots(id)
);
create table public.bf7_stock_moves(
 id bigint generated always as identity primary key,organization_id uuid not null,
 part_id uuid not null,source_lot_id uuid, destination_lot_id uuid,
 action text not null check(action in('receipt','transfer','adjust_in','adjust_out','issue','return')),
 quantity numeric(18,3) not null check(quantity>0),reference text not null,
 work_order_id uuid,actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.bf7_events(
 id bigint generated always as identity primary key,organization_id uuid not null,
 entity text not null,entity_id uuid not null,actor_id uuid not null references auth.users(id),
 action text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create sequence public.bf7_supplier_seq;
create sequence public.bf7_pr_seq;
create sequence public.bf7_po_seq;
create sequence public.bf7_grn_seq;
do $$ declare s text;begin
 foreach s in array array['bf7_supplier_seq','bf7_pr_seq','bf7_po_seq','bf7_grn_seq'] loop
  execute format('revoke all on sequence public.%I from public,anon,authenticated',s);
 end loop;
end $$;
-- A single authorization helper is used for all new procurement tables.
create or replace function public.bf7_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$select public.bf4_staff(p_org,p_permission)$$;
do $$ declare t text;begin
 foreach t in array array['bf7_suppliers','bf7_requisitions','bf7_requisition_lines','bf7_purchase_orders','bf7_po_lines','bf7_stock_lots','bf7_receipts','bf7_stock_moves','bf7_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy bf7_suppliers_read on public.bf7_suppliers for select to authenticated
using(public.bf7_can(organization_id,'procurement.view'));
create policy bf7_pr_read on public.bf7_requisitions for select to authenticated
using(public.bf7_can(organization_id,'procurement.view'));
create policy bf7_prlines_read on public.bf7_requisition_lines for select to authenticated
using(exists(select 1 from public.bf7_requisitions r where r.id=requisition_id));
create policy bf7_po_read on public.bf7_purchase_orders for select to authenticated
using(public.bf7_can(organization_id,'procurement.view'));
create policy bf7_polines_read on public.bf7_po_lines for select to authenticated
using(exists(select 1 from public.bf7_purchase_orders p where p.id=po_id));
create policy bf7_stock_read on public.bf7_stock_lots for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf7_receipts_read on public.bf7_receipts for select to authenticated
using(public.bf7_can(organization_id,'procurement.view'));
create policy bf7_moves_read on public.bf7_stock_moves for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf7_events_read on public.bf7_events for select to authenticated
using(public.bf7_can(organization_id,'procurement.view'));

-- Validate tenant association for every request/line/PO record.
create or replace function public.bf7_action(p_kind text,p_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare org uuid; v uuid; req public.bf7_requisitions; po public.bf7_purchase_orders;
 ln public.bf7_po_lines; prior_receipt public.bf7_receipts; part public.bf_inv_parts; lot public.bf7_stock_lots;
 quantity_value numeric(18,3); price_value numeric(18,4); owner_id uuid; bin_id uuid;
 lot_text text; serial_text text; currency_text text; expiry date; key_id bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768 then raise exception 'Invalid payload';end if;
 if p_kind='supplier' and p_action='create' then
  org:=(p_data->>'organization_id')::uuid;
  if not public.bf7_can(org,'procurement.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  insert into public.bf7_suppliers(organization_id,code,name,tax_number,contact_name,email,phone,address,created_by)
  values(org,'SUP-'||lpad(nextval('public.bf7_supplier_seq')::text,6,'0'),p_data->>'name',p_data->>'tax_number',p_data->>'contact_name',p_data->>'email',p_data->>'phone',p_data->>'address',auth.uid()) returning id into v;
 elsif p_kind='requisition' then
  if p_action='create' then
   org:=(p_data->>'organization_id')::uuid;
   if not public.bf7_can(org,'procurement.request') then raise exception 'Permission denied' using errcode='42501';end if;
   if nullif(p_data->>'work_order_id','') is not null and not exists(select 1 from public.bf_work_orders where id=(p_data->>'work_order_id')::uuid and organization_id=org) then raise exception 'Invalid work order';end if;
   if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Requisition reason required';end if;
   insert into public.bf7_requisitions(organization_id,number,work_order_id,reason,created_by)
   values(org,'PR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf7_pr_seq')::text,6,'0'),nullif(p_data->>'work_order_id','')::uuid,p_data->>'reason',auth.uid()) returning id into v;
  else
   select * into req from public.bf7_requisitions where id=p_id for update;
   if not found then raise exception 'Requisition not found';end if;
   org:=req.organization_id;v:=req.id;
   if p_action='add_line' and req.status='draft' then
    if not(public.bf7_can(org,'procurement.manage') or (req.created_by=auth.uid() and public.bf7_can(org,'procurement.request'))) then raise exception 'Permission denied' using errcode='42501';end if;
    if not exists(select 1 from public.bf_inv_parts where id=(p_data->>'part_id')::uuid and organization_id=org and status='active') then raise exception 'Invalid part';end if;
    insert into public.bf7_requisition_lines(requisition_id,part_id,quantity,notes)
    values(req.id,(p_data->>'part_id')::uuid,(p_data->>'quantity')::numeric,p_data->>'notes')
    on conflict(requisition_id,part_id) do update set quantity=excluded.quantity,notes=excluded.notes;
   elsif p_action='submit' and req.status='draft' then
    if not(public.bf7_can(org,'procurement.manage') or (req.created_by=auth.uid() and public.bf7_can(org,'procurement.request'))) then raise exception 'Permission denied' using errcode='42501';end if;
    if not exists(select 1 from public.bf7_requisition_lines where requisition_id=req.id) then raise exception 'Add at least one line';end if;
    update public.bf7_requisitions set status='submitted' where id=req.id;
   elsif p_action in('approve','reject') and req.status='submitted' then
    if not public.bf7_can(org,'procurement.approve') then raise exception 'Permission denied' using errcode='42501';end if;
    if req.created_by=auth.uid() then raise exception 'Independent approval required';end if;
    if p_action='reject' and length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Rejection reason required';end if;
    update public.bf7_requisitions set status=case when p_action='approve' then 'approved' else 'rejected' end,approved_by=auth.uid(),approved_at=now() where id=req.id;
   else raise exception 'Invalid requisition transition';end if;
  end if;
 elsif p_kind='purchase_order' then
  if p_action='create' then
   select * into req from public.bf7_requisitions where id=(p_data->>'requisition_id')::uuid for update;
   if not found or req.status<>'approved' then raise exception 'Approved requisition required';end if;
   org:=req.organization_id;
   if not public.bf7_can(org,'procurement.manage') then raise exception 'Permission denied' using errcode='42501';end if;
   if not exists(select 1 from public.bf7_suppliers where id=(p_data->>'supplier_id')::uuid and organization_id=org and status='active') then raise exception 'Invalid supplier';end if;
   if not exists(select 1 from public.bf7_requisition_lines where requisition_id=req.id) then raise exception 'Requisition has no lines';end if;
   if jsonb_typeof(p_data->'prices')<>'object' then raise exception 'Line prices required';end if;
   if exists(select 1 from public.bf7_requisition_lines l where l.requisition_id=req.id
    and (nullif(p_data->'prices'->>(l.part_id::text),'') is null
    or (p_data->'prices'->>(l.part_id::text))::numeric<0)) then raise exception 'Valid prices required for every line';end if;
   if coalesce(p_data->>'number_mode','automatic')='manual' and length(btrim(coalesce(p_data->>'number','')))<3 then raise exception 'Official PO number required';end if;
   insert into public.bf7_purchase_orders(organization_id,requisition_id,supplier_id,number,number_mode,currency,created_by)
   values(org,req.id,(p_data->>'supplier_id')::uuid,
    case when coalesce(p_data->>'number_mode','automatic')='manual' then nullif(btrim(p_data->>'number'),'') else 'PO-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf7_po_seq')::text,6,'0') end,
    coalesce(p_data->>'number_mode','automatic'),coalesce(p_data->>'currency','SAR'),auth.uid()) returning * into po;
   insert into public.bf7_po_lines(po_id,part_id,quantity,unit_price)
   select po.id,l.part_id,l.quantity,(p_data->'prices'->>(l.part_id::text))::numeric
   from public.bf7_requisition_lines l where l.requisition_id=req.id;
   if exists(select 1 from public.bf7_po_lines where po_id=po.id and unit_price is null) then raise exception 'Missing price';end if;
   update public.bf7_requisitions set status='ordered' where id=req.id;
   v:=po.id;
  else
   select * into po from public.bf7_purchase_orders where id=p_id for update;
   if not found then raise exception 'Purchase order not found';end if;
   org:=po.organization_id;v:=po.id;
   if p_action='approve' and po.status='draft' then
    if not public.bf7_can(org,'procurement.approve') then raise exception 'Permission denied' using errcode='42501';end if;
    if po.created_by=auth.uid() then raise exception 'Independent approval required';end if;
    update public.bf7_purchase_orders set status='approved',approved_by=auth.uid(),approved_at=now() where id=po.id;
   elsif p_action='cancel' and po.status='draft' then
    if not public.bf7_can(org,'procurement.manage') then raise exception 'Permission denied' using errcode='42501';end if;
    update public.bf7_purchase_orders set status='cancelled' where id=po.id;
    update public.bf7_requisitions set status='approved' where id=po.requisition_id;
   elsif p_action='receive' and po.status in('approved','part_received') then
    if not(public.bf7_can(org,'procurement.manage') and public.bf4_staff(org,'inventory.manage')) then raise exception 'Procurement and inventory permissions required' using errcode='42501';end if;
    if nullif(p_data->>'idempotency_key','') is null then raise exception 'Receipt idempotency key required';end if;
    select * into prior_receipt from public.bf7_receipts where organization_id=org and idempotency_key=(p_data->>'idempotency_key')::uuid;
    if found then
     if prior_receipt.po_id<>po.id or prior_receipt.po_line_id is distinct from nullif(p_data->>'line_id','')::uuid
      or prior_receipt.quantity is distinct from (p_data->>'quantity')::numeric
      or prior_receipt.supplier_reference is distinct from p_data->>'supplier_reference'
      or prior_receipt.owner_client_id is distinct from nullif(p_data->>'owner_client_id','')::uuid
      or prior_receipt.lot_code is distinct from coalesce(p_data->>'lot_code','')
      or prior_receipt.serial_number is distinct from coalesce(p_data->>'serial_number','')
      or prior_receipt.expires_on is distinct from nullif(p_data->>'expires_on','')::date
      or not exists(select 1 from public.bf7_stock_lots where id=prior_receipt.stock_lot_id and bin_id=(p_data->>'bin_id')::uuid)
     then raise exception 'Receipt key was already used with different details';end if;
     return prior_receipt.id;
    end if;
    select * into ln from public.bf7_po_lines where id=(p_data->>'line_id')::uuid and po_id=po.id for update;
    if not found then raise exception 'Invalid PO line';end if;
    quantity_value:=(p_data->>'quantity')::numeric;
    if quantity_value is null or quantity_value<=0 or quantity_value>ln.quantity-ln.received_qty then raise exception 'Invalid receipt quantity';end if;
    if length(btrim(coalesce(p_data->>'supplier_reference','')))<3 then raise exception 'Supplier delivery reference required';end if;
    select * into part from public.bf_inv_parts where id=ln.part_id and organization_id=org and status='active';
    if not found then raise exception 'Part is not active';end if;
    bin_id:=(p_data->>'bin_id')::uuid;owner_id:=nullif(p_data->>'owner_client_id','')::uuid;
    if not exists(select 1 from public.bf_inv_bins b join public.bf_inv_warehouses w on w.id=b.warehouse_id where b.id=bin_id and b.organization_id=org and w.status='active') then raise exception 'Invalid bin';end if;
    if owner_id is not null and not exists(select 1 from public.bf_clients where id=owner_id and organization_id=org) then raise exception 'Invalid stock owner';end if;
    lot_text:=coalesce(p_data->>'lot_code','');serial_text:=coalesce(p_data->>'serial_number','');
    expiry:=nullif(p_data->>'expires_on','')::date;
    if serial_text<>'' and quantity_value<>1 then raise exception 'Serialized receipts require quantity one';end if;
    if serial_text<>'' and exists(select 1 from public.bf7_stock_lots where organization_id=org and part_id=ln.part_id and serial_number=serial_text) then raise exception 'Serial already exists';end if;
    if expiry is not null and expiry<current_date then raise exception 'Expired stock cannot be received';end if;
    -- Exact cost/currency and owner are part of the stock identity.
    insert into public.bf7_stock_lots(organization_id,part_id,owner_client_id,lot_code,serial_number,expires_on,warehouse_id,bin_id,quantity,unit_cost,currency)
    select org,ln.part_id,owner_id,lot_text,serial_text,expiry,b.warehouse_id,b.id,quantity_value,ln.unit_price,po.currency
    from public.bf_inv_bins b where b.id=bin_id
    on conflict(organization_id,part_id,bin_id,owner_client_id,lot_code,serial_number,expires_on,currency,unit_cost)
    do update set quantity=public.bf7_stock_lots.quantity+excluded.quantity
    returning * into lot;
    if lot.expires_on is distinct from expiry then raise exception 'Lot expiry mismatch';end if;
    insert into public.bf7_receipts(organization_id,po_id,po_line_id,stock_lot_id,number,supplier_reference,idempotency_key,quantity,owner_client_id,lot_code,serial_number,expires_on,received_by)
    values(org,po.id,ln.id,lot.id,'GRN-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf7_grn_seq')::text,6,'0'),p_data->>'supplier_reference',(p_data->>'idempotency_key')::uuid,quantity_value,owner_id,lot_text,serial_text,expiry,auth.uid()) returning id into v;
    update public.bf7_po_lines set received_qty=received_qty+quantity_value where id=ln.id;
    update public.bf7_purchase_orders set status=case when not exists(select 1 from public.bf7_po_lines where po_id=po.id and received_qty<quantity) then 'received' else 'part_received' end where id=po.id;
    insert into public.bf7_stock_moves(organization_id,part_id,destination_lot_id,action,quantity,reference,actor_id)
    values(org,ln.part_id,lot.id,'receipt',quantity_value,p_data->>'supplier_reference',auth.uid());
   else raise exception 'Invalid purchase order transition';end if;
  end if;
 else raise exception 'Invalid entity or action';end if;
 insert into public.bf7_events(organization_id,entity,entity_id,actor_id,action,details)
 values(org,p_kind,v,auth.uid(),p_action,case when p_action='receive' then jsonb_build_object('po_id',po.id,'line_id',ln.id,'quantity',quantity_value) else p_data end);
 return v;
end $$;
revoke all on function public.bf7_action(text,uuid,text,jsonb) from public,anon;
grant execute on function public.bf7_action(text,uuid,text,jsonb) to authenticated;
insert into public.bf_migrations(version) values(7);
commit;
