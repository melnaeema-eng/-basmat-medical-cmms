begin;

create table if not exists public.bf_med_company_project_links(
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  project_id uuid not null,
  client_id uuid null references public.bf_clients(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(organization_id,project_id)
);

alter table public.bf_med_company_project_links
  add column if not exists client_id uuid null references public.bf_clients(id) on delete set null;

create or replace function public.bf_med_link_project(
  p_org uuid,
  p_client uuid,
  p_project uuid
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

  if p_client is not null and not exists(
    select 1 from public.bf_clients c
    where c.id=p_client and c.organization_id=p_org
  ) then
    raise exception 'Client is outside tenant';
  end if;

  insert into public.bf_med_company_project_links(
    organization_id,project_id,client_id,status
  )
  values(p_org,p_project,p_client,'active')
  on conflict(organization_id,project_id) do update
    set client_id=excluded.client_id,
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
    'projects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'project_id',l.project_id,
        'client_id',l.client_id,
        'status',l.status
      ))
      from public.bf_med_company_project_links l
      where l.organization_id=p_org and l.status='active'
    ),'[]'::jsonb),
    'sites',coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'project_id',l.project_id,
          'linked_client_id',l.client_id
        )
        order by s.name
      )
      from public.bf_med_company_site_links l
      join public.bf_sites s on s.id=l.site_id
      where l.organization_id=p_org and l.status='active'
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

grant execute on function public.bf_med_link_project(uuid,uuid,uuid) to authenticated;
grant execute on function public.bf_med_relationship_bundle(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
