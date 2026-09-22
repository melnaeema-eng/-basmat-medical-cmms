-- Basmat Facilities CMMS — Sprint 29
-- Customer / Owner Portal
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=28)
 then raise exception 'Install and verify Sprint 28 first'; end if;
 if exists(select 1 from public.bf_migrations where version=29)
 then raise exception 'Sprint 29 already installed'; end if;
 if to_regclass('public.bf_client_access') is null
 or to_regclass('public.bf_service_requests') is null
 or to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf13_documents') is null
 or to_regclass('public.bf11_approvals') is null
 then raise exception 'Required owner portal sources are missing'; end if;
end $$;

create or replace function public.bf29_portal(
 p_client uuid default null,
 p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(
   select 1 from public.bf_profiles p where p.id=auth.uid() and p.status='active'
 )
 then raise exception 'Authentication required' using errcode='42501'; end if;

 if p_limit is null or p_limit not between 1 and 500
 then raise exception 'Invalid limit'; end if;

 if p_client is not null and not exists(
   select 1 from public.bf_client_access a
   where a.user_id=auth.uid() and a.client_id=p_client
 )
 then raise exception 'Owner/client access required' using errcode='42501'; end if;

 with scopes as (
   select a.organization_id,a.client_id,a.role_code,c.name client_name,c.code client_code,c.status client_status
   from public.bf_client_access a
   join public.bf_clients c on c.id=a.client_id and c.organization_id=a.organization_id
   where a.user_id=auth.uid()
     and (p_client is null or a.client_id=p_client)
 ),
 sites as (
   select s.id,s.organization_id,s.client_id,s.contract_id,s.name,s.code,s.city,s.status
   from public.bf_sites s
   join scopes x on x.organization_id=s.organization_id and x.client_id=s.client_id
   where s.status='active'
 ),
 assets as (
   select a.id,a.organization_id,a.client_id,a.site_id,a.asset_tag,a.name_ar,a.name_en,
          a.manufacturer,a.model,a.criticality,a.condition,a.operational_status,a.warranty_end
   from public.bf_assets a
   join scopes x on x.organization_id=a.organization_id and x.client_id=a.client_id
   where a.status='active'
 ),
 requests as (
   select r.id,r.organization_id,r.client_id,r.site_id,r.asset_id,r.contract_id,
          r.request_number,r.title,r.description,r.priority,r.status,r.reported_at,r.updated_at
   from public.bf_service_requests r
   join scopes x on x.organization_id=r.organization_id and x.client_id=r.client_id
   order by r.reported_at desc
   limit p_limit
 ),
 work_orders as (
   select w.id,w.organization_id,w.client_id,w.site_id,w.asset_id,w.contract_id,w.request_id,
          w.work_order_number,w.title,w.priority,w.status,w.approval_status,w.sla_status,
          w.response_due_at,w.completion_due_at,w.completed_at,w.closed_at,w.updated_at
   from public.bf_work_orders w
   join scopes x on x.organization_id=w.organization_id and x.client_id=w.client_id
   order by w.created_at desc
   limit p_limit
 ),
 ppm as (
   select j.id,j.organization_id,j.client_id,j.site_id,j.asset_id,j.job_number,j.due_date,
          j.status,j.started_at,j.completed_at,j.approved_at,j.closed_at
   from public.bf_ppm_jobs j
   join scopes x on x.organization_id=j.organization_id and x.client_id=j.client_id
   order by j.due_date desc
   limit p_limit
 ),
 approvals as (
   select a.id,a.organization_id,a.client_id,a.site_id,a.entity_type,a.entity_id,
          a.reviewer_type,a.status,a.round,a.subject,a.request_comment,a.due_at,
          a.requested_at,a.decided_at,a.decision_comment
   from public.bf11_approvals a
   join scopes x on x.organization_id=a.organization_id and x.client_id=a.client_id
   where a.reviewer_type='owner'
   order by a.requested_at desc
   limit p_limit
 ),
 documents as (
   select d.id,d.organization_id,d.client_id,d.site_id,d.document_number,d.document_type,
          d.entity_type,d.entity_id,d.title,d.status,d.generated_at
   from public.bf13_documents d
   join scopes x on x.organization_id=d.organization_id and x.client_id=d.client_id
   where d.status='final'
   order by d.generated_at desc
   limit p_limit
 )
 select jsonb_build_object(
   'clients',coalesce((select jsonb_agg(to_jsonb(x) order by x.client_name) from scopes x),'[]'::jsonb),
   'sites',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from sites x),'[]'::jsonb),
   'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_tag) from assets x),'[]'::jsonb),
   'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.reported_at desc) from requests x),'[]'::jsonb),
   'work_orders',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from work_orders x),'[]'::jsonb),
   'ppm',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_date desc) from ppm x),'[]'::jsonb),
   'approvals',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from approvals x),'[]'::jsonb),
   'documents',coalesce((select jsonb_agg(to_jsonb(x) order by x.generated_at desc) from documents x),'[]'::jsonb),
   'summary',jsonb_build_object(
      'sites',(select count(*) from sites),
      'assets',(select count(*) from assets),
      'open_requests',(select count(*) from requests where status not in('rejected','cancelled','converted')),
      'open_work_orders',(select count(*) from work_orders where status not in('closed','cancelled')),
      'ppm_due',(select count(*) from ppm where due_date<=current_date+7 and status not in('completed','approved','closed','cancelled')),
      'pending_approvals',(select count(*) from approvals where status='pending'),
      'documents',(select count(*) from documents)
   )
 ) into result;

 if jsonb_array_length(result->'clients')=0
 then raise exception 'No owner/client portal access assigned' using errcode='42501'; end if;

 return result;
end $$;

revoke all on function public.bf29_portal(uuid,integer) from public,anon;
grant execute on function public.bf29_portal(uuid,integer) to authenticated;

insert into public.bf_migrations(version) values(29);
commit;
