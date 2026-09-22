-- Basmat Facilities CMMS — Sprint 30
-- Document Control & Revision Register
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=29)
 then raise exception 'Install and verify Sprint 29 first'; end if;
 if exists(select 1 from public.bf_migrations where version=30)
 then raise exception 'Sprint 30 already installed'; end if;
 if to_regclass('public.bf_clients') is null
 or to_regclass('public.bf_sites') is null
 or to_regclass('public.bf_assets') is null
 then raise exception 'Required document control sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('document-control.view','View controlled documents and revisions'),
 ('document-control.manage','Create and revise controlled documents')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'document-control.%')
 or (r.code in('supervisor','technician') and p.code='document-control.view')
on conflict do nothing;

create sequence public.bf30_document_seq;
revoke all on sequence public.bf30_document_seq from public,anon,authenticated;

create table public.bf30_documents(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 site_id uuid,
 asset_id uuid references public.bf_assets(id),
 document_number text not null,
 document_type text not null check(document_type in(
  'drawing','om_manual','warranty','certificate','method_statement','datasheet','policy','procedure','other'
 )),
 title text not null check(length(btrim(title)) between 3 and 250),
 discipline text not null default 'general',
 current_revision text not null default '0',
 status text not null default 'active' check(status in('active','superseded','archived')),
 expiry_date date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,document_number),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id)
);

create table public.bf30_revisions(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.bf30_documents(id),
 organization_id uuid not null references public.bf_organizations(id),
 revision text not null,
 issue_date date not null default current_date,
 description text not null default '',
 file_name text,
 file_url text,
 file_size bigint check(file_size is null or file_size>=0),
 mime_type text,
 checksum text,
 is_current boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(document_id,revision)
);

create unique index bf30_one_current_revision
on public.bf30_revisions(document_id) where is_current=true;

create index bf30_doc_scope
on public.bf30_documents(organization_id,client_id,site_id,document_type,status);

create index bf30_rev_doc
on public.bf30_revisions(document_id,created_at desc);

do $$ declare t text; begin
 foreach t in array array['bf30_documents','bf30_revisions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.bf30_can_view(p_org uuid,p_client uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf4_staff(p_org,'document-control.view')
 or public.bf11_owner(p_org,p_client)
 or public.bf11_consultant(p_org,p_client);
$$;

create policy bf30_doc_read on public.bf30_documents
for select to authenticated
using(public.bf30_can_view(organization_id,client_id));

create policy bf30_rev_read on public.bf30_revisions
for select to authenticated
using(exists(
 select 1 from public.bf30_documents d
 where d.id=document_id and public.bf30_can_view(d.organization_id,d.client_id)
));

create or replace function public.bf30_create_document(
 p_org uuid,p_client uuid,p_site uuid,p_asset uuid,
 p_type text,p_title text,p_discipline text default 'general',
 p_expiry date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare did uuid; num text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.bf4_staff(p_org,'document-control.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if not exists(select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org)
 then raise exception 'Invalid client'; end if;

 if p_site is not null and not exists(
  select 1 from public.bf_sites s where s.id=p_site and s.organization_id=p_org and s.client_id=p_client
 ) then raise exception 'Invalid site'; end if;

 if p_asset is not null and not exists(
  select 1 from public.bf_assets a
  where a.id=p_asset and a.organization_id=p_org and a.client_id=p_client
    and (p_site is null or a.site_id=p_site)
 ) then raise exception 'Invalid asset'; end if;

 if p_type not in('drawing','om_manual','warranty','certificate','method_statement','datasheet','policy','procedure','other')
 then raise exception 'Invalid document type'; end if;

 if length(btrim(coalesce(p_title,'')))<3 then raise exception 'Title is required'; end if;

 num:='DC-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.bf30_document_seq')::text,6,'0');

 insert into public.bf30_documents(
  organization_id,client_id,site_id,asset_id,document_number,document_type,title,discipline,expiry_date,created_by
 ) values(
  p_org,p_client,p_site,p_asset,num,p_type,btrim(p_title),coalesce(nullif(btrim(p_discipline),''),'general'),p_expiry,auth.uid()
 ) returning id into did;

 return did;
end $$;

create or replace function public.bf30_add_revision(
 p_document uuid,p_revision text,p_description text default '',
 p_issue_date date default current_date,
 p_file_name text default null,p_file_url text default null,
 p_file_size bigint default null,p_mime_type text default null,p_checksum text default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare d public.bf30_documents; rid uuid;
begin
 select * into d from public.bf30_documents where id=p_document for update;
 if not found then raise exception 'Document not found'; end if;
 if not public.bf4_staff(d.organization_id,'document-control.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if d.status='archived' then raise exception 'Document is archived'; end if;
 if length(btrim(coalesce(p_revision,'')))<1 then raise exception 'Revision is required'; end if;

 update public.bf30_revisions set is_current=false where document_id=d.id and is_current=true;

 insert into public.bf30_revisions(
  document_id,organization_id,revision,issue_date,description,file_name,file_url,file_size,mime_type,checksum,is_current,created_by
 ) values(
  d.id,d.organization_id,btrim(p_revision),coalesce(p_issue_date,current_date),
  left(coalesce(p_description,''),4000),nullif(p_file_name,''),nullif(p_file_url,''),
  p_file_size,nullif(p_mime_type,''),nullif(p_checksum,''),true,auth.uid()
 ) returning id into rid;

 update public.bf30_documents
 set current_revision=btrim(p_revision),status='active',updated_at=now()
 where id=d.id;

 return rid;
end $$;

create or replace function public.bf30_archive_document(p_document uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare d public.bf30_documents;
begin
 select * into d from public.bf30_documents where id=p_document for update;
 if not found then raise exception 'Document not found'; end if;
 if not public.bf4_staff(d.organization_id,'document-control.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 update public.bf30_documents set status='archived',updated_at=now() where id=d.id;
end $$;

create or replace function public.bf30_center(
 p_org uuid default null,p_client uuid default null,p_type text default null,p_status text default null,p_limit integer default 300
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;

 with docs as (
  select d.*,c.name client_name,s.name site_name,
         coalesce(a.name_en,a.name_ar,a.asset_tag) asset_name,
         r.issue_date current_issue_date,r.file_name,r.file_url,r.mime_type
  from public.bf30_documents d
  join public.bf_clients c on c.id=d.client_id
  left join public.bf_sites s on s.id=d.site_id
  left join public.bf_assets a on a.id=d.asset_id
  left join public.bf30_revisions r on r.document_id=d.id and r.is_current=true
  where (p_org is null or d.organization_id=p_org)
    and (p_client is null or d.client_id=p_client)
    and (p_type is null or d.document_type=p_type)
    and (p_status is null or d.status=p_status)
    and public.bf30_can_view(d.organization_id,d.client_id)
 ),
 expiring as (
  select * from docs
  where expiry_date is not null and expiry_date<=current_date+60 and status='active'
 )
 select jsonb_build_object(
  'documents',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (select * from docs order by updated_at desc limit p_limit)x),'[]'::jsonb),
  'summary',jsonb_build_object(
    'total',(select count(*) from docs),
    'active',(select count(*) from docs where status='active'),
    'archived',(select count(*) from docs where status='archived'),
    'expiring_60',(select count(*) from expiring),
    'without_revision',(select count(*) from docs where file_url is null and current_issue_date is null)
  )
 ) into result;

 return result;
end $$;

create or replace function public.bf30_detail(p_document uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare d public.bf30_documents; result jsonb;
begin
 select * into d from public.bf30_documents where id=p_document;
 if not found then raise exception 'Document not found'; end if;
 if not public.bf30_can_view(d.organization_id,d.client_id)
 then raise exception 'Permission denied' using errcode='42501'; end if;

 select jsonb_build_object(
  'document',to_jsonb(d),
  'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.bf30_revisions r where r.document_id=d.id),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.bf30_can_view(uuid,uuid),
 public.bf30_create_document(uuid,uuid,uuid,uuid,text,text,text,date),
 public.bf30_add_revision(uuid,text,text,date,text,text,bigint,text,text),
 public.bf30_archive_document(uuid),
 public.bf30_center(uuid,uuid,text,text,integer),
 public.bf30_detail(uuid)
from public,anon;

grant execute on function public.bf30_can_view(uuid,uuid),
 public.bf30_create_document(uuid,uuid,uuid,uuid,text,text,text,date),
 public.bf30_add_revision(uuid,text,text,date,text,text,bigint,text,text),
 public.bf30_archive_document(uuid),
 public.bf30_center(uuid,uuid,text,text,integer),
 public.bf30_detail(uuid)
to authenticated;

insert into public.bf_migrations(version) values(30);
commit;
