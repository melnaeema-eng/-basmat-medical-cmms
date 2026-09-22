select version,applied_at from public.bf_migrations where version=39;

select code from public.bf_permissions
where code in('access-review.view','access-review.manage','access-review.approve')
order by code;

select to_regclass('public.bf39_access_requests') access_requests,
       to_regclass('public.bf39_access_reviews') access_reviews;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in(
 'bf39_request_access','bf39_decide_request','bf39_review_scope',
 'bf39_process_expired','bf39_dashboard'
)
order by p.proname;
