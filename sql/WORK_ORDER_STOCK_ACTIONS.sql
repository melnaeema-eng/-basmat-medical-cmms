create table public.bf_spare_custodians (
  allocation_id uuid primary key references public.bf8_allocations(id),
  user_id uuid not null references auth.users(id)
);
alter table public.bf_spare_custodians enable row level security;
revoke all on public.bf_spare_custodians from public,anon,authenticated;

create function private.bf_wo_stock_manager(w public.bf_work_orders, project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.bf4_staff(w.organization_id,'inventory.manage') and
  (project is null or public.bf44_project_member(auth.uid(),project,w.site_id,w.organization_id))
$$;

create function private.bf_wo_stock_custody(p_work_order uuid,p_allocation uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.bf_spare_custodians c
  join public.bf8_allocations a on a.id=c.allocation_id
  join public.bf8_material_lines l on l.id=a.line_id
  join public.bf8_material_requests r on r.id=l.request_id
  join public.bf_work_orders w on w.id=r.work_order_id
  left join public.bf44_workflows f on f.work_order_id=w.id
  where c.allocation_id=p_allocation and c.user_id=auth.uid() and w.id=p_work_order
    and w.status in ('accepted','in_progress','on_hold') and f.report_id is null
    and public.bf4_assigned(w.id) and public.bf4_staff(w.organization_id,'corrective.execute')
    and (f.project_id is null or public.bf44_staff(f.project_id,'corrective.execute',w.site_id))
 )
$$;

revoke all on function private.bf_wo_stock_manager(public.bf_work_orders,uuid) from public,anon,authenticated;
revoke all on function private.bf_wo_stock_custody(uuid,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bf44_stock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec jsonb; w public.bf_work_orders; f public.bf44_workflows; wo uuid;
begin
  rec:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='bf8_material_requests' then
    wo:=(rec->>'work_order_id')::uuid;
  else
    select work_order_id into wo from public.bf8_material_requests where id=(rec->>'request_id')::uuid;
  end if;
  select * into w from public.bf_work_orders where id=wo for update;
  select * into f from public.bf44_workflows where work_order_id=wo;
  if f.work_order_id is not null and not (
    public.bf44_staff(f.project_id,'inventory.request',w.site_id)
    or public.bf44_staff(f.project_id,'inventory.manage',w.site_id)
    or private.bf_wo_stock_manager(w,f.project_id)
    or (tg_op='UPDATE' and tg_table_name='bf8_material_lines'
      and (to_jsonb(new)-'received_qty'-'consumed_qty')=(to_jsonb(old)-'received_qty'-'consumed_qty')
      and exists(select 1 from public.bf8_allocations al
       where al.line_id=(rec->>'id')::uuid and private.bf_wo_stock_custody(w.id,al.id)))
    or public.bf44_staff(f.project_id,'inventory.approve',w.site_id)
    or (tg_op='INSERT' and public.bf4_assigned(w.id) and public.bf44_staff(f.project_id,'corrective.execute',w.site_id))
    or (tg_op='UPDATE' and tg_table_name='bf8_material_requests'
      and to_jsonb(old)->>'status'='submitted' and to_jsonb(new)->>'status' in ('approved','rejected')
      and to_jsonb(new)->>'approved_by'=auth.uid()::text
      and private.bf_spare_can_review(w,f.project_id))
  ) then raise exception 'Project stock permission required' using errcode='42501'; end if;
  if f.report_id is not null then raise exception 'Materials are frozen in the issued report; return work for re-review before making changes'; end if;
  if tg_op='UPDATE' and tg_table_name='bf8_material_requests'
    and (to_jsonb(new)->>'work_order_id') is distinct from (to_jsonb(old)->>'work_order_id')
  then raise exception 'A material request cannot change its work order'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bf8_action(p_action text, p_request uuid, p_data jsonb DEFAULT '{}'::jsonb, p_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r public.bf8_material_requests;
 l public.bf8_material_lines;
 a public.bf8_allocations;
 st public.bf7_stock_lots;
 wo public.bf_work_orders;
 old_event public.bf8_idempotency;
 org uuid; v uuid; q numeric(18,3); remaining numeric(18,3);
 owner_id uuid; stock_id uuid; target_line_id uuid; target_allocation_id uuid; cost_allocation_id uuid;
 manager boolean; approver boolean; executor boolean; scoped_custody boolean:=false;
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
   or not (public.bf4_staff(old_event.organization_id,'inventory.view') or (
    p_action in('receive','consume') and private.bf_wo_stock_custody(
      (select m.work_order_id from public.bf8_material_requests m where m.id=old_event.request_id),
      nullif(p_data->>'allocation_id','')::uuid)))
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
 if p_action in('receive','consume') then
  scoped_custody:=private.bf_wo_stock_custody(r.work_order_id,nullif(p_data->>'allocation_id','')::uuid);
  if not manager and not scoped_custody and exists(select 1 from public.bf_spare_custodians c
    where c.allocation_id=nullif(p_data->>'allocation_id','')::uuid)
  then raise exception 'This stock was not issued to your account' using errcode='42501';end if;
 end if;
 if p_action<>'create' and not(manager or approver or executor or scoped_custody)
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
  returning id into target_line_id;
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
  target_line_id:=(p_data->>'line_id')::uuid;
  select * into l from public.bf8_material_lines where id=target_line_id and request_id=r.id for update;
  if not found then raise exception 'Invalid material line';end if;
  q:=(p_data->>'quantity')::numeric;
  if q is null or q<=0 then raise exception 'Positive quantity required';end if;
  if p_action in('reserve','release','issue','return') and not manager
   or p_action in('receive','consume') and not(manager or executor or scoped_custody)
  then raise exception 'Permission denied' using errcode='42501';end if;
  target_allocation_id:=nullif(p_data->>'allocation_id','')::uuid;
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
   returning id into target_allocation_id;
   update public.bf7_stock_lots set reserved=reserved+q where id=st.id;
   update public.bf8_material_lines set reserved_qty=reserved_qty+q where id=l.id;
   insert into public.bf8_allocation_costs(allocation_id,organization_id,unit_cost,currency)
   values(target_allocation_id,org,st.unit_cost,st.currency)
   on conflict(allocation_id) do nothing;
   cost_allocation_id:=target_allocation_id;
   if exists(select 1 from public.bf8_allocation_costs c
    where c.allocation_id=cost_allocation_id
    and (c.unit_cost<>st.unit_cost or c.currency<>st.currency))
   then raise exception 'Allocation cost changed; use a separate valuation allocation';end if;
  else
   select * into a from public.bf8_allocations where id=target_allocation_id and line_id=l.id for update;
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
  values(org,r.id,l.id,target_allocation_id,auth.uid(),p_action,q,snapshot,
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
  values(org,r.id,target_line_id,auth.uid(),p_action,p_data);
 end if;
 insert into public.bf8_idempotency(key,organization_id,actor_id,request_id,action,payload)
 values(p_key,org,auth.uid(),r.id,p_action,p_data);
 return r.id;
end $function$;
create function public.bf_work_order_stock(
 p_work_order uuid, p_action text default 'read', p_target uuid default null, p_data jsonb default '{}'::jsonb,
 p_key uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 w public.bf_work_orders;
 f public.bf44_workflows;
 r public.bf8_material_requests;
 l public.bf8_material_lines;
 a public.bf8_allocations;
 po public.bf7_purchase_orders;
 old_event public.bf8_idempotency;
 actor uuid:=auth.uid();
 manager boolean;
 technician boolean;
 can_receive boolean;
 active_order boolean;
 recipient uuid;
 lot uuid;
 qty numeric;
 payload jsonb;
 result uuid;
begin
 if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
 then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>8192
 then raise exception 'Invalid stock operation details'; end if;
 select * into w from public.bf_work_orders where id=p_work_order;
 if not found then raise exception 'Work order access required' using errcode='42501'; end if;
 select * into f from public.bf44_workflows where work_order_id=w.id;
 manager:=private.bf_wo_stock_manager(w,f.project_id);
 technician:=public.bf4_assigned(w.id) and public.bf4_staff(w.organization_id,'corrective.execute')
  and (f.project_id is null or public.bf44_staff(f.project_id,'corrective.execute',w.site_id));
 if not (manager or technician) then raise exception 'Work order stock access required' using errcode='42501'; end if;
 active_order:=w.status in ('accepted','in_progress','on_hold') and f.report_id is null;
 can_receive:=manager and public.bf7_can(w.organization_id,'procurement.manage');

 if p_action='read' then
  if not active_order then return '{}'::jsonb; end if;
  return jsonb_build_object(
   'receipts',case when can_receive then coalesce((
    select jsonb_agg(jsonb_build_object('id',pl.id,'number',p.number,'sku',part.sku,'name_ar',part.name_ar,
       'name_en',part.name_en,'remaining',pl.quantity-pl.received_qty,
       'owner',case when ml.owner_client_id is null then null else (select c.name from public.bf_clients c where c.id=ml.owner_client_id) end)
       order by p.number,part.sku)
    from public.bf_spare_purchase_links link
    join public.bf8_material_requests mr on mr.id=link.material_request_id
    join public.bf7_purchase_orders p on p.requisition_id=link.requisition_id and p.organization_id=w.organization_id
    join public.bf7_po_lines pl on pl.po_id=p.id
    join public.bf_inv_parts part on part.id=pl.part_id
    join lateral (select min(owner_client_id::text)::uuid owner_client_id from public.bf8_material_lines ml
      where ml.request_id=mr.id and ml.part_id=pl.part_id
      having count(*)=1) ml on true
    where mr.work_order_id=w.id and p.status in ('approved','part_received') and pl.quantity>pl.received_qty
   ),'[]'::jsonb) else '[]'::jsonb end,
   'bins',case when can_receive then coalesce((
    select jsonb_agg(jsonb_build_object('id',b.id,'name_ar',wh.name_ar||' / '||b.code,'name_en',wh.name_en||' / '||b.code)
      order by wh.name_en,b.code)
    from public.bf_inv_bins b join public.bf_inv_warehouses wh on wh.id=b.warehouse_id and wh.status='active'
    where b.organization_id=w.organization_id
   ),'[]'::jsonb) else '[]'::jsonb end,
   'assignees',case when manager then coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),p.id::text)) order by p.full_name)
    from public.bf_work_order_assignments wa join public.bf_profiles p on p.id=wa.user_id and p.status='active'
    where wa.work_order_id=w.id
   ),'[]'::jsonb) else '[]'::jsonb end,
   'issues',case when manager then coalesce((
    select jsonb_agg(jsonb_build_object('id',ml.id,'number',mr.number,'sku',p.sku,'name_ar',p.name_ar,'name_en',p.name_en,
       'remaining',ml.quantity-ml.issued_qty-ml.reserved_qty,'lots',lots.options) order by mr.number,p.sku)
    from public.bf8_material_requests mr join public.bf8_material_lines ml on ml.request_id=mr.id
    join public.bf_inv_parts p on p.id=ml.part_id and p.status='active'
    cross join lateral (select jsonb_agg(jsonb_build_object('id',s.id,'name_ar',wh.name_ar||' / '||b.code,
     'name_en',wh.name_en||' / '||b.code,'serial',nullif(s.serial_number,''),'batch',nullif(s.lot_code,''),
     'available',s.quantity-s.reserved) order by s.expires_on nulls last,s.id) options
     from public.bf7_stock_lots s
     join public.bf_inv_warehouses wh on wh.id=s.warehouse_id and wh.status='active'
     join public.bf_inv_bins b on b.id=s.bin_id
     where s.organization_id=w.organization_id and s.part_id=ml.part_id and s.owner_client_id is not distinct from ml.owner_client_id
      and s.quantity>s.reserved and (s.expires_on is null or s.expires_on>=current_date)) lots
    where mr.work_order_id=w.id and mr.status='approved'
      and ml.quantity>ml.issued_qty+ml.reserved_qty and lots.options is not null
   ),'[]'::jsonb) else '[]'::jsonb end,
   'allocations',coalesce((
    select jsonb_agg(jsonb_build_object('id',al.id,'number',mr.number,'sku',p.sku,'name_ar',p.name_ar,'name_en',p.name_en,
      'serial',nullif(s.serial_number,''),'recipient',c.user_id,
      'reserved',case when manager then al.reserved_qty else 0 end,
      'awaiting',case when c.user_id=actor and technician then al.issued_qty-al.received_qty-al.returned_unreceived_qty else 0 end,
      'unused',case when c.user_id=actor and technician then al.received_qty-al.consumed_qty-al.returned_received_qty else 0 end,
      'return_received',case when manager then al.received_qty-al.consumed_qty-al.returned_received_qty else 0 end,
      'return_unreceived',case when manager then al.issued_qty-al.received_qty-al.returned_unreceived_qty else 0 end)
      order by mr.number,p.sku,al.id)
    from public.bf8_material_requests mr join public.bf8_material_lines ml on ml.request_id=mr.id
    join public.bf_inv_parts p on p.id=ml.part_id join public.bf8_allocations al on al.line_id=ml.id
    join public.bf7_stock_lots s on s.id=al.stock_lot_id
    left join public.bf_spare_custodians c on c.allocation_id=al.id
    where mr.work_order_id=w.id and mr.status='approved'
      and (manager or (c.user_id=actor and technician))
      and (al.reserved_qty>0 or al.issued_qty>al.consumed_qty+al.returned_received_qty+al.returned_unreceived_qty)
   ),'[]'::jsonb),
   'closable',case when manager then coalesce((
    select jsonb_agg(jsonb_build_object('id',mr.id,'number',mr.number) order by mr.number)
    from public.bf8_material_requests mr where mr.work_order_id=w.id and mr.status='approved'
      and exists(select 1 from public.bf8_material_lines ml where ml.request_id=mr.id)
      and not exists(select 1 from public.bf8_material_lines ml where ml.request_id=mr.id
        and (ml.reserved_qty>0 or ml.issued_qty<ml.quantity or
          ml.issued_qty<>ml.consumed_qty+ml.returned_received_qty+ml.returned_unreceived_qty))
      and not exists(select 1 from public.bf_spare_purchase_links lk join public.bf7_requisitions rq on rq.id=lk.requisition_id
        where lk.material_request_id=mr.id and (rq.status not in ('rejected','cancelled','ordered') or
          rq.status='ordered' and not exists(select 1 from public.bf7_purchase_orders p
            where p.requisition_id=rq.id and p.status='received')))
   ),'[]'::jsonb) else '[]'::jsonb end
  );
 end if;

 if not active_order or p_key is null or p_target is null
 then raise exception 'An active work order and operation key are required'; end if;
 if p_action<>'close' then
  qty:=(p_data->>'quantity')::numeric;
  if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>=1000000000000000 or scale(qty)>3
  then raise exception 'Enter a valid quantity'; end if;
 end if;

 if p_action='supplier_receipt' then
  if not can_receive then raise exception 'Stock receipt permission required' using errcode='42501'; end if;
  select p.* into po from public.bf7_po_lines pl join public.bf7_purchase_orders p on p.id=pl.po_id
   join public.bf_spare_purchase_links link on link.requisition_id=p.requisition_id
   join public.bf8_material_requests mr on mr.id=link.material_request_id
   where pl.id=p_target and mr.work_order_id=w.id and p.organization_id=w.organization_id;
  if not found then raise exception 'Purchase order line is outside this work order' using errcode='42501'; end if;
  select ml.* into strict l from public.bf8_material_lines ml
   join public.bf_spare_purchase_links link on link.material_request_id=ml.request_id
   join public.bf7_po_lines pl on pl.id=p_target and pl.part_id=ml.part_id
   where link.requisition_id=po.requisition_id;
  payload:=p_data||jsonb_build_object('line_id',p_target,'owner_client_id',l.owner_client_id,'idempotency_key',p_key);
  if exists(select 1 from public.bf7_receipts receipt where receipt.idempotency_key=p_key and receipt.po_id=po.id
    and receipt.po_line_id=p_target and receipt.received_by=actor and receipt.quantity=qty
    and receipt.owner_client_id is not distinct from l.owner_client_id
    and receipt.supplier_reference=p_data->>'supplier_reference' and receipt.lot_code=coalesce(p_data->>'lot_code','')
    and receipt.serial_number=coalesce(p_data->>'serial_number','')
    and receipt.expires_on is not distinct from nullif(p_data->>'expires_on','')::date
    and exists(select 1 from public.bf7_stock_lots s where s.id=receipt.stock_lot_id and s.bin_id=(p_data->>'bin_id')::uuid))
  then return jsonb_build_object('id',po.id); end if;
  result:=public.bf7_action('purchase_order',po.id,'receive',payload);
  return jsonb_build_object('id',result);
 end if;

 if p_action in ('issue','issue_reserved','close','return') and not manager
 then raise exception 'Work order stock manager required' using errcode='42501'; end if;
 if p_action='issue' then
  select m.* into l from public.bf8_material_lines m where m.id=p_target;
 elsif p_action in ('issue_reserved','receive','consume','return') then
  select * into a from public.bf8_allocations where id=p_target;
  select m.* into l from public.bf8_material_lines m where m.id=a.line_id;
 elsif p_action<>'close' then
  raise exception 'Invalid work order stock action';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 if p_action='issue' then
  perform pg_advisory_xact_lock(hashtextextended(md5(p_key::text||':reserve'),0));
 end if;
 select * into r from public.bf8_material_requests
 where id=case when p_action='close' then p_target else l.request_id end and work_order_id=w.id and organization_id=w.organization_id
 for update;
 if not found then raise exception 'Material target is outside this work order' using errcode='42501'; end if;
 if p_action in ('receive','consume') and not private.bf_wo_stock_custody(w.id,a.id)
 then raise exception 'This stock was not issued to your account' using errcode='42501'; end if;

 if p_action in ('issue','issue_reserved') then
  recipient:=(p_data->>'recipient')::uuid;
  if not exists(select 1 from public.bf_work_order_assignments wa join public.bf_profiles p on p.id=wa.user_id and p.status='active'
    where wa.work_order_id=w.id and wa.user_id=recipient)
  then raise exception 'Select a technician assigned to this work order'; end if;
  if p_action='issue' then
   lot:=(p_data->>'stock_lot_id')::uuid;
   if lot is null then raise exception 'Select stock to issue'; end if;
   perform public.bf8_action('reserve',r.id,jsonb_build_object('line_id',l.id,'stock_lot_id',lot,'quantity',qty),
      md5(p_key::text||':reserve')::uuid);
   select * into strict a from public.bf8_allocations al where al.line_id=l.id and al.stock_lot_id=lot;
  end if;
  if exists(select 1 from public.bf_spare_custodians c where c.allocation_id=a.id and c.user_id<>recipient)
    or (not exists(select 1 from public.bf_spare_custodians c where c.allocation_id=a.id)
      and exists(select 1 from public.bf8_allocations al where al.id=a.id and al.issued_qty>0))
  then raise exception 'This allocation already has an issued quantity or a different recipient'; end if;
  insert into public.bf_spare_custodians(allocation_id,user_id) values(a.id,recipient) on conflict do nothing;
  payload:=jsonb_build_object('line_id',l.id,'allocation_id',a.id,'quantity',qty,'recipient',recipient);
  result:=public.bf8_action('issue',r.id,payload,p_key);
 elsif p_action='close' then
  select * into old_event from public.bf8_idempotency where key=p_key;
  if not found and (not exists(select 1 from public.bf8_material_lines ml where ml.request_id=r.id)
   or exists(select 1 from public.bf8_material_lines ml where ml.request_id=r.id and (ml.issued_qty<ml.quantity or ml.reserved_qty>0))
   or exists(select 1 from public.bf_spare_purchase_links lk join public.bf7_requisitions rq on rq.id=lk.requisition_id
        where lk.material_request_id=r.id and (rq.status not in ('rejected','cancelled','ordered') or
          rq.status='ordered' and not exists(select 1 from public.bf7_purchase_orders p
            where p.requisition_id=rq.id and p.status='received'))))
  then raise exception 'Finish stock issue and receipt before closing the material request'; end if;
  result:=public.bf8_action('close',r.id,jsonb_build_object('reason','Work order stock reconciled'),p_key);
 else
  payload:=jsonb_build_object('line_id',l.id,'allocation_id',a.id,'quantity',qty);
  if p_action='return' then payload:=payload||jsonb_build_object('custody',p_data->>'custody'); end if;
  result:=public.bf8_action(p_action,r.id,payload,p_key);
 end if;
 return jsonb_build_object('id',result);
exception when no_data_found or too_many_rows then raise exception 'This purchase line requires separate stock-owner reconciliation';
end;
$$;
revoke all on function public.bf_work_order_stock(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.bf_work_order_stock(uuid,text,uuid,jsonb,uuid) to authenticated;
