-- Sprint 11 read-only verification. Run after migration 012 succeeds.
select version,applied_at from public.bf_migrations where version=11;
select to_regclass('public.bf11_consultant_access') as consultant_access,
       to_regclass('public.bf11_approvals') as approvals,
       to_regclass('public.bf11_events') as approval_events;
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in(
 'bf11_portal','bf11_action','bf11_find_profile','bf11_consultant_manage',
 'bf11_owner','bf11_consultant','bf11_can_view')
order by p.proname;
select code from public.bf_permissions
where code in('approvals.view','approvals.request','approvals.manage','consultants.manage')
order by code;
select tgname from pg_trigger
where not tgisinternal and tgname in('bf11_wo_close_guard','bf11_ppm_close_guard')
order by tgname;
-- No INSERT, UPDATE or DELETE is required for verification.
