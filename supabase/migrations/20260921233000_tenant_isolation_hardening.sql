-- Basmat Facilities CMMS
-- Tenant Isolation Hardening
-- Goal:
-- 1) Super Admin can access all organizations.
-- 2) All other authenticated users can access only organizations they belong to.
-- 3) Existing module permissions remain in force.
-- 4) Isolation is enforced in PostgreSQL RLS, not in React.
--
-- IMPORTANT:
-- This migration ADDS a RESTRICTIVE tenant policy to every public bf_* table
-- that has an organization_id column. Existing module policies are preserved.

begin;

-- ---------------------------------------------------------------------------
-- Central tenant membership guard.
-- It is intentionally SECURITY DEFINER so RLS on profile/role tables cannot
-- recursively block membership checks.
-- It supports the common Super Admin representations used by this project:
--   A) bf_profiles.is_super_admin = true
--   B) bf_profiles.role = 'super_admin'
--   C) bf_user_roles -> bf_roles.code = 'super_admin'
-- Normal users must have an active profile and a bf_user_roles membership
-- matching p_org.
-- ---------------------------------------------------------------------------
create or replace function public.bf_tenant_access(p_org uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  -- Active profile is mandatory when the status column exists.
  if to_regclass('public.bf_profiles') is null then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bf_profiles'
      and column_name='status'
  ) then
    execute 'select exists(
      select 1 from public.bf_profiles
      where id = $1 and status = ''active''
    )'
    into v_ok
    using v_uid;

    if not coalesce(v_ok,false) then
      return false;
    end if;
  else
    execute 'select exists(
      select 1 from public.bf_profiles
      where id = $1
    )'
    into v_ok
    using v_uid;

    if not coalesce(v_ok,false) then
      return false;
    end if;
  end if;

  -- Super Admin representation A: bf_profiles.is_super_admin boolean.
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bf_profiles'
      and column_name='is_super_admin'
  ) then
    execute 'select coalesce((
      select is_super_admin from public.bf_profiles where id = $1
    ),false)'
    into v_ok
    using v_uid;

    if coalesce(v_ok,false) then
      return true;
    end if;
  end if;

  -- Super Admin representation B: bf_profiles.role text.
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bf_profiles'
      and column_name='role'
  ) then
    execute 'select exists(
      select 1 from public.bf_profiles
      where id = $1 and role = ''super_admin''
    )'
    into v_ok
    using v_uid;

    if coalesce(v_ok,false) then
      return true;
    end if;
  end if;

  -- Super Admin representation C: role assignment.
  if to_regclass('public.bf_user_roles') is not null
     and to_regclass('public.bf_roles') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='bf_user_roles'
         and column_name='user_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='bf_user_roles'
         and column_name='role_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='bf_roles'
         and column_name='id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='bf_roles'
         and column_name='code'
     )
  then
    execute 'select exists(
      select 1
      from public.bf_user_roles ur
      join public.bf_roles r on r.id = ur.role_id
      where ur.user_id = $1 and r.code = ''super_admin''
    )'
    into v_ok
    using v_uid;

    if coalesce(v_ok,false) then
      return true;
    end if;
  end if;

  -- Normal tenant membership.
  if p_org is null or to_regclass('public.bf_user_roles') is null then
    return false;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='bf_user_roles'
      and column_name='user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='bf_user_roles'
      and column_name='organization_id'
  ) then
    execute 'select exists(
      select 1 from public.bf_user_roles
      where user_id = $1 and organization_id = $2
    )'
    into v_ok
    using v_uid, p_org;

    return coalesce(v_ok,false);
  end if;

  return false;
end
$$;

revoke all on function public.bf_tenant_access(uuid) from public, anon;
grant execute on function public.bf_tenant_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Apply tenant isolation to every Basmat business table carrying organization_id.
-- RESTRICTIVE means this is an additional mandatory condition; it does not
-- replace or loosen existing module-specific RLS policies.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema=c.table_schema
     and t.table_name=c.table_name
    where c.table_schema='public'
      and c.column_name='organization_id'
      and c.table_name like 'bf%'
      and t.table_type='BASE TABLE'
      -- Role membership itself is the source used by bf_tenant_access().
      -- Applying tenant isolation to it can create recursive RLS evaluation.
      and c.table_name <> 'bf_user_roles'
    order by c.table_name
  loop
    execute format('alter table public.%I enable row level security', r.table_name);

    execute format(
      'drop policy if exists bf_tenant_isolation on public.%I',
      r.table_name
    );

    execute format(
      'create policy bf_tenant_isolation
         on public.%I
         as restrictive
         for all
         to authenticated
         using (public.bf_tenant_access(organization_id))
         with check (public.bf_tenant_access(organization_id))',
      r.table_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Verification helper for Super Admin / administrators.
-- Shows every table protected by this migration and whether RLS is enabled.
-- No business data is exposed.
-- ---------------------------------------------------------------------------
create or replace function public.bf_tenant_isolation_status()
returns table(
  table_name text,
  rls_enabled boolean,
  isolation_policy_present boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    exists(
      select 1
      from pg_policy p
      where p.polrelid=c.oid
        and p.polname='bf_tenant_isolation'
    )
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relname like 'bf%'
    and exists(
      select 1
      from pg_attribute a
      where a.attrelid=c.oid
        and a.attname='organization_id'
        and not a.attisdropped
    )
    and c.relname <> 'bf_user_roles'
  order by c.relname;
$$;

revoke all on function public.bf_tenant_isolation_status() from public, anon;
grant execute on function public.bf_tenant_isolation_status() to authenticated;

notify pgrst, 'reload schema';

commit;
