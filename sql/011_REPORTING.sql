-- Sprint 10: read-only management reporting. Requires migration 010 (marker 9).
-- No existing tables, policies, financial balances or work-order states are changed.
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=9)
 or to_regclass('public.bf9_labor') is null
 or to_regclass('public.bf8_allocation_costs') is null
 then raise exception 'Sprint 9 must be installed first';end if;
 if exists(select 1 from public.bf_migrations where version=10)
 then raise exception 'Sprint 10 already installed';end if;
end $$;

insert into public.bf_permissions(code,description)
values('reports.view','View operational management reports'),
('reports.export','Export operational management reports')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code in('company_admin','facility_manager','maintenance_manager','supervisor')
and p.code in('reports.view','reports.export')
on conflict do nothing;

create or replace function public.bf10_report(
 p_org uuid,p_start date,p_end date,p_client uuid default null,
 p_site uuid default null,p_section text default 'overview',
 p_limit integer default 200,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC'
as $$
declare
 filters jsonb; result jsonb; rows_data jsonb; totals jsonb;
 finish_at timestamptz; allowed boolean;
begin
 if auth.uid() is null or not public.bf4_staff(p_org,'reports.view')
 then raise exception 'Reporting permission required' using errcode='42501';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366
 then raise exception 'Select a valid range of at most 367 calendar days';end if;
 if p_limit is null or p_limit<1 or p_limit>500 or p_offset is null or p_offset<0 or p_offset>100000
 then raise exception 'Invalid pagination';end if;
 if p_section not in('overview','work_orders','ppm','technicians','materials','monthly','quality')
 then raise exception 'Unknown report section';end if;
 if p_client is not null and not exists(select 1 from public.bf_clients
  where id=p_client and organization_id=p_org)
 then raise exception 'Invalid client';end if;
 if p_site is not null and not exists(select 1 from public.bf_sites
  where id=p_site and organization_id=p_org and (p_client is null or client_id=p_client))
 then raise exception 'Invalid site';end if;
 finish_at:=(p_end+1)::timestamptz;
 allowed:=public.bf4_staff(p_org,'inventory.cost.view');
 filters:=jsonb_build_object('organization_id',p_org,'start_date',p_start,'end_date',p_end,
  'client_id',p_client,'site_id',p_site,'section',p_section);
 -- The end date is inclusive. All event timestamps use a half-open UTC interval.
 if p_section='overview' then
  with wo as (
   select * from public.bf_work_orders w where w.organization_id=p_org
   and (p_client is null or w.client_id=p_client) and (p_site is null or w.site_id=p_site)
   and w.created_at>=p_start::timestamptz and w.created_at<finish_at
  ), jobs as (
   select * from public.bf_ppm_jobs j where j.organization_id=p_org
   and (p_client is null or j.client_id=p_client) and (p_site is null or j.site_id=p_site)
   and j.due_date between p_start and p_end and j.status<>'cancelled'
  ), labor as (
   select l.minutes from public.bf9_labor l join public.bf9_visits v on v.id=l.visit_id
   join public.bf_work_orders w on w.id=v.work_order_id
   where w.organization_id=p_org and (p_client is null or w.client_id=p_client)
   and (p_site is null or w.site_id=p_site)
   and l.started_at>=p_start::timestamptz and l.started_at<finish_at
  )
  select jsonb_build_object(
   'work_orders', (select count(*) from wo),
   'open_work_orders',(select count(*) from wo where status not in('closed','cancelled')),
   'closed_work_orders',(select count(*) from wo where status='closed'),
   'cancelled_work_orders',(select count(*) from wo where status='cancelled'),
   'sla_breached',(select count(*) from wo where sla_status='breached'),
   'ppm_due',(select count(*) from jobs),
   'ppm_closed',(select count(*) from jobs where status='closed'),
   'ppm_overdue',(select count(*) from jobs where due_date<current_date and status not in('closed','approved','cancelled')),
   'labor_minutes',(select coalesce(sum(minutes),0) from labor),
   'report_limitations','WO counts use creation date; PPM uses due date; labor uses start date. No assumed completion or SLA compliance.'
  ) into totals;
  rows_data:='[]'::jsonb;
 elsif p_section='work_orders' then
  with scoped as (
   select w.id,w.id as work_order_id,w.work_order_number,w.title,w.client_id,w.site_id,w.asset_id,w.priority,w.status,
    w.approval_status,w.sla_status,w.created_at,w.started_at,w.completed_at,w.closed_at,
    w.completion_due_at,w.diagnosis,w.root_cause,w.work_performed,
    case when w.accepted_at>=w.created_at then round(extract(epoch from w.accepted_at-w.created_at)/60,1) end as response_minutes,
    case when w.completed_at>=w.started_at then round(extract(epoch from w.completed_at-w.started_at)/60,1) end as completion_minutes
   from public.bf_work_orders w where w.organization_id=p_org
   and (p_client is null or w.client_id=p_client) and (p_site is null or w.site_id=p_site)
   and w.created_at>=p_start::timestamptz and w.created_at<finish_at
  )
  select jsonb_build_object('count',(select count(*) from scoped)),
   coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from scoped order by created_at desc,id limit p_limit offset p_offset)x),'[]'::jsonb)
  into totals,rows_data;
 elsif p_section='ppm' then
  with scoped as (
   select j.id,j.job_number,j.plan_id,j.asset_id,j.client_id,j.site_id,j.due_date,j.status,
    j.assigned_to,j.started_at,j.completed_at,j.approved_at,j.closed_at,
    (select count(*) from public.bf_ppm_results rr where rr.job_id=j.id and rr.result='fail') as failed_steps,
    (select count(*) from public.bf_ppm_followups f where f.job_id=j.id) as corrective_followups
   from public.bf_ppm_jobs j where j.organization_id=p_org
   and (p_client is null or j.client_id=p_client) and (p_site is null or j.site_id=p_site)
   and j.due_date between p_start and p_end and j.status<>'cancelled'
  )
  select jsonb_build_object('count',(select count(*) from scoped),
   'closed',(select count(*) from scoped where status='closed'),
   'due',(select count(*) from scoped),
   'failed_jobs',(select count(*) from scoped where failed_steps>0)),
   coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from scoped order by due_date,id limit p_limit offset p_offset)x),'[]'::jsonb)
  into totals,rows_data;
 elsif p_section='technicians' then
  with scoped as (
   select l.id,l.technician_id,p.full_name,l.visit_id,v.work_order_id,w.work_order_number,
    w.client_id,w.site_id,l.started_at,l.ended_at,l.minutes,l.activity
   from public.bf9_labor l join public.bf9_visits v on v.id=l.visit_id
   join public.bf_work_orders w on w.id=v.work_order_id
   left join public.bf_profiles p on p.id=l.technician_id
   where w.organization_id=p_org and (p_client is null or w.client_id=p_client)
   and (p_site is null or w.site_id=p_site)
   and l.started_at>=p_start::timestamptz and l.started_at<finish_at
  )
  select jsonb_build_object('count',(select count(*) from scoped),
   'minutes',coalesce((select sum(minutes) from scoped),0),
   'technician_count',(select count(distinct technician_id) from scoped),
   'visit_count',(select count(distinct visit_id) from scoped),
   'technicians',coalesce((select jsonb_agg(to_jsonb(t) order by t.full_name) from
    (select technician_id,max(full_name) as full_name,count(*) as labor_records,
     count(distinct visit_id) as visits,count(distinct work_order_id) as work_orders,
     sum(minutes) as minutes from scoped group by technician_id order by sum(minutes) desc limit 500)t),'[]'::jsonb)),
   coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from scoped order by started_at desc,id limit p_limit offset p_offset)x),'[]'::jsonb)
  into totals,rows_data;
 elsif p_section='materials' then
  -- Only actual consumption is included; reservations, issues, receipts and
  -- returned stock are excluded. Cost is never exposed without cost permission.
  with scoped as (
   select a.id,a.line_id,r.work_order_id,w.work_order_number,w.client_id,w.site_id,
    l.part_id,p.sku,p.name_en,p.name_ar,p.unit,l.owner_client_id,
    st.lot_code,st.serial_number,c.currency,ev.consumed_qty,
    case when allowed then c.unit_cost else null end as unit_cost,
    case when allowed then ev.consumed_qty*c.unit_cost else null end as actual_cost,
    r.created_at as request_created_at
   from public.bf8_allocations a
   join public.bf8_material_lines l on l.id=a.line_id
   join public.bf8_material_requests r on r.id=l.request_id
   join public.bf_work_orders w on w.id=r.work_order_id
   join public.bf_inv_parts p on p.id=l.part_id
   join public.bf7_stock_lots st on st.id=a.stock_lot_id
   join public.bf8_allocation_costs c on c.allocation_id=a.id
   join (
    select e.allocation_id,sum(e.quantity) as consumed_qty
    from public.bf8_material_events e
    where e.organization_id=p_org and e.action='consume'
     and e.created_at>=p_start::timestamptz and e.created_at<finish_at
    group by e.allocation_id
   ) ev on ev.allocation_id=a.id
   where w.organization_id=p_org and (p_client is null or w.client_id=p_client)
   and (p_site is null or w.site_id=p_site) and ev.consumed_qty>0
  )
  select jsonb_build_object('count',(select count(*) from scoped),
   'cost_available',allowed,'cost_basis','Period consumption events multiplied by the allocation cost snapshot. Returns and financial reversals are not netted; internal gross cost only.'),
   coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from scoped order by request_created_at desc,id limit p_limit offset p_offset)x),'[]'::jsonb)
  into totals,rows_data;
 elsif p_section='monthly' then
  with months as (
   select generate_series(date_trunc('month',p_start::timestamp),
    date_trunc('month',p_end::timestamp),interval '1 month')::date as month
  ), scoped as (
   select w.created_at,w.status,w.sla_status from public.bf_work_orders w
   where w.organization_id=p_org and (p_client is null or w.client_id=p_client)
   and (p_site is null or w.site_id=p_site)
   and w.created_at>=p_start::timestamptz and w.created_at<finish_at
  )
  select jsonb_build_object('count',(select count(*) from months)),
   coalesce((select jsonb_agg(to_jsonb(x)) from (
    select m.month,count(w.created_at) as created,
     count(*) filter(where w.status='closed') as currently_closed,
     count(*) filter(where w.sla_status='breached') as currently_breached
    from months m left join scoped w on w.created_at>=m.month::timestamptz
     and w.created_at<(m.month+interval '1 month')::timestamptz
    group by m.month order by m.month)x),'[]'::jsonb)
  into totals,rows_data;
 elsif p_section='quality' then
  with scoped as (
   select e.id,e.work_order_id,w.work_order_number,w.client_id,w.site_id,e.action,e.from_status,
    e.to_status,e.created_at
   from public.bf_corrective_events e join public.bf_work_orders w on w.id=e.work_order_id
   where w.organization_id=p_org and (p_client is null or w.client_id=p_client)
   and (p_site is null or w.site_id=p_site)
   and e.created_at>=p_start::timestamptz and e.created_at<finish_at
   and e.action in('approve','reject_qa','reopen','submit_qa','close')
  )
  select jsonb_build_object('count',(select count(*) from scoped),
   'qa_rejections',(select count(*) from scoped where action='reject_qa'),
   'reopens',(select count(*) from scoped where action='reopen')),
   coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from scoped order by created_at desc,id limit p_limit offset p_offset)x),'[]'::jsonb)
  into totals,rows_data;
 end if;
 result:=jsonb_build_object('filters',filters,'generated_at',now(),
  'totals',coalesce(totals,'{}'::jsonb),'rows',coalesce(rows_data,'[]'::jsonb),
  'limit',p_limit,'offset',p_offset,'has_more',
   coalesce((totals->>'count')::bigint,0)>p_offset+p_limit);
 return result;
end $$;
revoke all on function public.bf10_report(uuid,date,date,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.bf10_report(uuid,date,date,uuid,uuid,text,integer,integer) to authenticated;
-- The export endpoint checks a separate permission; it never bypasses the view/cost checks.
create or replace function public.bf10_export(
 p_org uuid,p_start date,p_end date,p_client uuid default null,
 p_site uuid default null,p_section text default 'work_orders',
 p_limit integer default 500,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC'
as $$
begin
 if not public.bf4_staff(p_org,'reports.export')
 then raise exception 'Export permission required' using errcode='42501';end if;
 return public.bf10_report(p_org,p_start,p_end,p_client,p_site,p_section,p_limit,p_offset);
end $$;
revoke all on function public.bf10_export(uuid,date,date,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.bf10_export(uuid,date,date,uuid,uuid,text,integer,integer) to authenticated;

-- Selector directory is scoped by the same management-report permission.
create or replace function public.bf10_scopes()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name)
   from public.bf_organizations o where public.bf4_staff(o.id,'reports.view')),'[]'::jsonb),
  'clients',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'organization_id',c.organization_id,'name',c.name) order by c.name)
   from public.bf_clients c where public.bf4_staff(c.organization_id,'reports.view')),'[]'::jsonb),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'organization_id',s.organization_id,'client_id',s.client_id,'name',s.name) order by s.name)
   from public.bf_sites s where public.bf4_staff(s.organization_id,'reports.view')),'[]'::jsonb)
 );
$$;
revoke all on function public.bf10_scopes() from public,anon;
grant execute on function public.bf10_scopes() to authenticated;

insert into public.bf_migrations(version) values(10);
commit;
