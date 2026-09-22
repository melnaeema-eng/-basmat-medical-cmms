select version,applied_at from public.bf_migrations where version=34;

select code,name
from public.bf_roles
where code in(
 'owner_director','owner_maintenance_manager','contract_manager','site_manager',
 'consultant_manager','consultant_engineer','contractor_director','operations_manager',
 'project_manager','senior_technician','electrical_supervisor','mechanical_supervisor',
 'hvac_supervisor','plumbing_supervisor','elv_supervisor','cleaning_supervisor','cleaner',
 'security_supervisor','security_guard','landscape_supervisor','gardener',
 'pest_control_worker','waste_worker','store_manager','procurement_manager','buyer',
 'finance_manager','accountant','hse_manager','safety_officer','dispatcher','auditor_readonly'
)
order by code;

select code
from public.bf_permissions
where code like 'enterprise-access.%'
   or code like 'cleaning.%'
   or code like 'security-ops.%'
   or code like 'landscape.%'
   or code like 'waste.%'
   or code like 'pest-control.%'
order by code;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in('bf34_can','bf34_scope_match','bf34_assign_scope','bf34_set_scope_active','bf34_access_matrix')
order by p.proname;
