begin;

alter table public.bf_med_healthcare_owners enable row level security;

revoke all on table public.bf_med_healthcare_owners from public, anon;
revoke delete, truncate, references, trigger
  on table public.bf_med_healthcare_owners
  from authenticated;

grant select, insert, update
  on table public.bf_med_healthcare_owners
  to authenticated;

drop policy if exists bf_med_healthcare_owners_super_read
  on public.bf_med_healthcare_owners;
drop policy if exists bf_med_healthcare_owners_super_insert
  on public.bf_med_healthcare_owners;
drop policy if exists bf_med_healthcare_owners_super_update
  on public.bf_med_healthcare_owners;

create policy bf_med_healthcare_owners_super_read
on public.bf_med_healthcare_owners
for select
to authenticated
using (public.bf_acl_is_super_user(auth.uid()));

create policy bf_med_healthcare_owners_super_insert
on public.bf_med_healthcare_owners
for insert
to authenticated
with check (public.bf_acl_is_super_user(auth.uid()));

create policy bf_med_healthcare_owners_super_update
on public.bf_med_healthcare_owners
for update
to authenticated
using (public.bf_acl_is_super_user(auth.uid()))
with check (public.bf_acl_is_super_user(auth.uid()));

notify pgrst,'reload schema';

commit;
