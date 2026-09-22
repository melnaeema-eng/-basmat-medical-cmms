-- Sprint 12 read-only verification
select version,applied_at from public.bf_migrations where version=12;
select to_regclass('public.bf12_notification_reads') as notification_reads;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf12_feed','bf12_read','bf12_mark_all_read')
order by p.proname;
select code from public.bf_permissions where code='notifications.view';
