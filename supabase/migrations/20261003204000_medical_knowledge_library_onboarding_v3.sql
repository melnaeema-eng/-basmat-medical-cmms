
begin;

create extension if not exists pgcrypto;

-- =========================================================
-- Medical Knowledge Library - Medical only, no Facilities fallback
-- =========================================================

create table if not exists public.bf_med_company_library(
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  name_ar text,
  name_en text,
  company_type text not null default 'maintenance_company',
  website text,
  registration_no text,
  vat_no text,
  email text,
  phone text,
  city text,
  address text,
  logo_url text,
  logo_source text,
  specialties text[] not null default '{}',
  manufacturers text[] not null default '{}',
  notes text,
  source_type text not null default 'manual',
  source_reference text,
  confidence numeric(5,2),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bf_med_company_library_name_uq
  on public.bf_med_company_library(lower(normalized_name))
  where status='active';

create table if not exists public.bf_med_company_tenant_links(
  library_company_id uuid not null references public.bf_med_company_library(id) on delete cascade,
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(library_company_id,organization_id)
);

create table if not exists public.bf_med_company_client_links(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid not null references public.bf_clients(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id,client_id)
);

create table if not exists public.bf_med_company_project_links(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id,project_id)
);

create table if not exists public.bf_med_company_site_links(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid null references public.bf_clients(id) on delete set null,
  project_id uuid null,
  site_id uuid not null references public.bf_sites(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id,site_id)
);

create table if not exists public.bf_med_company_asset_links(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  client_id uuid null references public.bf_clients(id) on delete set null,
  project_id uuid null,
  site_id uuid null references public.bf_sites(id) on delete set null,
  asset_id uuid not null references public.bf_assets(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id,asset_id)
);

create or replace function public.bf_med_normalize_name(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(p,''))), '\s+', ' ', 'g');
$$;

create or replace function public.bf_med_company_library_search(p_query text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(x) order by greatest(
      similarity(coalesce(x.name_en,''),coalesce(p_query,'')),
      similarity(coalesce(x.name_ar,''),coalesce(p_query,''))
    ) desc),
    '[]'::jsonb
  )
  from public.bf_med_company_library x
  where x.status='active'
    and (
      x.normalized_name ilike '%'||public.bf_med_normalize_name(p_query)||'%'
      or coalesce(x.name_ar,'') ilike '%'||coalesce(p_query,'')||'%'
      or coalesce(x.name_en,'') ilike '%'||coalesce(p_query,'')||'%'
    );
$$;

create or replace function public.bf_med_company_library_save(
  p_id uuid,
  p_name_ar text,
  p_name_en text,
  p_company_type text,
  p_website text,
  p_registration_no text,
  p_vat_no text,
  p_email text,
  p_phone text,
  p_city text,
  p_address text,
  p_logo_url text,
  p_logo_source text,
  p_specialties text[],
  p_manufacturers text[],
  p_notes text,
  p_source_type text,
  p_source_reference text,
  p_confidence numeric
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_name text;
  v_norm text;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Super Admin required' using errcode='42501';
  end if;

  v_name := coalesce(nullif(trim(p_name_en),''),nullif(trim(p_name_ar),''));
  if v_name is null then raise exception 'Company name required'; end if;
  v_norm := public.bf_med_normalize_name(v_name);

  if p_id is null then
    select id into v_id
    from public.bf_med_company_library
    where lower(normalized_name)=lower(v_norm)
      and status='active'
    limit 1;

    if v_id is null then
      insert into public.bf_med_company_library(
        normalized_name,name_ar,name_en,company_type,website,registration_no,vat_no,
        email,phone,city,address,logo_url,logo_source,specialties,manufacturers,notes,
        source_type,source_reference,confidence
      ) values (
        v_norm,p_name_ar,p_name_en,coalesce(nullif(p_company_type,''),'maintenance_company'),
        p_website,p_registration_no,p_vat_no,p_email,p_phone,p_city,p_address,p_logo_url,p_logo_source,
        coalesce(p_specialties,'{}'::text[]),coalesce(p_manufacturers,'{}'::text[]),p_notes,
        coalesce(nullif(p_source_type,''),'manual'),p_source_reference,p_confidence
      )
      returning id into v_id;
    end if;
  else
    v_id := p_id;
  end if;

  update public.bf_med_company_library
  set normalized_name=v_norm,
      name_ar=p_name_ar,
      name_en=p_name_en,
      company_type=coalesce(nullif(p_company_type,''),'maintenance_company'),
      website=p_website,
      registration_no=p_registration_no,
      vat_no=p_vat_no,
      email=p_email,
      phone=p_phone,
      city=p_city,
      address=p_address,
      logo_url=p_logo_url,
      logo_source=p_logo_source,
      specialties=coalesce(p_specialties,'{}'::text[]),
      manufacturers=coalesce(p_manufacturers,'{}'::text[]),
      notes=p_notes,
      source_type=coalesce(nullif(p_source_type,''),'manual'),
      source_reference=p_source_reference,
      confidence=p_confidence,
      updated_at=now()
  where id=v_id;

  return v_id;
end;
$$;

create or replace function public.bf_med_create_or_link_tenant_from_library(p_library_company uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lib public.bf_med_company_library%rowtype;
  v_org uuid;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Super Admin required' using errcode='42501';
  end if;

  select * into v_lib
  from public.bf_med_company_library
  where id=p_library_company and status='active';

  if v_lib.id is null then
    raise exception 'Medical company library record not found';
  end if;

  select organization_id into v_org
  from public.bf_med_company_tenant_links
  where library_company_id=v_lib.id and status='active'
  limit 1;

  if v_org is null then
    insert into public.bf_organizations(
      name,name_ar,name_en,organization_type,registration_no,vat_no,email,phone,city,address,logo_url,status
    )
    values(
      coalesce(v_lib.name_ar,v_lib.name_en),
      v_lib.name_ar,v_lib.name_en,'maintenance_contractor',
      v_lib.registration_no,v_lib.vat_no,v_lib.email,v_lib.phone,v_lib.city,v_lib.address,v_lib.logo_url,'active'
    )
    returning id into v_org;

    insert into public.bf_med_company_tenant_links(library_company_id,organization_id)
    values(v_lib.id,v_org)
    on conflict do nothing;
  else
    update public.bf_organizations
    set name=coalesce(v_lib.name_ar,v_lib.name_en,name),
        name_ar=coalesce(v_lib.name_ar,name_ar),
        name_en=coalesce(v_lib.name_en,name_en),
        registration_no=coalesce(v_lib.registration_no,registration_no),
        vat_no=coalesce(v_lib.vat_no,vat_no),
        email=coalesce(v_lib.email,email),
        phone=coalesce(v_lib.phone,phone),
        city=coalesce(v_lib.city,city),
        address=coalesce(v_lib.address,address),
        logo_url=coalesce(v_lib.logo_url,logo_url)
    where id=v_org;
  end if;

  return jsonb_build_object(
    'organization_id',v_org,
    'library_company_id',v_lib.id,
    'name_ar',v_lib.name_ar,
    'name_en',v_lib.name_en,
    'logo_url',v_lib.logo_url
  );
end;
$$;

create or replace function public.bf_med_link_client(p_org uuid,p_client uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if not exists(select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org) then
    raise exception 'Client is outside tenant';
  end if;

  insert into public.bf_med_company_client_links(organization_id,client_id)
  values(p_org,p_client)
  on conflict do update set status='active';
end;
$$;

create or replace function public.bf_med_link_site(
  p_org uuid,p_client uuid,p_project uuid,p_site uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.bf_sites s
    where s.id=p_site and s.organization_id=p_org
  ) then
    raise exception 'Site is outside tenant';
  end if;

  insert into public.bf_med_company_site_links(organization_id,client_id,project_id,site_id)
  values(p_org,p_client,p_project,p_site)
  on conflict(organization_id,site_id) do update
    set client_id=excluded.client_id,
        project_id=excluded.project_id,
        status='active';
end;
$$;

create or replace function public.bf_med_relationship_bundle(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
begin
  if not public.bf_acl_is_super_user(auth.uid())
     and not public.bf_med_is_tenant_member(p_org,auth.uid()) then
    raise exception 'Tenant access denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'clients',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
      from public.bf_med_company_client_links l
      join public.bf_clients c on c.id=l.client_id
      where l.organization_id=p_org and l.status='active'
    ),'[]'::jsonb),
    'sites',coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object('project_id',l.project_id,'linked_client_id',l.client_id)
        order by s.name
      )
      from public.bf_med_company_site_links l
      join public.bf_sites s on s.id=l.site_id
      where l.organization_id=p_org and l.status='active'
    ),'[]'::jsonb),
    'projects',coalesce((
      select jsonb_agg(jsonb_build_object('project_id',project_id,'status',status))
      from public.bf_med_company_project_links
      where organization_id=p_org and status='active'
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.bf_med_company_asset_links l
      join public.bf_assets a on a.id=l.asset_id
      where l.organization_id=p_org and l.status='active'
    ),'[]'::jsonb)
  ) into v;

  return v;
end;
$$;

grant execute on function public.bf_med_company_library_search(text) to authenticated;
grant execute on function public.bf_med_company_library_save(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text,numeric) to authenticated;
grant execute on function public.bf_med_create_or_link_tenant_from_library(uuid) to authenticated;
grant execute on function public.bf_med_link_client(uuid,uuid) to authenticated;
grant execute on function public.bf_med_link_site(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.bf_med_relationship_bundle(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
