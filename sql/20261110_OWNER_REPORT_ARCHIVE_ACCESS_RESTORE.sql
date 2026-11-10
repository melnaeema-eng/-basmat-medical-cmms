-- MEDICAL project pxbtwjuerndgmppicumr only.
-- Restore original owner-report table privileges, behind EXISTING RLS policies.
-- Does not change any user role, permission template, policy, or stored report.
-- Review the live RLS definitions before applying. All guards must pass.
begin;
do $guard$
declare
 item record;
 table_oid oid;
 expected_policy text;
begin
 for item in select * from (values
  ('bf_owner_report_branding',array['bf_owner_report_branding_read','bf_owner_report_branding_write']),
  ('bf_owner_report_runs',array['bf_owner_report_runs_read','bf_owner_report_runs_insert','bf_owner_report_runs_update']),
  ('bf_owner_report_events',array['bf_owner_report_events_read','bf_owner_report_events_write'])
 ) as tables(table_name,policy_names)
 loop
  table_oid:=to_regclass(format('public.%I',item.table_name));
  if table_oid is null or not exists(select 1 from pg_class where oid=table_oid and relrowsecurity) then
   raise exception 'RLS-protected report table required: %',item.table_name;
  end if;
  foreach expected_policy in array item.policy_names loop
   if not exists(select 1 from pg_policies where schemaname='public' and tablename=item.table_name and policyname=expected_policy
    and 'authenticated'=any(roles)
    and coalesce(qual,with_check,'') like '%bf4_staff%'
    and coalesce(qual,with_check,'') like '%reports.view%') then
    raise exception 'Expected authorization policy missing or changed: %. Review live policies; no grants applied.',expected_policy;
   end if;
  end loop;
 end loop;
end $guard$;
grant select,insert,update on public.bf_owner_report_branding to authenticated;
grant select,insert,update on public.bf_owner_report_runs to authenticated;
grant select,insert on public.bf_owner_report_events to authenticated;
notify pgrst,'reload schema';
commit;
select table_name,
 has_table_privilege('authenticated',format('public.%I',table_name),'SELECT') as select_restored,
 has_table_privilege('authenticated',format('public.%I',table_name),'INSERT') as insert_restored
from (values ('bf_owner_report_branding'),('bf_owner_report_runs'),('bf_owner_report_events')) as reports(table_name);
