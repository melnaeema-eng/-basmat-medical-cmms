create function public.bf_med_workspace_dashboard(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 privileged boolean;
 may_work boolean; may_ppm boolean; may_assets boolean;
 today date:=(now() at time zone 'Asia/Riyadh')::date;
 result jsonb;
begin
 if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
 or not exists(select 1 from public.bf_organizations where id=p_org and status='active') then
  raise exception 'Active workspace required' using errcode='42501';
 end if;
 privileged:=public.bf_is_super_admin() or public.bf_company_is_admin(p_org);
 if not privileged and not exists(select 1 from public.bf_acl_user_organizations
    where user_id=actor and organization_id=p_org and is_active) then
  raise exception 'Workspace access required' using errcode='42501';
 end if;
 may_work:=public.bf_acl_has_permission(p_org,'medical.work_orders.view',actor);
 may_ppm:=public.bf_acl_has_permission(p_org,'medical.ppm.view',actor);
 may_assets:=public.bf_acl_has_permission(p_org,'medical.assets.view',actor);

 with scope as materialized (
  select distinct p.id project_id,p.client_id,p.contract_id,ps.site_id
  from public.bf_acl_user_projects m
  join public.bf35_projects p on p.id=m.project_id and p.organization_id=p_org
  join public.bf35_project_sites ps on ps.project_id=p.id and ps.organization_id=p.organization_id and ps.client_id=p.client_id
  where m.user_id=actor and m.organization_id=p_org and m.is_active
    and m.module_code in ('shared','medical')
    and (m.site_id is null or m.site_id=ps.site_id)
    and (m.valid_from is null or m.valid_from<=current_date)
    and (m.valid_until is null or m.valid_until>=current_date)
 ), unambiguous as materialized (
  select ps.site_id,ps.client_id,p.contract_id,(array_agg(p.id))[1] project_id
  from public.bf35_project_sites ps
  join public.bf35_projects p on p.id=ps.project_id and p.organization_id=ps.organization_id and p.client_id=ps.client_id
  where ps.organization_id=p_org and p.contract_id is not null
     and exists(select 1 from scope sc where sc.site_id=ps.site_id and sc.client_id=ps.client_id)
  group by ps.site_id,ps.client_id,p.contract_id having count(distinct p.id)=1
 ), work as materialized (
  select w.id,w.work_order_number,w.title,w.priority,w.status,w.sla_status,w.asset_id,w.completion_due_at,w.created_at
  from public.bf_work_orders w
  left join public.bf44_workflows f on f.work_order_id=w.id
  left join unambiguous legacy on legacy.site_id=w.site_id and legacy.client_id=w.client_id and legacy.contract_id=w.contract_id
  where w.organization_id=p_org and may_work and (privileged or exists(
   select 1 from scope sc where sc.client_id=w.client_id and sc.site_id=w.site_id
      and sc.project_id=coalesce(w.project_id,f.project_id,legacy.project_id)))
 ), recent as (
  select r.* from (
   select w.*,row_number() over(partition by w.status order by w.created_at desc,w.id) bucket_rank,
    row_number() over(partition by w.sla_status order by w.created_at desc,w.id) sla_rank from work w
  ) r where bucket_rank<=7 or (sla_status='breached' and sla_rank<=7)
 ), planned as (
  select j.status,j.due_date from public.bf_ppm_jobs j
  join public.bf_ppm_plans plan on plan.id=j.plan_id and plan.organization_id=p_org
  left join public.bf_work_orders w on w.id=j.work_order_id and w.organization_id=p_org
  left join unambiguous legacy on legacy.site_id=j.site_id and legacy.client_id=j.client_id and legacy.contract_id=plan.contract_id
  where j.organization_id=p_org and j.status<>'cancelled' and may_ppm and (privileged or exists(
   select 1 from scope sc where sc.client_id=j.client_id and sc.site_id=j.site_id
     and sc.project_id=coalesce(w.project_id,plan.project_id,legacy.project_id)))
 ), company_assets as materialized (
  select a.id,a.asset_tag,a.name_ar,a.name_en,a.status
  from public.bf_assets a where a.organization_id=p_org and may_assets and (privileged or exists(
   select 1 from scope sc where sc.client_id=a.client_id and sc.site_id=a.site_id))
 )
 select jsonb_build_object(
  'total',(select count(*) from work),
  'completed',(select count(*) from work where status in ('completed','approved','closed')),
  'progress',(select count(*) from work where status='in_progress'),
  'overdue',(select count(*) from work where sla_status='breached'),
  'open',(select count(*) from work where status not in ('closed','cancelled')),
  'critical',(select count(*) from work where priority='P1' and status not in ('closed','cancelled')),
  'assets',(select count(*) from company_assets where status='active'),
  'ppmTotal',(select count(*) from planned),
  'ppmCompleted',(select count(*) from planned where status in ('completed','approved','closed')),
  'ppmOverdue',(select count(*) from planned where status='scheduled' and due_date<today),
  'ppmPending',(select count(*) from planned where status not in ('completed','approved','closed')),
  'rows',coalesce((select jsonb_agg(to_jsonb(r)-array['bucket_rank','sla_rank'] order by r.created_at desc,r.id) from recent r),'[]'::jsonb),
  'assetsById',coalesce((select jsonb_object_agg(a.id,to_jsonb(a)-'status') from company_assets a
    where exists(select 1 from recent r where r.asset_id=a.id)),'{}'::jsonb),
  'companyWide',privileged,
  'assignedProjects',exists(select 1 from scope),
  'canWork',may_work,'canPpm',may_ppm,'canAssets',may_assets
 ) into result;
 return result;
end
$$;
revoke all on function public.bf_med_workspace_dashboard(uuid) from public,anon;
grant execute on function public.bf_med_workspace_dashboard(uuid) to authenticated;
