-- Basmat Facilities CMMS — Sprint 13
-- Technical Reports & Approval Certificates
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=12)
 or to_regclass('public.bf11_approvals') is null
 or to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 then raise exception 'Install and verify Sprint 12 first'; end if;
 if exists(select 1 from public.bf_migrations where version=13)
 then raise exception 'Sprint 13 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('documents.view','View generated technical documents'),
 ('documents.generate','Generate technical reports and approval certificates'),
 ('documents.manage','Void generated technical documents')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'documents.%')
 or (r.code='supervisor' and p.code in('documents.view','documents.generate'))
on conflict do nothing;

create sequence public.bf13_document_seq start 1;
revoke all on sequence public.bf13_document_seq from public,anon,authenticated;

create table public.bf13_documents(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid not null,
 document_number text not null,
 document_type text not null check(document_type in('technical_report','approval_certificate')),
 entity_type text not null check(entity_type in('work_order','ppm_job','approval')),
 entity_id uuid not null,
 title text not null check(length(btrim(title)) between 3 and 250),
 status text not null default 'final' check(status in('final','void')),
 snapshot jsonb not null,
 snapshot_hash text not null,
 generated_by uuid not null references auth.users(id),
 generated_at timestamptz not null default now(),
 voided_by uuid references auth.users(id),
 voided_at timestamptz,
 void_reason text,
 unique(organization_id,document_number),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 check((status='void')=(voided_at is not null))
);
create index bf13_docs_scope on public.bf13_documents(organization_id,client_id,generated_at desc);
create index bf13_docs_entity on public.bf13_documents(entity_type,entity_id,generated_at desc);

create or replace function public.bf13_can_view(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf4_staff(p_org,'documents.view')
 or public.bf11_owner(p_org,p_client)
 or public.bf11_consultant(p_org,p_client);
$$;

alter table public.bf13_documents enable row level security;
revoke all on public.bf13_documents from public,anon,authenticated;
grant select on public.bf13_documents to authenticated;
create policy bf13_docs_read on public.bf13_documents
for select to authenticated using(public.bf13_can_view(organization_id,client_id));

create or replace function public.bf13_generate(
 p_type text,p_entity_type text,p_entity uuid,p_title text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 org uuid; client uuid; site uuid; snap jsonb; doc_id uuid;
 num text; ttl text;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_type not in('technical_report','approval_certificate') then raise exception 'Invalid document type'; end if;
 if p_title is not null and length(btrim(p_title))>250 then raise exception 'Title too long'; end if;

 if p_type='technical_report' and p_entity_type='work_order' then
  select w.organization_id,w.client_id,w.site_id,
   jsonb_build_object(
    'source','work_order','id',w.id,'number',w.work_order_number,'title',w.title,
    'description',w.description,'priority',w.priority,'status',w.status,
    'approval_status',w.approval_status,'sla_status',w.sla_status,
    'diagnosis',w.diagnosis,'root_cause',w.root_cause,'work_performed',w.work_performed,
    'tests_performed',w.tests_performed,'recommendations',w.recommendations,
    'created_at',w.created_at,'assigned_at',w.assigned_at,'started_at',w.started_at,
    'completed_at',w.completed_at,'closed_at',w.closed_at,
    'client_name',c.name,'site_name',s.name,
    'labor_minutes',coalesce((select sum(l.minutes) from public.bf9_labor l
       join public.bf9_visits v on v.id=l.visit_id where v.work_order_id=w.id),0),
    'evidence_count',(select count(*) from public.bf9_evidence e where e.work_order_id=w.id and e.status='ready')
   )
  into org,client,site,snap
  from public.bf_work_orders w
  join public.bf_clients c on c.id=w.client_id
  join public.bf_sites s on s.id=w.site_id
  where w.id=p_entity and w.status in('approved','closed');

 elsif p_type='technical_report' and p_entity_type='ppm_job' then
  select j.organization_id,j.client_id,j.site_id,
   jsonb_build_object(
    'source','ppm_job','id',j.id,'number',j.job_number,'status',j.status,
    'due_date',j.due_date,'started_at',j.started_at,'completed_at',j.completed_at,
    'approved_at',j.approved_at,'closed_at',j.closed_at,
    'client_name',c.name,'site_name',s.name,'asset_id',j.asset_id,
    'results',coalesce((select jsonb_agg(jsonb_build_object(
      'step_id',r.step_id,'result',r.result,'reading',r.reading,'comment',r.comment
    ) order by r.step_id) from public.bf_ppm_results r where r.job_id=j.id),'[]'::jsonb)
   )
  into org,client,site,snap
  from public.bf_ppm_jobs j
  join public.bf_clients c on c.id=j.client_id
  join public.bf_sites s on s.id=j.site_id
  where j.id=p_entity and j.status in('approved','closed');

 elsif p_type='approval_certificate' and p_entity_type='approval' then
  select a.organization_id,a.client_id,a.site_id,
   jsonb_build_object(
    'source','approval','id',a.id,'reviewer_type',a.reviewer_type,'round',a.round,
    'subject',a.subject,'request_comment',a.request_comment,'requested_at',a.requested_at,
    'due_at',a.due_at,'decided_at',a.decided_at,'decision_comment',a.decision_comment,
    'source_entity_type',a.entity_type,'source_entity_id',a.entity_id,
    'source_reference',case when a.entity_type='work_order' then w.work_order_number else j.job_number end,
    'client_name',c.name,'site_name',s.name,
    'requested_by',rp.full_name,'decided_by',dp.full_name
   )
  into org,client,site,snap
  from public.bf11_approvals a
  join public.bf_clients c on c.id=a.client_id
  join public.bf_sites s on s.id=a.site_id
  left join public.bf_work_orders w on a.entity_type='work_order' and w.id=a.entity_id
  left join public.bf_ppm_jobs j on a.entity_type='ppm_job' and j.id=a.entity_id
  left join public.bf_profiles rp on rp.id=a.requested_by
  left join public.bf_profiles dp on dp.id=a.decided_by
  where a.id=p_entity and a.status='approved';
 else
  raise exception 'Unsupported entity/document combination';
 end if;

 if snap is null then raise exception 'Eligible source record not found'; end if;
 if not public.bf4_staff(org,'documents.generate') then raise exception 'Permission denied' using errcode='42501'; end if;

 num:='DOC-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.bf13_document_seq')::text,6,'0');
 ttl:=coalesce(nullif(btrim(p_title),''),
   case when p_type='technical_report' then 'Technical Report' else 'Approval Certificate' end);

 insert into public.bf13_documents(
  organization_id,client_id,site_id,document_number,document_type,entity_type,entity_id,
  title,snapshot,snapshot_hash,generated_by)
 values(org,client,site,num,p_type,p_entity_type,p_entity,ttl,snap,md5(snap::text),auth.uid())
 returning id into doc_id;
 return doc_id;
end $$;

create or replace function public.bf13_void(p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare d public.bf13_documents;
begin
 select * into d from public.bf13_documents where id=p_id for update;
 if not found then raise exception 'Document not found'; end if;
 if not public.bf4_staff(d.organization_id,'documents.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if d.status<>'final' then raise exception 'Document is not final'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Void reason is required'; end if;
 update public.bf13_documents
 set status='void',voided_by=auth.uid(),voided_at=now(),void_reason=btrim(p_reason)
 where id=p_id;
end $$;

create or replace function public.bf13_center(
 p_org uuid default null,p_client uuid default null,p_type text default null,
 p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare payload jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 200 or p_offset is null or p_offset not between 0 and 10000
 then raise exception 'Invalid pagination'; end if;
 if p_type is not null and p_type not in('technical_report','approval_certificate')
 then raise exception 'Invalid document type'; end if;

 with docs as (
  select d.*,c.name client_name,s.name site_name,
    public.bf4_staff(d.organization_id,'documents.manage') can_manage
  from public.bf13_documents d
  join public.bf_clients c on c.id=d.client_id
  join public.bf_sites s on s.id=d.site_id
  where (p_org is null or d.organization_id=p_org)
   and (p_client is null or d.client_id=p_client)
   and (p_type is null or d.document_type=p_type)
   and public.bf13_can_view(d.organization_id,d.client_id)
 ),
 eligible as (
  select 'work_order'::text entity_type,w.id entity_id,w.organization_id,w.client_id,w.site_id,
   w.work_order_number reference,w.title,'technical_report'::text document_type
  from public.bf_work_orders w
  where w.status in('approved','closed') and public.bf4_staff(w.organization_id,'documents.generate')
  union all
  select 'ppm_job',j.id,j.organization_id,j.client_id,j.site_id,j.job_number,j.job_number,'technical_report'
  from public.bf_ppm_jobs j
  where j.status in('approved','closed') and public.bf4_staff(j.organization_id,'documents.generate')
  union all
  select 'approval',a.id,a.organization_id,a.client_id,a.site_id,
   case when a.entity_type='work_order' then w.work_order_number else j.job_number end,
   a.subject,'approval_certificate'
  from public.bf11_approvals a
  left join public.bf_work_orders w on a.entity_type='work_order' and w.id=a.entity_id
  left join public.bf_ppm_jobs j on a.entity_type='ppm_job' and j.id=a.entity_id
  where a.status='approved' and public.bf4_staff(a.organization_id,'documents.generate')
 )
 select jsonb_build_object(
  'documents',coalesce((select jsonb_agg(to_jsonb(x)) from
    (select * from docs order by generated_at desc,id limit p_limit offset p_offset)x),'[]'::jsonb),
  'eligible',coalesce((select jsonb_agg(to_jsonb(e) order by reference) from eligible e
    where (p_org is null or e.organization_id=p_org) and (p_client is null or e.client_id=p_client)),'[]'::jsonb),
  'has_more',(select count(*) from docs)>p_offset+p_limit
 ) into payload;
 return payload;
end $$;

revoke all on function public.bf13_can_view(uuid,uuid) from public,anon;
revoke all on function public.bf13_generate(text,text,uuid,text) from public,anon;
revoke all on function public.bf13_void(uuid,text) from public,anon;
revoke all on function public.bf13_center(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.bf13_can_view(uuid,uuid) to authenticated;
grant execute on function public.bf13_generate(text,text,uuid,text) to authenticated;
grant execute on function public.bf13_void(uuid,text) to authenticated;
grant execute on function public.bf13_center(uuid,uuid,text,integer,integer) to authenticated;

insert into public.bf_migrations(version) values(13);
commit;
