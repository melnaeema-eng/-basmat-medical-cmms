-- Basmat Facilities CMMS — Sprint 6 Inventory Foundation.
-- Requires the accepted Sprint 5 migration. Run once; no existing data is deleted.
begin;
do $$ begin
 if not exists(select 1 from public.bf_migrations where version=5) then raise exception 'Install Sprint 5 first';end if;
 if exists(select 1 from public.bf_migrations where version=6) then raise exception 'Sprint 6 already installed';end if;
end $$;
insert into public.bf_permissions(code,description) values
('inventory.view','View inventory'),('inventory.manage','Manage stock masters and movements'),
('inventory.request','Request work order materials'),('inventory.approve','Approve material requests')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'inventory.%')
or (r.code='store_keeper' and p.code in('inventory.view','inventory.manage','inventory.request'))
or (r.code='supervisor' and p.code in('inventory.view','inventory.request','inventory.approve'))
or (r.code='technician' and p.code in('inventory.view','inventory.request'))
on conflict do nothing;

create table public.bf_inv_parts(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 sku text not null,name_ar text not null,name_en text not null,
 description text,manufacturer text,manufacturer_part_number text,unit text not null default 'each',
 category text,barcode text,criticality text not null default 'medium' check(criticality in('low','medium','high','critical')),
 min_qty numeric(18,3) not null default 0 check(min_qty>=0),
 reorder_qty numeric(18,3) not null default 0 check(reorder_qty>=0),
 lead_days integer not null default 0 check(lead_days>=0),
 status text not null default 'active' check(status in('active','inactive','archived')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,sku),unique(id,organization_id)
);
create table public.bf_inv_warehouses(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 site_id uuid,code text not null,name_ar text not null,name_en text not null,
 kind text not null default 'central' check(kind in('central','site','van')),
 status text not null default 'active' check(status in('active','inactive','archived')),
 created_at timestamptz not null default now(),unique(organization_id,code),unique(id,organization_id),
 foreign key(site_id,organization_id) references public.bf_sites(id,organization_id)
);
create table public.bf_inv_bins(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 warehouse_id uuid not null,code text not null,description text,
 created_at timestamptz not null default now(),unique(warehouse_id,code),unique(id,organization_id,warehouse_id),
 foreign key(warehouse_id,organization_id) references public.bf_inv_warehouses(id,organization_id)
);
create table public.bf_inv_stock(
 organization_id uuid not null,part_id uuid not null,warehouse_id uuid not null,bin_id uuid not null,
 owner_client_id uuid,lot_code text not null default '',serial_number text not null default '',
 expires_on date,quantity numeric(18,3) not null default 0 check(quantity>=0),
 reserved numeric(18,3) not null default 0 check(reserved>=0 and reserved<=quantity),
 primary key(bin_id,part_id,lot_code,serial_number),
 foreign key(part_id,organization_id) references public.bf_inv_parts(id,organization_id),
 foreign key(bin_id,organization_id,warehouse_id) references public.bf_inv_bins(id,organization_id,warehouse_id),
 foreign key(owner_client_id,organization_id) references public.bf_clients(id,organization_id)
);
create table public.bf_inv_requests(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 client_id uuid not null,site_id uuid not null,work_order_id uuid not null,
 request_number text not null,part_id uuid not null,
 quantity numeric(18,3) not null check(quantity>0),
 status text not null default 'submitted' check(status in('submitted','approved','rejected','reserved','issued','received','consumed','cancelled')),
 warehouse_id uuid,bin_id uuid,lot_code text,serial_number text,owner_client_id uuid,
 approved_by uuid references auth.users(id),assigned_to uuid references auth.users(id),
 reason text,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,request_number),
 foreign key(work_order_id,organization_id,client_id,site_id) references public.bf_work_orders(id,organization_id,client_id,site_id),
 foreign key(part_id,organization_id) references public.bf_inv_parts(id,organization_id),
 foreign key(warehouse_id,organization_id) references public.bf_inv_warehouses(id,organization_id),
 foreign key(owner_client_id,organization_id) references public.bf_clients(id,organization_id)
);
create table public.bf_inv_movements(
 id bigint generated always as identity primary key,
 organization_id uuid not null,part_id uuid not null,
 from_bin_id uuid,to_bin_id uuid,request_id uuid references public.bf_inv_requests(id),
 quantity numeric(18,3) not null check(quantity>0),
 action text not null check(action in('receipt','transfer','issue','return','adjust_in','adjust_out')),
 reference text,reason text,actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.bf_inv_events(
 id bigint generated always as identity primary key,organization_id uuid not null,
 entity_type text not null,entity_id uuid not null,actor_id uuid not null references auth.users(id),
 action text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create sequence public.bf6_part_seq;
create sequence public.bf6_warehouse_seq;
create sequence public.bf6_request_seq;
revoke all on sequence public.bf6_part_seq,public.bf6_warehouse_seq,public.bf6_request_seq from public,anon,authenticated;

-- Sensitive stock balances and ledger entries are staff-only.
do $$ declare t text;begin
 foreach t in array array['bf_inv_parts','bf_inv_warehouses','bf_inv_bins','bf_inv_stock','bf_inv_requests','bf_inv_movements','bf_inv_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy bf6_parts_read on public.bf_inv_parts for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_wh_read on public.bf_inv_warehouses for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_bins_read on public.bf_inv_bins for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_stock_read on public.bf_inv_stock for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_requests_read on public.bf_inv_requests for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_movements_read on public.bf_inv_movements for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));
create policy bf6_events_read on public.bf_inv_events for select to authenticated
using(public.bf4_staff(organization_id,'inventory.view'));

-- All writes go through this narrow API; client-supplied tenant ownership is
-- checked against the server's parent records and never trusted for movements.
create or replace function public.bf6_action(p_kind text,p_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare part public.bf_inv_parts; wh public.bf_inv_warehouses; b public.bf_inv_bins;
 st public.bf_inv_stock; req public.bf_inv_requests; wo public.bf_work_orders;
 org uuid; v uuid; qty numeric(18,3); old_status text; target uuid; source_bin uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768 then raise exception 'Invalid payload';end if;
 if p_kind='part' and p_action='create' then
  org:=(p_data->>'organization_id')::uuid;
  if not public.bf4_staff(org,'inventory.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  insert into public.bf_inv_parts(organization_id,sku,name_ar,name_en,description,manufacturer,manufacturer_part_number,unit,category,barcode,criticality,min_qty,reorder_qty,lead_days,created_by)
  values(org,'PART-'||lpad(nextval('public.bf6_part_seq')::text,6,'0'),p_data->>'name_ar',p_data->>'name_en',p_data->>'description',
   p_data->>'manufacturer',p_data->>'manufacturer_part_number',coalesce(nullif(p_data->>'unit',''),'each'),
   p_data->>'category',p_data->>'barcode',coalesce(p_data->>'criticality','medium'),
   coalesce((p_data->>'min_qty')::numeric,0),coalesce((p_data->>'reorder_qty')::numeric,0),coalesce((p_data->>'lead_days')::integer,0),auth.uid())
  returning * into part;
  v:=part.id;
 elsif p_kind='warehouse' and p_action='create' then
  org:=(p_data->>'organization_id')::uuid;
  if not public.bf4_staff(org,'inventory.manage') then raise exception 'Permission denied' using errcode='42501';end if;
  if nullif(p_data->>'site_id','') is not null and not exists(select 1 from public.bf_sites where id=(p_data->>'site_id')::uuid and organization_id=org) then raise exception 'Invalid site';end if;
  insert into public.bf_inv_warehouses(organization_id,site_id,code,name_ar,name_en,kind)
  values(org,nullif(p_data->>'site_id','')::uuid,'WH-'||lpad(nextval('public.bf6_warehouse_seq')::text,5,'0'),
   p_data->>'name_ar',p_data->>'name_en',coalesce(p_data->>'kind','central')) returning * into wh;
  v:=wh.id;
 elsif p_kind='bin' and p_action='create' then
  select * into wh from public.bf_inv_warehouses where id=(p_data->>'warehouse_id')::uuid and status='active';
  if not found or not public.bf4_staff(wh.organization_id,'inventory.manage') then raise exception 'Invalid warehouse or permission denied' using errcode='42501';end if;
  insert into public.bf_inv_bins(organization_id,warehouse_id,code,description)
  values(wh.organization_id,wh.id,p_data->>'code',p_data->>'description') returning * into b;
  org:=wh.organization_id;v:=b.id;
 elsif p_kind='stock' and p_action in('receipt','transfer','adjust_in','adjust_out') then
  select * into part from public.bf_inv_parts where id=(p_data->>'part_id')::uuid and status='active';
  if not found or not public.bf4_staff(part.organization_id,'inventory.manage') then raise exception 'Invalid part or permission denied' using errcode='42501';end if;
  org:=part.organization_id;qty:=(p_data->>'quantity')::numeric;
  if nullif(p_data->>'owner_client_id','') is not null or nullif(p_data->>'lot_code','') is not null or nullif(p_data->>'serial_number','') is not null then
   raise exception 'Owner/lot-specific movements require the next inventory release';
  end if;
  if qty is null or qty<=0 then raise exception 'Positive quantity required';end if;
  if length(btrim(coalesce(p_data->>'reference','')))<3 then raise exception 'Movement reference required';end if;
  select * into b from public.bf_inv_bins where id=(p_data->>'bin_id')::uuid and organization_id=org;
  if not found then raise exception 'Invalid source bin';end if;
  if not exists(select 1 from public.bf_inv_warehouses where id=b.warehouse_id and status='active') then raise exception 'Warehouse is inactive';end if;
  source_bin:=b.id;
  -- A bin/part row is locked before changing quantity; no negative stock is possible.
  select * into st from public.bf_inv_stock where bin_id=b.id and part_id=part.id and lot_code='' and serial_number='' for update;
  if p_action in('receipt','adjust_in') then
   insert into public.bf_inv_stock(organization_id,part_id,warehouse_id,bin_id,quantity)
   values(org,part.id,b.warehouse_id,b.id,qty)
   on conflict(bin_id,part_id,lot_code,serial_number) do update set quantity=public.bf_inv_stock.quantity+excluded.quantity;
  else
   if not found or st.quantity-st.reserved<qty then raise exception 'Insufficient available stock';end if;
   update public.bf_inv_stock set quantity=quantity-qty where bin_id=b.id and part_id=part.id and lot_code='' and serial_number='';
   if p_action='transfer' then
    select * into b from public.bf_inv_bins where id=(p_data->>'to_bin_id')::uuid and organization_id=org;
    if not found or b.id=source_bin or not exists(select 1 from public.bf_inv_warehouses where id=b.warehouse_id and status='active') then raise exception 'Invalid destination bin';end if;
    insert into public.bf_inv_stock(organization_id,part_id,warehouse_id,bin_id,quantity)
    values(org,part.id,b.warehouse_id,b.id,qty)
    on conflict(bin_id,part_id,lot_code,serial_number) do update set quantity=public.bf_inv_stock.quantity+excluded.quantity;
   end if;
  end if;
  insert into public.bf_inv_movements(organization_id,part_id,from_bin_id,to_bin_id,quantity,action,reference,reason,actor_id)
  values(org,part.id,case when p_action in('receipt','adjust_in') then null else source_bin end,
   case when p_action='transfer' then b.id when p_action in('receipt','adjust_in') then source_bin else null end,
   qty,p_action,p_data->>'reference',p_data->>'reason',auth.uid());
  v:=part.id;
 elsif p_kind='request' then
  if p_action='create' then
   select * into wo from public.bf_work_orders where id=(p_data->>'work_order_id')::uuid;
   if not found then raise exception 'Work order not found';end if;
   org:=wo.organization_id;
   if not(public.bf4_staff(org,'inventory.request') or (public.bf4_staff(org,'corrective.execute') and public.bf4_assigned(wo.id))) then raise exception 'Permission denied' using errcode='42501';end if;
   if wo.status in('closed','cancelled') then raise exception 'Work order is closed';end if;
   select * into part from public.bf_inv_parts where id=(p_data->>'part_id')::uuid and organization_id=org and status='active';
   if not found then raise exception 'Invalid part';end if;
   qty:=(p_data->>'quantity')::numeric;
   if qty is null or qty<=0 then raise exception 'Positive quantity required';end if;
   insert into public.bf_inv_requests(organization_id,client_id,site_id,work_order_id,request_number,part_id,quantity,created_by)
   values(org,wo.client_id,wo.site_id,wo.id,'MR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf6_request_seq')::text,6,'0'),part.id,qty,auth.uid()) returning * into req;
   v:=req.id;
  else
   select * into req from public.bf_inv_requests where id=p_id for update;
   if not found then raise exception 'Material request not found';end if;
   org:=req.organization_id;old_status:=req.status;
   if p_action in('approve','reject') then
    if not public.bf4_staff(org,'inventory.approve') then raise exception 'Permission denied' using errcode='42501';end if;
    if req.status<>'submitted' then raise exception 'Invalid request transition';end if;
    if p_action='reject' and length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reason required';end if;
    update public.bf_inv_requests set status=case when p_action='approve' then 'approved' else 'rejected' end,
     approved_by=auth.uid(),reason=p_data->>'reason',updated_at=now() where id=req.id;
   elsif p_action in('reserve','issue','return') then
    if p_action in('reserve','issue') and not exists(select 1 from public.bf_work_orders where id=req.work_order_id and status not in('closed','cancelled')) then raise exception 'Work order is closed';end if;
    if not public.bf4_staff(org,'inventory.manage') then raise exception 'Permission denied' using errcode='42501';end if;
    if p_action='reserve' and req.status='approved' then
     select * into st from public.bf_inv_stock where bin_id=(p_data->>'bin_id')::uuid and part_id=req.part_id and lot_code='' and serial_number='' for update;
     if not found or st.organization_id<>org or st.quantity-st.reserved<req.quantity then raise exception 'Insufficient available stock';end if;
     if not exists(select 1 from public.bf_inv_warehouses where id=st.warehouse_id and status='active') then raise exception 'Warehouse is inactive';end if;
     update public.bf_inv_stock set reserved=reserved+req.quantity where bin_id=st.bin_id and part_id=st.part_id and lot_code='' and serial_number='';
     update public.bf_inv_requests set status='reserved',warehouse_id=st.warehouse_id,bin_id=st.bin_id,updated_at=now() where id=req.id;
    elsif p_action='issue' and req.status='reserved' then
     select * into st from public.bf_inv_stock where bin_id=req.bin_id and part_id=req.part_id and lot_code='' and serial_number='' for update;
     if not found or st.reserved<req.quantity then raise exception 'Reservation missing';end if;
     update public.bf_inv_stock set quantity=quantity-req.quantity,reserved=reserved-req.quantity where bin_id=st.bin_id and part_id=st.part_id and lot_code='' and serial_number='';
     update public.bf_inv_requests set status='issued',updated_at=now() where id=req.id;
     insert into public.bf_inv_movements(organization_id,part_id,from_bin_id,request_id,quantity,action,reference,actor_id)
     values(org,req.part_id,req.bin_id,req.id,req.quantity,'issue',req.request_number,auth.uid());
    elsif p_action='return' and req.status='issued' then
     -- This foundation supports full, unconsumed returns only.
     select * into st from public.bf_inv_stock where bin_id=req.bin_id and part_id=req.part_id and lot_code='' and serial_number='' for update;
     if not found then raise exception 'Stock allocation missing';end if;
     update public.bf_inv_stock set quantity=quantity+req.quantity where bin_id=req.bin_id and part_id=req.part_id and lot_code='' and serial_number='';
     update public.bf_inv_requests set status='cancelled',reason=coalesce(p_data->>'reason','Full return'),updated_at=now() where id=req.id;
     insert into public.bf_inv_movements(organization_id,part_id,to_bin_id,request_id,quantity,action,reference,actor_id)
     values(org,req.part_id,req.bin_id,req.id,req.quantity,'return',req.request_number,auth.uid());
    else raise exception 'Invalid material transition';end if;
   elsif p_action='receive' and req.status='issued' then
    if not(public.bf4_staff(org,'inventory.manage') or (req.created_by=auth.uid() and public.bf4_staff(org,'inventory.request'))) then raise exception 'Permission denied' using errcode='42501';end if;
    update public.bf_inv_requests set status='received',updated_at=now() where id=req.id;
   elsif p_action='consume' and req.status='received' then
    if not(public.bf4_staff(org,'inventory.manage') or (req.created_by=auth.uid() and public.bf4_staff(org,'inventory.request'))) then raise exception 'Permission denied' using errcode='42501';end if;
    update public.bf_inv_requests set status='consumed',updated_at=now() where id=req.id;
   elsif p_action='cancel' and req.status in('submitted','approved','reserved') then
    if not(public.bf4_staff(org,'inventory.manage') or (req.created_by=auth.uid() and public.bf4_staff(org,'inventory.request'))) then raise exception 'Permission denied' using errcode='42501';end if;
    if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reason required';end if;
    if req.status='reserved' then
     select * into st from public.bf_inv_stock where bin_id=req.bin_id and part_id=req.part_id and lot_code='' and serial_number='' for update;
     update public.bf_inv_stock set reserved=reserved-req.quantity where bin_id=req.bin_id and part_id=req.part_id and lot_code='' and serial_number='';
    end if;
    update public.bf_inv_requests set status='cancelled',reason=p_data->>'reason',updated_at=now() where id=req.id;
   else raise exception 'Invalid material transition';end if;
   v:=req.id;
  end if;
 else raise exception 'Invalid inventory entity or action';end if;
 insert into public.bf_inv_events(organization_id,entity_type,entity_id,actor_id,action,details)
 values(org,p_kind,v,auth.uid(),p_action,p_data);
 return v;
end $$;
revoke all on function public.bf6_action(text,uuid,text,jsonb) from public,anon;
grant execute on function public.bf6_action(text,uuid,text,jsonb) to authenticated;
insert into public.bf_migrations(version) values(6);
commit;
