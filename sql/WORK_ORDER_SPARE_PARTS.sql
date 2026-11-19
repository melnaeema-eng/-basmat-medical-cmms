create function private.bf_spare_supervisor(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.bf_acl_user_organizations membership
    join public.bf_acl_user_roles assignment on assignment.user_id=membership.user_id
      and assignment.organization_id=membership.organization_id
    join public.bf_acl_roles role on role.id=assignment.role_id
      and (role.organization_id is null or role.organization_id=p_org)
    where membership.user_id=auth.uid() and membership.organization_id=p_org and membership.is_active
      and assignment.is_active and role.is_active
      and (assignment.valid_from is null or assignment.valid_from<=current_date)
      and (assignment.valid_until is null or assignment.valid_until>=current_date)
      and role.role_code in ('maintenance_supervisor','maintenance_manager','supervisor')
  );
$$;
revoke all on function private.bf_spare_supervisor(uuid) from public, anon, authenticated;

create function private.bf_spare_can_review(w public.bf_work_orders, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.bf_spare_supervisor(w.organization_id) and
    case when project is not null then public.bf44_staff(project,'corrective.manage',w.site_id)
    else public.bf4_staff(w.organization_id,'corrective.manage') and (
      w.project_id is null or exists(
        select 1 from public.bf_acl_user_projects p where p.user_id=auth.uid() and p.organization_id=w.organization_id
          and p.project_id=w.project_id and p.is_active and p.module_code in ('medical','facilities','shared')
          and (p.site_id is null or p.site_id=w.site_id) and p.discipline_code is null
          and (p.valid_from is null or p.valid_from<=current_date) and (p.valid_until is null or p.valid_until>=current_date)
      )
    ) end;
$$;
revoke all on function private.bf_spare_can_review(public.bf_work_orders,uuid) from public,anon,authenticated;

create or replace function public.bf44_stock_guard()
returns trigger language plpgsql security definer set search_path='' as $$
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
$$;

create table public.bf_spare_purchase_links (
  material_request_id uuid not null references public.bf8_material_requests(id),
  requisition_id uuid primary key references public.bf7_requisitions(id)
);
create index bf_spare_purchase_links_request on public.bf_spare_purchase_links(material_request_id);
alter table public.bf_spare_purchase_links enable row level security;
revoke all on public.bf_spare_purchase_links from public, anon, authenticated;

create function public.bf_work_order_spares(
  p_work_order uuid, p_action text default 'read', p_request uuid default null,
  p_part uuid default null, p_quantity numeric default null, p_reason text default null,
  p_key uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  w public.bf_work_orders;
  material public.bf8_material_requests;
  prior public.bf8_idempotency;
  project uuid;
  technician boolean;
  supervisor boolean;
  stock_access boolean;
  can_buy boolean;
  active_order boolean;
  pr uuid;
  line uuid;
  shortage jsonb;
  input_record jsonb;
begin
  if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
  then raise exception 'Authentication required' using errcode='42501'; end if;

  -- Serialize mutations with report preparation and other actions on this order.
  if p_action='read' then
    select * into w from public.bf_work_orders where id=p_work_order;
  else
    select * into w from public.bf_work_orders where id=p_work_order for update;
  end if;
  if w.id is null then raise exception 'Work order access required' using errcode='42501'; end if;
  select f.project_id into project from public.bf44_workflows f where f.work_order_id=w.id;
  technician := public.bf4_assigned(w.id) and public.bf4_staff(w.organization_id,'corrective.execute');
  supervisor := private.bf_spare_can_review(w,project);
  stock_access := technician and (project is null or public.bf44_staff(project,'corrective.execute',w.site_id));
  if not (stock_access or supervisor) then raise exception 'Work order spare parts access required' using errcode='42501'; end if;
  can_buy := supervisor;
  active_order := w.status in ('accepted','in_progress','on_hold')
    and not exists(select 1 from public.bf44_workflows f where f.work_order_id=w.id and f.report_id is not null);

  if p_action='read' then
    return jsonb_build_object(
      'can_request',active_order and stock_access,
      'can_approve',active_order and supervisor,
      'can_purchase',active_order and can_buy,
      'parts',case when active_order and stock_access then coalesce((
        select jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name_ar',p.name_ar,'name_en',p.name_en,
          'manufacturer',p.manufacturer,'manufacturer_part_number',p.manufacturer_part_number,
          'available',coalesce((
            select sum(st.quantity-st.reserved) from public.bf7_stock_lots st
            join public.bf_inv_warehouses wh on wh.id=st.warehouse_id and wh.status='active'
            where st.organization_id=p.organization_id and st.part_id=p.id and st.owner_client_id is null
              and (st.expires_on is null or st.expires_on>=current_date)
          ),0)) order by p.sku)
        from public.bf_inv_parts p where p.organization_id=w.organization_id and p.status='active'
      ),'[]'::jsonb) else '[]'::jsonb end,
      'requests',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'number',r.number,'status',r.status,'reason',r.reason,'closing_reason',r.closing_reason,
          'own',r.created_by=actor,'lines',coalesce((
            select jsonb_agg(jsonb_build_object('id',l.id,'quantity',l.quantity,'sku',p.sku,
              'name_ar',p.name_ar,'name_en',p.name_en) order by p.sku)
            from public.bf8_material_lines l join public.bf_inv_parts p on p.id=l.part_id where l.request_id=r.id
          ),'[]'::jsonb),
          'purchase', (select jsonb_build_object('id',q.id,'number',q.number,'status',q.status)
            from public.bf_spare_purchase_links link join public.bf7_requisitions q on q.id=link.requisition_id
            where link.material_request_id=r.id order by q.created_at desc,q.id desc limit 1)
        ) order by r.created_at desc)
        from public.bf8_material_requests r where r.work_order_id=w.id and (supervisor or r.created_by=actor)
      ),'[]'::jsonb)
    );
  end if;

  if not active_order then raise exception 'Active work order required'; end if;
  if p_action='request' then
    if not stock_access then raise exception 'Assigned technician required' using errcode='42501'; end if;
    if p_key is null or length(btrim(coalesce(p_reason,''))) not between 5 and 1000
      or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity')
      or p_quantity<=0 or p_quantity>=1000000000000000 or scale(p_quantity)>3 then raise exception 'Invalid request details'; end if;
    input_record := jsonb_build_object('work_order_id',w.id,'part_id',p_part,'quantity',p_quantity,'reason',btrim(p_reason));
    perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
    select * into prior from public.bf8_idempotency where key=p_key;
    if found then
      if prior.actor_id<>actor or prior.action<>'work_order_spares' or prior.payload is distinct from input_record
      then raise exception 'Idempotency key conflict' using errcode='42501'; end if;
      return jsonb_build_object('id',prior.request_id);
    end if;
    if not exists(select 1 from public.bf_inv_parts p where p.id=p_part and p.organization_id=w.organization_id and p.status='active')
    then raise exception 'Select an active catalog part'; end if;
    insert into public.bf8_material_requests(organization_id,work_order_id,number,reason,created_by)
    values(w.organization_id,w.id,'AMR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf8_request_seq')::text,6,'0'),btrim(p_reason),actor)
    returning * into material;
    insert into public.bf8_material_lines(organization_id,request_id,part_id,quantity)
    values(w.organization_id,material.id,p_part,p_quantity) returning id into line;
    insert into public.bf8_material_events(organization_id,request_id,line_id,actor_id,action,quantity,details)
    values(w.organization_id,material.id,line,actor,'submit',p_quantity,input_record);
    insert into public.bf8_idempotency(key,organization_id,actor_id,request_id,action,payload)
    values(p_key,w.organization_id,actor,material.id,'work_order_spares',input_record);
    return jsonb_build_object('id',material.id);
  end if;

  if not supervisor then raise exception 'Maintenance approval permission required' using errcode='42501'; end if;
  -- The order is already locked. Avoid waiting on legacy stock actions locking a request first.
  select * into material from public.bf8_material_requests where id=p_request and work_order_id=w.id for update nowait;
  if material.id is null then raise exception 'Material request not found'; end if;
  if p_action in ('approve','reject') then
    if material.status<>'submitted' or material.created_by=actor
    then raise exception 'Independent maintenance approval required' using errcode='42501'; end if;
    if not exists(select 1 from public.bf8_material_lines where request_id=material.id)
    then raise exception 'Add material lines first'; end if;
    if p_action='reject' and length(btrim(coalesce(p_reason,''))) not between 5 and 1000
    then raise exception 'Rejection reason required'; end if;
    update public.bf8_material_requests set status=case when p_action='approve' then 'approved' else 'rejected' end,
      approved_by=actor,approved_at=now(),closing_reason=case when p_action='reject' then btrim(p_reason) end where id=material.id;
    insert into public.bf8_material_events(organization_id,request_id,actor_id,action,details)
    values(w.organization_id,material.id,actor,p_action,jsonb_build_object('reason',p_reason));
    return jsonb_build_object('id',material.id);
  end if;

  if p_action is distinct from 'purchase' then raise exception 'Invalid action'; end if;
  if not can_buy then raise exception 'Purchase request permission required' using errcode='42501'; end if;
  if material.status<>'approved' then raise exception 'Approved material request required'; end if;
  select q.id into pr from public.bf_spare_purchase_links link
  join public.bf7_requisitions q on q.id=link.requisition_id
  where link.material_request_id=material.id and q.status not in ('rejected','cancelled');
  if pr is not null then return jsonb_build_object('id',pr); end if;

  select jsonb_agg(jsonb_build_object('part_id',s.part_id,'quantity',s.quantity)) into shortage
  from (
    select l.part_id,sum(greatest(0,l.quantity-l.reserved_qty-l.issued_qty-coalesce((
      select sum(st.quantity-st.reserved) from public.bf7_stock_lots st
      where st.organization_id=w.organization_id and st.part_id=l.part_id
        and st.owner_client_id is not distinct from l.owner_client_id
        and exists(select 1 from public.bf_inv_warehouses wh where wh.id=st.warehouse_id and wh.status='active')
        and (st.expires_on is null or st.expires_on>=current_date)
    ),0))) as quantity
    from public.bf8_material_lines l where l.request_id=material.id group by l.part_id
  ) s where s.quantity>0;
  if shortage is null then raise exception 'Requested parts are available in stock'; end if;

  if exists(
    select 1 from jsonb_array_elements(shortage) item
    where not exists(select 1 from public.bf_inv_parts p
      where p.id=(item->>'part_id')::uuid and p.organization_id=w.organization_id and p.status='active')
  ) then raise exception 'Requested parts are no longer active'; end if;
  insert into public.bf7_requisitions(organization_id,number,work_order_id,reason,created_by,status)
  values(w.organization_id,'PR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf7_pr_seq')::text,6,'0'),
    w.id,material.number||' — '||material.reason,actor,'submitted')
  returning id into pr;
  insert into public.bf7_requisition_lines(requisition_id,part_id,quantity)
  select pr,(item->>'part_id')::uuid,(item->>'quantity')::numeric from jsonb_array_elements(shortage) item;
  insert into public.bf7_events(organization_id,entity,entity_id,actor_id,action,details)
  values(w.organization_id,'requisition',pr,actor,'submit',jsonb_build_object('material_request_id',material.id));
  insert into public.bf_spare_purchase_links values(material.id,pr);
  insert into public.bf8_material_events(organization_id,request_id,actor_id,action,details)
  values(w.organization_id,material.id,actor,'purchase',jsonb_build_object('requisition_id',pr));
  return jsonb_build_object('id',pr);
exception when lock_not_available then raise exception 'Material request is busy; retry shortly' using errcode='55P03';
end;
$$;
revoke all on function public.bf_work_order_spares(uuid,text,uuid,uuid,numeric,text,uuid) from public, anon;
grant execute on function public.bf_work_order_spares(uuid,text,uuid,uuid,numeric,text,uuid) to authenticated;

create function public.bf_procurement_catalog_part(p_org uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  part_id uuid;
  maker text := btrim(coalesce(p_data->>'manufacturer',''));
  part_number text := btrim(coalesce(p_data->>'manufacturer_part_number',''));
begin
  if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
    or not public.bf7_can(p_org,'procurement.manage')
  then raise exception 'Procurement permission required' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>8192
    or length(btrim(coalesce(p_data->>'name_ar',''))) not between 1 and 200
    or length(btrim(coalesce(p_data->>'name_en',''))) not between 1 and 200
    or length(maker) not between 1 and 150 or length(part_number) not between 1 and 150
  then raise exception 'Catalog names, manufacturer and part number are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||lower(maker)||':'||lower(part_number),11));
  select id into part_id from public.bf_inv_parts
    where organization_id=p_org and status='active' and lower(btrim(manufacturer))=lower(maker)
      and lower(btrim(manufacturer_part_number))=lower(part_number) order by created_at,id limit 1;
  if part_id is not null then return part_id; end if;
  insert into public.bf_inv_parts(organization_id,sku,name_ar,name_en,manufacturer,manufacturer_part_number,created_by)
  values(p_org,'PART-'||lpad(nextval('public.bf6_part_seq')::text,6,'0'),
    btrim(p_data->>'name_ar'),btrim(p_data->>'name_en'),maker,part_number,actor)
  returning id into part_id;
  insert into public.bf7_events(organization_id,entity,entity_id,actor_id,action)
  values(p_org,'part',part_id,actor,'create');
  return part_id;
end;
$$;
revoke all on function public.bf_procurement_catalog_part(uuid,jsonb) from public,anon;
grant execute on function public.bf_procurement_catalog_part(uuid,jsonb) to authenticated;

create function private.bf_require_work_order_parts_approval()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.work_order_id is not null and new.status<>'submitted' then
    raise exception 'Use the approved spare parts request on the work order';
  end if;
  return new;
end;
$$;
revoke all on function private.bf_require_work_order_parts_approval() from public,anon,authenticated;
create trigger bf_require_work_order_parts_approval before insert on public.bf7_requisitions
  for each row execute function private.bf_require_work_order_parts_approval();

alter function private.bf12_next_action_items() rename to bf12_next_action_before_spare_parts;
create function private.bf12_next_action_items()
returns table(notification_key text,organization_id uuid,client_id uuid,kind text,severity text,
  title text,body text,occurred_at timestamptz,action_url text)
language sql stable security definer set search_path='' as $$
  select * from private.bf12_next_action_before_spare_parts()
  union all
  select 'spare-review:'||r.id,w.organization_id,w.client_id,'spare_review','high',
    w.work_order_number||' — '||r.number,'',r.created_at,'/corrective/work_order/'||w.id
  from public.bf8_material_requests r
  join public.bf_work_orders w on w.id=r.work_order_id
  left join public.bf44_workflows f on f.work_order_id=w.id
  where r.status='submitted' and r.created_by<>auth.uid()
    and w.status in ('accepted','in_progress','on_hold') and f.report_id is null
    and exists(select 1 from public.bf8_material_lines l where l.request_id=r.id)
    and private.bf_spare_can_review(w,f.project_id)
  union all
  select 'spare-purchase:'||q.id,q.organization_id,w.client_id,'spare_purchase','high',
    q.number||' — '||w.work_order_number,'',q.created_at,'/procurement/requisition/'||q.id
  from public.bf_spare_purchase_links link
  join public.bf7_requisitions q on q.id=link.requisition_id
  join public.bf_work_orders w on w.id=q.work_order_id
  where q.status='submitted' and q.created_by<>auth.uid()
    and public.bf7_can(q.organization_id,'procurement.view')
    and (public.bf7_can(q.organization_id,'procurement.manage') or public.bf7_can(q.organization_id,'procurement.approve'));
$$;
revoke all on function private.bf12_next_action_items() from public,anon,authenticated;
