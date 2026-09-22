-- Basmat Facilities CMMS — Sprint 40
-- Professional Product Consolidation & Role-Based Workspaces
-- Frontend/navigation release marker only. No business data or schema changes.
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=39)
 then raise exception 'Install and verify Sprint 39 first'; end if;
 if exists(select 1 from public.bf_migrations where version=40)
 then raise exception 'Sprint 40 already installed'; end if;
end $$;

insert into public.bf_migrations(version) values(40);

commit;
