-- Basmat Facilities CMMS — Sprint 41
-- Professional Work Order Control Center
-- UI/operational consolidation only. Existing corrective workflow and automatic WO codes are retained.
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=40)
 then raise exception 'Install and verify Sprint 40 first'; end if;
 if exists(select 1 from public.bf_migrations where version=41)
 then raise exception 'Sprint 41 already installed'; end if;
end $$;
insert into public.bf_migrations(version) values(41);
commit;
