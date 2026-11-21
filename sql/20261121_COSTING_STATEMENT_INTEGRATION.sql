-- Use current organization membership and finance grants for the existing cost APIs.
create or replace function public.bf15_can(p_org uuid,p_perm text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_org is not null
  and p_perm in ('costing.view','costing.manage')
  and exists(select 1 from public.bf_profiles p where p.id=auth.uid() and p.status='active')
  and (public.bf_is_super_admin() or (
   exists(select 1 from public.bf_acl_user_organizations u where u.user_id=auth.uid()
     and u.organization_id=p_org and u.is_active)
   and (public.bf_acl_has_permission(p_org,'finance.manage',auth.uid())
     or (p_perm='costing.view' and public.bf_acl_has_permission(p_org,'finance.view',auth.uid())))
  ))
$$;

create or replace function public.bf15_save_rate(p_org uuid,p_technician uuid,p_rate numeric,p_currency text,p_from date,p_to date default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.bf15_can(p_org,'costing.manage') then raise exception 'Cost management permission required' using errcode='42501'; end if;
 if p_rate is null or p_rate::text in ('NaN','Infinity','-Infinity') or p_rate<0 or p_rate>=1e14 or scale(p_rate)>4
   or p_from is null or (p_to is not null and p_to<p_from) then raise exception 'Invalid hourly rate or effective period'; end if;
 if not exists(select 1 from public.bf_acl_user_organizations u join public.bf_profiles p on p.id=u.user_id and p.status='active'
   where u.organization_id=p_org and u.user_id=p_technician and u.is_active) then
  raise exception 'Select an active member of this company'; end if;
 insert into public.bf15_labor_rates(organization_id,technician_id,hourly_rate,currency,effective_from,effective_to,updated_by)
 values(p_org,p_technician,p_rate,upper(coalesce(p_currency,'SAR')),p_from,p_to,auth.uid())
 on conflict(organization_id,technician_id,effective_from) do update set hourly_rate=excluded.hourly_rate,
  currency=excluded.currency,effective_to=excluded.effective_to,updated_by=excluded.updated_by,updated_at=now();
end
$$;

create or replace function public.bf15_add_cost(p_work_order uuid,p_type text,p_description text,p_amount numeric,p_currency text,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.bf_work_orders; cost_id uuid; currency_code text:=upper(coalesce(p_currency,'SAR'));
begin
 select * into w from public.bf_work_orders where id=p_work_order;
 if w.id is null or not public.bf15_can(w.organization_id,'costing.manage') then
  raise exception 'Cost management permission required' using errcode='42501'; end if;
 if p_type is null or p_type not in ('contractor','transport','rental','other')
   or length(btrim(coalesce(p_description,''))) not between 3 and 500
   or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0 or p_amount>=1e16
   or scale(p_amount)>2 or currency_code !~ '^[A-Z]{3}$' then raise exception 'Invalid work order expense'; end if;
 insert into public.bf15_work_order_costs(organization_id,work_order_id,cost_type,description,amount,currency,cost_date,created_by)
 values(w.organization_id,w.id,p_type,btrim(p_description),p_amount,currency_code,
   coalesce(p_date,(now() at time zone 'Asia/Riyadh')::date),auth.uid()) returning id into cost_id;
 return cost_id;
end
$$;

create function private.bf15_order_evidence(p_order uuid,p_currency text)
returns table(labor_minutes bigint,unpriced_labor_minutes bigint,labor_cost numeric,material_cost numeric,additional_cost numeric,work_order_cost_count bigint)
language sql stable set search_path='' as $$
 with labor as (
  select sum(l.minutes)::bigint minutes,
    sum(l.minutes) filter(where r.hourly_rate is null)::bigint unpriced,
    sum(l.minutes::numeric*r.hourly_rate/60) amount
  from public.bf9_labor l join public.bf9_visits v on v.id=l.visit_id and v.organization_id=l.organization_id
  left join lateral (
   select t.hourly_rate,t.currency from public.bf15_labor_rates t
   where t.organization_id=l.organization_id and t.technician_id=l.technician_id
    and t.effective_from<=(l.started_at at time zone 'Asia/Riyadh')::date
    and (t.effective_to is null or t.effective_to>=(l.started_at at time zone 'Asia/Riyadh')::date)
   order by t.effective_from desc limit 1
  )r on r.currency=p_currency
  where v.work_order_id=p_order and v.status<>'cancelled'
 ), material as (
  select sum(a.consumed_qty*c.unit_cost) amount
  from public.bf8_material_requests mr join public.bf8_material_lines ml on ml.request_id=mr.id
  join public.bf8_allocations a on a.line_id=ml.id
  join public.bf8_allocation_costs c on c.allocation_id=a.id and c.organization_id=mr.organization_id
  where mr.work_order_id=p_order and c.currency=p_currency
 ), extras as (
  select sum(amount) amount,count(*) items from public.bf15_work_order_costs
  where work_order_id=p_order and currency=p_currency and status='active'
 )
 select coalesce(l.minutes,0),coalesce(l.unpriced,0),round(coalesce(l.amount,0),2),
  round(coalesce(m.amount,0),2),coalesce(e.amount,0),e.items
 from labor l cross join material m cross join extras e
$$;
revoke all on function private.bf15_order_evidence(uuid,text) from public,anon,authenticated;

create function public.bf15_workspace_costs(p_org uuid,p_currency text default 'SAR')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.bf15_can(p_org,'costing.view') then raise exception 'Cost access required' using errcode='42501'; end if;
 if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
 with orders as (
  select w.id,w.title,w.work_order_number,w.created_at
  from public.bf_work_orders w where w.organization_id=p_org
  order by w.created_at desc,w.id limit 500
 ), costs as (
  select w.*,e.*,e.labor_cost+e.material_cost+e.additional_cost total_cost
  from orders w cross join lateral private.bf15_order_evidence(w.id,p_currency) e
 )
 select jsonb_build_object(
  'can_manage',public.bf15_can(p_org,'costing.manage'),
  'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from costs x),'[]'),
  'truncated',(select count(*)>500 from public.bf_work_orders where organization_id=p_org),
  'totals',(select jsonb_build_object('labor',coalesce(sum(labor_cost),0),'material',coalesce(sum(material_cost),0),
    'extra',coalesce(sum(additional_cost),0),'grand',coalesce(sum(total_cost),0)) from costs),
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email) order by p.full_name,p.id)
   from public.bf_acl_user_organizations u join public.bf_profiles p on p.id=u.user_id
   where u.organization_id=p_org and u.is_active and p.status='active'),'[]'),
  'rates',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('full_name',p.full_name) order by p.full_name,r.effective_from desc)
   from public.bf15_labor_rates r join public.bf_profiles p on p.id=r.technician_id where r.organization_id=p_org),'[]'),
  'extra_costs',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('work_order_number',w.work_order_number) order by c.created_at desc,c.id)
   from public.bf15_work_order_costs c join public.bf_work_orders w on w.id=c.work_order_id and w.organization_id=c.organization_id
   where c.organization_id=p_org and c.status='active' and c.currency=p_currency),'[]')
 ) into result;
 return result;
end
$$;
revoke all on function public.bf15_workspace_costs(uuid,text) from public,anon;
grant execute on function public.bf15_workspace_costs(uuid,text) to authenticated;

-- The project membership and separation-of-duties checks remain in the statement APIs.
do $$
declare definition text:=pg_get_functiondef('public.bf44_permission_keys(text)'::regprocedure);
begin
 if definition not like '%facilities.statements.manage%' then raise exception 'Unexpected finance permission mapping'; end if;
 execute replace(definition,'''facilities.statements.manage''','''facilities.statements.manage'',''finance.manage''');
end
$$;

create function public.bf44_statement_cost_evidence(p_statement uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare st public.bf44_statements; pol public.bf44_policies; pr public.bf35_projects; result jsonb;
begin
 select * into st from public.bf44_statements where id=p_statement;
 select * into pol from public.bf44_policies where project_id=st.project_id;
 select * into pr from public.bf35_projects where id=st.project_id;
 if st.id is null or st.status not in ('draft','rejected') or not coalesce(public.bf44_staff(st.project_id,'costing.manage'),false)
  or not public.bf15_can(pr.organization_id,'costing.view')
  or auth.uid()=pol.owner_reviewer or auth.uid()=pol.consultant_reviewer then return '{}'::jsonb; end if;
 select coalesce(jsonb_object_agg(c.id,to_jsonb(e)),'{}') into result
 from public.bf44_certificates c join public.bf44_workflows f on f.work_order_id=c.work_order_id
 join public.bf_work_orders w on w.id=c.work_order_id
 cross join lateral private.bf15_order_evidence(c.work_order_id,pol.currency) e
 where pol.status='active' and pol.contract_id=pr.contract_id
   and f.project_id=st.project_id and w.organization_id=pr.organization_id and w.client_id=pr.client_id
   and w.contract_id=pr.contract_id and (c.issued_at at time zone 'Asia/Riyadh')::date between st.period_start and st.period_end
   and not exists(select 1 from public.bf44_statement_lines l where l.certificate_id=c.id and l.statement_id<>st.id);
 return result;
end
$$;

create function public.bf44_import_statement_labor(p_statement uuid,p_certificate uuid,p_rate uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare st public.bf44_statements; r public.bf44_contract_price_items; evidence jsonb; mins numeric;
begin
 select * into st from public.bf44_statements where id=p_statement for update;
 if st.id is null or st.statement_kind<>'monthly' or st.status not in ('draft','rejected')
  or not coalesce(public.bf44_staff(st.project_id,'costing.manage'),false) then
  raise exception 'Editable monthly statement permission required' using errcode='42501'; end if;
 select * into r from public.bf44_contract_price_items where id=p_rate and contract_id=st.pricing_contract_id
   and category='labor' and pricing in ('unit','included')
   and lower(btrim(unit)) in ('h','hr','hrs','hour','hours','ساعة','ساعات');
 if not found then raise exception 'Select an hourly labor item from the statement contract'; end if;
 evidence:=public.bf44_statement_cost_evidence(p_statement)->p_certificate::text;
 mins:=(evidence->>'labor_minutes')::numeric;
 if mins is null or mins<=0 then raise exception 'No recorded labor is available for this certificate and period'; end if;
 if exists(select 1 from public.bf44_statement_measurements m where m.statement_id=st.id and m.certificate_id=p_certificate
   and m.category='labor' and m.price_item_id<>r.id and lower(btrim(m.unit)) in ('h','hr','hrs','hour','hours','ساعة','ساعات')) then
  raise exception 'Review the existing hourly labor line before importing the same hours'; end if;
 return public.bf44_statement_measure(st.id,'save',jsonb_build_object('certificate_id',p_certificate,
   'price_item_id',r.id,'quantity',round(mins/60,3),
   'basis','سجل ساعات أمر العمل / Work order labor log · '||mins::text||' min'));
end
$$;
revoke all on function public.bf44_statement_cost_evidence(uuid),public.bf44_import_statement_labor(uuid,uuid,uuid) from public,anon;
grant execute on function public.bf44_statement_cost_evidence(uuid),public.bf44_import_statement_labor(uuid,uuid,uuid) to authenticated;
