begin;
create or replace function private.bf12_next_action_items()
returns table(notification_key text,organization_id uuid,client_id uuid,kind text,severity text,title text,body text,occurred_at timestamptz,action_url text)
language sql stable security definer set search_path='' as $notice$
with actor as (
 select p.id from public.bf_profiles p where p.id=auth.uid() and p.status='active'
), entities as (
 select 'work_order'::text entity_type,w.id,w.organization_id,w.client_id,w.site_id,w.status,w.approval_status,
  w.work_order_number number,w.title,w.created_at,w.updated_at changed_at,
  coalesce(w.completed_at,(select max(x.assigned_at) from public.bf_work_order_assignments x where x.work_order_id=w.id and x.user_id=auth.uid()),w.assigned_at,w.created_at)::text token,
  exists(select 1 from public.bf_work_order_assignments x where x.work_order_id=w.id) has_assignee,
  exists(select 1 from public.bf_work_order_assignments x where x.work_order_id=w.id and x.user_id=auth.uid()) assigned,
  f.project_id cycle_project
 from public.bf_work_orders w cross join actor
 left join public.bf44_workflows f on f.work_order_id=w.id
 where w.status not in('closed','cancelled')
  and not exists(select 1 from public.bf_ppm_jobs j where j.work_order_id=w.id and j.status not in('closed','cancelled'))
 union all
 select 'ppm_job',j.id,j.organization_id,j.client_id,j.site_id,j.status,null,
  j.job_number,coalesce(a.name_ar,a.name_en,j.job_number),j.created_at,
  coalesce(j.approved_at,j.completed_at,j.started_at,j.created_at),
  coalesce((select max(ev.created_at) from public.bf_ppm_events ev where ev.job_id=j.id and ev.action in('assign','assigned','reassign')),j.approved_at,j.completed_at,j.started_at,j.created_at)::text,
  j.assigned_to is not null,j.assigned_to=auth.uid(),f.project_id
 from public.bf_ppm_jobs j cross join actor
 left join public.bf_assets a on a.id=j.asset_id
 left join public.bf44_workflows f on f.work_order_id=j.work_order_id
 where j.status not in('closed','cancelled')
), classified as (
 select e.*,o.id owner_id,o.status owner_status,o.decided_at,
  (select d.id from public.bf13_documents d where d.document_type='approval_certificate' and d.entity_type='approval' and d.entity_id=o.id and d.status='final' order by d.generated_at desc limit 1) certificate_id,
  (select d.id::text||':'||d.status from public.bf13_documents d where d.document_type='approval_certificate' and d.entity_type='approval' and d.entity_id=o.id order by d.generated_at desc,d.id desc limit 1) certificate_token
 from entities e
 left join lateral(select a.id,a.status,a.decided_at from public.bf11_approvals a where a.entity_type=e.entity_type and a.entity_id=e.id and a.reviewer_type='owner' order by a.round desc,a.requested_at desc limit 1) o on true
), stages as (
 select e.*,case
  when e.status in('draft','scheduled') or e.status='assigned' and not e.has_assignee then 'maintenance_assign'
  when e.status in('assigned','accepted','in_progress') and e.assigned then 'maintenance_execute'
  when e.status='completed' and e.entity_type='work_order' and e.approval_status is distinct from 'pending' then 'maintenance_submit_qa'
  when e.status='completed' then 'maintenance_review'
  when e.status='approved' and e.cycle_project is null and (e.owner_status is null or e.owner_status in('rejected','cancelled')) then 'maintenance_owner_submit'
  when e.status='approved' and e.cycle_project is null and e.owner_status='approved' and e.certificate_id is null then 'maintenance_certificate'
  when e.status='approved' and e.cycle_project is null and e.owner_status='approved' and e.certificate_id is not null then 'maintenance_close'
 end stage
 from classified e
), cycle as (
 select f.*,w.organization_id,w.client_id,w.site_id,w.work_order_number,w.title,w.updated_at,
  po.consultant_reviewer,co.id consultant_id,co.status consultant_status,ow.id owner_id,ow.status owner_status,
  cert.id certificate_id,cert.certificate_number,
  case when f.report_id is null then 'cycle_report'
   when po.consultant_reviewer is not null and co.status is distinct from 'approved' then
    case when co.status='pending' then null else 'cycle_submit' end
   when ow.status is distinct from 'approved' then
    case when ow.status='pending' then null else 'cycle_submit' end
   when cert.id is null then 'cycle_certificate'
   when not exists(select 1 from public.bf44_statement_lines sl where sl.certificate_id=cert.id) then 'statement_prepare'
  end stage
 from public.bf44_workflows f
 join public.bf_work_orders w on w.id=f.work_order_id and w.status='approved'
 join public.bf44_policies po on po.project_id=f.project_id and po.status='active'
 cross join actor
 left join lateral(select a.id,a.status from public.bf44_review_links l join public.bf11_approvals a on a.id=l.approval_id where l.work_order_id=f.work_order_id and l.revision=f.revision and a.reviewer_type='consultant' order by a.round desc,a.requested_at desc limit 1) co on true
 left join lateral(select a.id,a.status from public.bf44_review_links l join public.bf11_approvals a on a.id=l.approval_id where l.work_order_id=f.work_order_id and l.revision=f.revision and a.reviewer_type='owner' order by a.round desc,a.requested_at desc limit 1) ow on true
 left join public.bf44_certificates cert on cert.work_order_id=f.work_order_id
)
select 'next:'||e.entity_type||':'||e.id::text||':'||e.stage||':'||
 case when e.stage in('maintenance_certificate','maintenance_close') then e.owner_id::text||':'||coalesce(e.certificate_token,'none')
      when e.stage='maintenance_owner_submit' then coalesce(e.owner_id::text,'initial')
      else md5(e.token||':'||e.status) end,
 e.organization_id,e.client_id,e.stage,
 case when e.stage in('maintenance_review','maintenance_owner_submit') then 'high' else 'normal' end,
 e.number||' — '||e.title,''::text,coalesce(e.decided_at,e.changed_at,e.created_at),
 case when e.stage='maintenance_certificate' then '/documents?entity='||e.id::text||'&approval='||e.owner_id::text
      else case when e.entity_type='ppm_job' then '/ppm/job/' else '/corrective/work_order/' end||e.id::text end
from stages e
where e.stage is not null and case
 when e.stage in('maintenance_assign','maintenance_submit_qa') then
  case when e.cycle_project is not null then public.bf44_staff(e.cycle_project,case when e.entity_type='ppm_job' then 'ppm.manage' else 'corrective.manage' end,e.site_id)
       else public.bf4_staff(e.organization_id,case when e.entity_type='ppm_job' then 'ppm.manage' else 'corrective.manage' end) end
 when e.stage='maintenance_execute' then e.assigned and
  case when e.cycle_project is not null then public.bf44_staff(e.cycle_project,case when e.entity_type='ppm_job' then 'ppm.execute' else 'corrective.execute' end,e.site_id)
       else public.bf4_staff(e.organization_id,case when e.entity_type='ppm_job' then 'ppm.execute' else 'corrective.execute' end) end
 when e.stage='maintenance_review' then
  case when e.cycle_project is not null then public.bf44_staff(e.cycle_project,case when e.entity_type='ppm_job' then 'ppm.approve' else 'corrective.approve' end,e.site_id)
       else public.bf4_staff(e.organization_id,case when e.entity_type='ppm_job' then 'ppm.approve' else 'corrective.approve' end) end
 when e.stage='maintenance_owner_submit' then public.bf11_can_view(e.organization_id,e.client_id) and public.bf4_staff(e.organization_id,'approvals.request')
 when e.stage='maintenance_certificate' then public.bf11_can_view(e.organization_id,e.client_id) and public.bf4_staff(e.organization_id,'documents.generate')
 when e.stage='maintenance_close' then public.bf11_can_view(e.organization_id,e.client_id) and public.bf4_staff(e.organization_id,case when e.entity_type='ppm_job' then 'ppm.approve' else 'corrective.approve' end)
 else false end
union all
select 'next:cycle:'||c.work_order_id::text||':'||c.stage||':'||c.revision::text||':'||coalesce(c.owner_id::text,c.consultant_id::text,c.report_id::text,'initial'),
 c.organization_id,c.client_id,c.stage,'high',c.work_order_number||' — '||c.title,''::text,c.updated_at,
 '/maintenance-cycle/'||c.work_order_id::text
from cycle c where c.stage is not null and public.bf44_view(c.project_id,c.site_id) and case
 when c.stage='cycle_report' then public.bf44_staff(c.project_id,'documents.generate',c.site_id)
 when c.stage='cycle_submit' then public.bf44_staff(c.project_id,'approvals.request',c.site_id)
 when c.stage='cycle_certificate' then public.bf44_staff(c.project_id,'documents.generate',c.site_id) or public.bf44_reviewer(c.project_id,'owner')
 when c.stage='statement_prepare' then public.bf44_staff(c.project_id,'costing.manage',c.site_id)
 else false end
union all
select 'next:statement:'||s.id::text||':'||s.status||':'||md5(coalesce(s.submitted_at,s.created_at)::text||':'||coalesce(s.comment,'')),
 pr.organization_id,pr.client_id,
 case when s.status in('draft','rejected') then 'statement_submit' else 'statement_review' end,'high',s.statement_number||' — '||pr.name,
 case when s.status='rejected' then coalesce(s.comment,'') else '' end,coalesce(s.submitted_at,s.created_at),'/statements/'||s.id::text
from public.bf44_statements s join public.bf35_projects pr on pr.id=s.project_id cross join actor
where s.status in('draft','rejected','consultant_review','owner_review') and public.bf44_view(s.project_id,null) and
 case when s.status in('draft','rejected') then public.bf44_staff(s.project_id,'costing.manage',null)
      else s.submitted_by is distinct from auth.uid() and public.bf44_reviewer(s.project_id,case when s.status='consultant_review' then 'consultant' else 'owner' end) end
union all
select 'next:request:'||r.id::text||':'||r.status,r.organization_id,r.client_id,'maintenance_request_review','normal',r.request_number||' — '||r.title,''::text,r.reported_at,'/corrective/request/'||r.id::text
from public.bf_service_requests r cross join actor left join public.bf44_policies p on p.project_id=r.project_id
where r.status in('submitted','triaged') and case when p.project_id is not null then public.bf44_staff(p.project_id,'corrective.manage',r.site_id) else public.bf4_staff(r.organization_id,'corrective.manage') end;
$notice$;
revoke all on function private.bf12_next_action_items() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bf12_feed(p_unread_only boolean DEFAULT false, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
 payload jsonb;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 200
 or p_offset is null or p_offset not between 0 and 10000
 then raise exception 'Invalid pagination';end if;

 with raw as (
  select
   'approval:'||a.id::text notification_key,
   a.organization_id,a.client_id,
   case when a.status='pending' then 'approval_pending'
        when a.status='rejected' then 'approval_rejected'
        else 'approval_decided' end kind,
   case when a.status='pending' then 'high' else 'normal' end severity,
   a.subject title,
   coalesce(a.decision_comment,a.request_comment,'') body,
   coalesce(a.decided_at,a.requested_at) occurred_at,
   case when exists(select 1 from public.bf44_review_links l where l.approval_id=a.id) then '/maintenance-cycle/'||(select l.work_order_id::text from public.bf44_review_links l where l.approval_id=a.id)
    when a.entity_type='ppm_job' then '/ppm/job/'||a.entity_id::text
    else '/corrective/work_order/'||a.entity_id::text end action_url
  from public.bf11_approvals a
  where (public.bf11_can_view(a.organization_id,a.client_id)
   or exists(select 1 from public.bf44_review_links l join public.bf44_workflows f on f.work_order_id=l.work_order_id join public.bf_work_orders w on w.id=f.work_order_id where l.approval_id=a.id and l.revision=f.revision and public.bf44_view(f.project_id,w.site_id)))
   and (
    (a.status='pending' and a.requested_by<>auth.uid() and (
      exists(select 1 from public.bf44_review_links l join public.bf44_workflows f on f.work_order_id=l.work_order_id where l.approval_id=a.id and l.revision=f.revision and public.bf44_reviewer(f.project_id,a.reviewer_type))
      or (not exists(select 1 from public.bf44_review_links l where l.approval_id=a.id) and (
       a.reviewer_type='owner' and public.bf11_owner(a.organization_id,a.client_id)
       or a.reviewer_type='consultant' and public.bf11_consultant(a.organization_id,a.client_id)
      ))
    ))
    or (a.status='rejected' and (a.requested_by=auth.uid() or public.bf4_staff(a.organization_id,'approvals.request')
      or exists(select 1 from public.bf44_review_links l join public.bf44_workflows f on f.work_order_id=l.work_order_id where l.approval_id=a.id and l.revision=f.revision and public.bf44_staff(f.project_id,'approvals.request',null))))
    or (a.status='approved' and a.requested_by=auth.uid())
   )

  union all

  select
   'wo:'||w.id::text||':'||coalesce(w.sla_status,'')||':'||w.status,
   w.organization_id,w.client_id,
   case when w.sla_status='breached' then 'sla_breached'
        when w.status='on_hold' then 'work_order_on_hold'
        else 'work_order_due' end,
   case when w.sla_status='breached' then 'critical'
        when w.priority in('P1','P2') then 'high' else 'normal' end,
   w.work_order_number||' - '||w.title,
   coalesce(w.hold_reason,w.description,''),
   coalesce(w.updated_at,w.created_at),
   '/corrective/work_order/'||w.id::text
  from public.bf_work_orders w
  where w.status not in('closed','cancelled','completed','approved')
   and (public.bf4_staff(w.organization_id,'corrective.manage') or public.bf4_assigned(w.id))
   and (
    w.sla_status='breached'
    or w.status='on_hold'
    or (w.completion_due_at is not null and w.completion_due_at<=now()+interval '24 hours')
   )

  union all

  select
   'ppm:'||j.id::text||':'||j.status,
   j.organization_id,j.client_id,
   case when j.due_date<current_date then 'ppm_overdue' else 'ppm_due' end,
   case when j.due_date<current_date then 'high' else 'normal' end,
   j.job_number,
   'PPM due '||j.due_date::text,
   j.created_at,
   '/ppm/job/'||j.id::text
  from public.bf_ppm_jobs j
  where j.status not in('closed','cancelled','approved','completed')
    and j.due_date<=current_date+1
    and (
      public.bf4_staff(j.organization_id,'ppm.manage')
      or (j.assigned_to=auth.uid() and public.bf4_staff(j.organization_id,'ppm.execute'))
    )

  union all
  select * from private.bf12_next_action_items()
 ),
 dedup as (
  select distinct on(notification_key) *
  from raw order by notification_key,occurred_at desc
 ),
 marked as (
  select d.*,(rr.notification_key is not null and (d.kind not in('approval_pending','approval_rejected','approval_decided') or rr.read_at>=d.occurred_at)) is_read,rr.read_at
  from dedup d
  left join public.bf12_notification_reads rr
    on rr.user_id=auth.uid() and rr.notification_key=d.notification_key
 ),
 filtered as (
  select * from marked where not p_unread_only or not is_read
 )
 select jsonb_build_object(
   'total',(select count(*) from marked),
   'unread',(select count(*) from marked where not is_read),
   'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from filtered order by
       case severity when 'critical' then 1 when 'high' then 2 else 3 end,
       occurred_at desc,notification_key
       limit p_limit offset p_offset
   ) x),'[]'::jsonb),
   'limit',p_limit,'offset',p_offset,
   'has_more',(select count(*) from filtered)>p_offset+p_limit
 ) into payload;
 return payload;
end $function$

;
commit;
