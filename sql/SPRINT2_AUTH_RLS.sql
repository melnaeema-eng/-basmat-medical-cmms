-- Basmat Facilities CMMS — Sprint 2
-- Authentication bootstrap + profiles + roles + tenant-safe RLS

begin;

-- 1) Extend profile
alter table public.bf_profiles
  add column if not exists is_super_admin boolean not null default false;

-- 2) Auto-create profile for every new Supabase Auth user
create or replace function public.bf_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bf_profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1)),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bf on auth.users;
create trigger on_auth_user_created_bf
after insert on auth.users
for each row execute function public.bf_handle_new_user();

-- Backfill any existing auth users
insert into public.bf_profiles (id, full_name, email)
select id,
       coalesce(raw_user_meta_data->>'full_name', split_part(coalesce(email,''),'@',1)),
       email
from auth.users
on conflict (id) do update set email = excluded.email;

-- 3) Helper functions
create or replace function public.bf_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.is_super_admin = true
  );
$$;

create or replace function public.bf_has_org_access(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bf_is_super_admin()
      or exists (
        select 1
        from public.bf_user_roles ur
        join public.bf_profiles p on p.id = ur.user_id
        where ur.user_id = auth.uid()
          and ur.organization_id = target_org
          and p.status = 'active'
      );
$$;

-- 4) Seed system roles once. organization_id NULL means reusable system template.
insert into public.bf_roles (organization_id,name,code,is_system)
values
(null,'Company Admin','company_admin',true),
(null,'Facility Manager','facility_manager',true),
(null,'Maintenance Manager','maintenance_manager',true),
(null,'Supervisor','supervisor',true),
(null,'Technician','technician',true),
(null,'Help Desk','help_desk',true),
(null,'Store Keeper','store_keeper',true),
(null,'Client Admin','client_admin',true),
(null,'Client User','client_user',true)
on conflict (organization_id, code) do nothing;

-- PostgreSQL unique with NULL does not protect duplicates, so clean and add partial unique index.
with ranked as (
  select id, row_number() over(partition by code order by id) rn
  from public.bf_roles
  where organization_id is null and is_system = true
)
delete from public.bf_roles r
using ranked x
where r.id=x.id and x.rn>1;

create unique index if not exists bf_roles_system_code_uq
on public.bf_roles(code)
where organization_id is null and is_system = true;

-- 5) Drop any previous Sprint 2 policies so this script can be rerun
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename like 'bf_%'
      and policyname like 'bf_s2_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 6) Organizations
create policy bf_s2_org_select on public.bf_organizations
for select to authenticated
using (public.bf_has_org_access(id));

create policy bf_s2_org_insert on public.bf_organizations
for insert to authenticated
with check (public.bf_is_super_admin());

create policy bf_s2_org_update on public.bf_organizations
for update to authenticated
using (public.bf_has_org_access(id))
with check (public.bf_has_org_access(id));

-- 7) Clients
create policy bf_s2_clients_select on public.bf_clients
for select to authenticated
using (public.bf_has_org_access(organization_id));

create policy bf_s2_clients_insert on public.bf_clients
for insert to authenticated
with check (public.bf_has_org_access(organization_id));

create policy bf_s2_clients_update on public.bf_clients
for update to authenticated
using (public.bf_has_org_access(organization_id))
with check (public.bf_has_org_access(organization_id));

-- 8) Contracts
create policy bf_s2_contracts_select on public.bf_contracts
for select to authenticated
using (public.bf_has_org_access(organization_id));

create policy bf_s2_contracts_insert on public.bf_contracts
for insert to authenticated
with check (public.bf_has_org_access(organization_id));

create policy bf_s2_contracts_update on public.bf_contracts
for update to authenticated
using (public.bf_has_org_access(organization_id))
with check (public.bf_has_org_access(organization_id));

-- 9) Sites
create policy bf_s2_sites_select on public.bf_sites
for select to authenticated
using (public.bf_has_org_access(organization_id));

create policy bf_s2_sites_insert on public.bf_sites
for insert to authenticated
with check (public.bf_has_org_access(organization_id));

create policy bf_s2_sites_update on public.bf_sites
for update to authenticated
using (public.bf_has_org_access(organization_id))
with check (public.bf_has_org_access(organization_id));

-- 10) Profiles
create policy bf_s2_profiles_select on public.bf_profiles
for select to authenticated
using (
  id = auth.uid()
  or public.bf_is_super_admin()
  or exists (
    select 1
    from public.bf_user_roles mine
    join public.bf_user_roles theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = bf_profiles.id
  )
);

create policy bf_s2_profiles_update_self on public.bf_profiles
for update to authenticated
using (id = auth.uid() or public.bf_is_super_admin())
with check (id = auth.uid() or public.bf_is_super_admin());

-- 11) Roles
create policy bf_s2_roles_select on public.bf_roles
for select to authenticated
using (
  is_system = true
  or public.bf_is_super_admin()
  or (organization_id is not null and public.bf_has_org_access(organization_id))
);

create policy bf_s2_roles_manage on public.bf_roles
for all to authenticated
using (
  public.bf_is_super_admin()
  or (organization_id is not null and public.bf_has_org_access(organization_id))
)
with check (
  public.bf_is_super_admin()
  or (organization_id is not null and public.bf_has_org_access(organization_id))
);

-- 12) User roles / memberships
create policy bf_s2_user_roles_select on public.bf_user_roles
for select to authenticated
using (
  user_id = auth.uid()
  or public.bf_is_super_admin()
  or public.bf_has_org_access(organization_id)
);

create policy bf_s2_user_roles_insert on public.bf_user_roles
for insert to authenticated
with check (
  public.bf_is_super_admin()
  or public.bf_has_org_access(organization_id)
);

create policy bf_s2_user_roles_delete on public.bf_user_roles
for delete to authenticated
using (
  public.bf_is_super_admin()
  or public.bf_has_org_access(organization_id)
);

-- 13) Read permissions for authenticated users
create policy bf_s2_permissions_select on public.bf_permissions
for select to authenticated using (true);

create policy bf_s2_role_permissions_select on public.bf_role_permissions
for select to authenticated using (
  exists (
    select 1 from public.bf_roles r
    where r.id=role_id
      and (r.is_system=true or public.bf_is_super_admin()
           or (r.organization_id is not null and public.bf_has_org_access(r.organization_id)))
  )
);

-- 14) Notifications
create policy bf_s2_notifications_select on public.bf_notifications
for select to authenticated
using (user_id=auth.uid() or public.bf_is_super_admin());

create policy bf_s2_notifications_update on public.bf_notifications
for update to authenticated
using (user_id=auth.uid() or public.bf_is_super_admin())
with check (user_id=auth.uid() or public.bf_is_super_admin());

-- 15) Audit logs read
create policy bf_s2_audit_select on public.bf_audit_logs
for select to authenticated
using (
  public.bf_is_super_admin()
  or (organization_id is not null and public.bf_has_org_access(organization_id))
);

commit;

-- ==========================================================
-- FIRST ADMIN BOOTSTRAP — RUN AFTER CREATING THE AUTH USER
-- Replace the email below with YOUR admin email, then run once:
--
-- update public.bf_profiles
-- set is_super_admin = true, status='active'
-- where email = 'YOUR_ADMIN_EMAIL@example.com';
--
-- Verify:
-- select id,email,full_name,is_super_admin,status
-- from public.bf_profiles
-- order by created_at desc;
-- ==========================================================
