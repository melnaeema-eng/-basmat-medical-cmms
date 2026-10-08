-- BASMAT MEDICAL CMMS
-- REBUILD SPRINT A2 — ASSET OPERATIONS COCKPIT SUPPORT
-- Adds only safe read support. A1 must already be PASS.

begin;

do $$
begin
  if to_regclass('public.bf_med_asset_service_overview') is null then
    raise exception 'A1 prerequisite missing: bf_med_asset_service_overview';
  end if;

  if to_regprocedure('public.bf_med_asset_operational_context(uuid)') is null then
    raise exception 'A1 prerequisite missing: bf_med_asset_operational_context(uuid)';
  end if;
end $$;

grant select on public.bf_med_asset_service_overview to authenticated;
grant execute on function public.bf_med_asset_operational_context(uuid) to authenticated;

notify pgrst,'reload schema';

commit;

select
  to_regclass('public.bf_med_asset_service_overview') is not null as cockpit_view_ready,
  to_regprocedure('public.bf_med_asset_operational_context(uuid)') is not null as cockpit_rpc_ready;
