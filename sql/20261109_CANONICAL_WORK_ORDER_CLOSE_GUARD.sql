begin;
create or replace function public.bm_wo_closure_guard()
returns trigger language plpgsql set search_path to '' as $function$
declare activated timestamptz; latest_owner public.bf11_approvals;
begin
 if new.status='closed' and old.status is distinct from new.status then
 select activated_at into activated from public.bm_wo_workflow_activation where singleton=true;
 if old.created_at>=activated or exists(select 1 from public.bm_wo_owner_reviews where work_order_id=new.id) then
 if new.asset_id is null then raise exception 'Closure blocked: device required'; end if;
 -- Preserve the existing legacy completion chain, and recognize the current approval/document chain.
 if not (exists(select 1 from public.bm_wo_owner_reviews where work_order_id=new.id and status='accepted')
 and exists(select 1 from public.bm_wo_certificates where work_order_id=new.id)) then
 select * into latest_owner from public.bf11_approvals a
 where a.entity_type='work_order' and a.entity_id=new.id and a.reviewer_type='owner'
 and a.organization_id=new.organization_id and a.client_id=new.client_id and a.site_id=new.site_id
 order by a.round desc,a.requested_at desc limit 1;
 if latest_owner.id is null then
 select a.* into latest_owner from public.bf_ppm_jobs j join public.bf11_approvals a on a.entity_type='ppm_job' and a.entity_id=j.id and a.reviewer_type='owner'
 where j.work_order_id=new.id and j.organization_id=new.organization_id and j.client_id=new.client_id and j.site_id=new.site_id and j.asset_id=new.asset_id
 and j.status in('approved','closed') and a.organization_id=new.organization_id and a.client_id=new.client_id and a.site_id=new.site_id
 order by a.round desc,a.requested_at desc limit 1;
 end if;
 if latest_owner.id is null or latest_owner.status is distinct from 'approved' then raise exception 'Closure blocked: owner acceptance required'; end if;
 if not exists(select 1 from public.bf13_documents d where d.document_type='approval_certificate' and d.entity_type='approval'
 and d.entity_id=latest_owner.id and d.status='final' and d.organization_id=new.organization_id and d.client_id=new.client_id and d.site_id=new.site_id) then
 raise exception 'Closure blocked: completion certificate required'; end if;
 end if;
 end if;
 end if;
 return new;
end $function$;
commit;
