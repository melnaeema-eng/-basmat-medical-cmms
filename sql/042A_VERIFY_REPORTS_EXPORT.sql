select r.code role_code,p.code permission_code
from public.bf_roles r
join public.bf_role_permissions rp on rp.role_id=r.id
join public.bf_permissions p on p.id=rp.permission_id
where p.code in('reports.view','reports.export')
  and r.code in(
   'company_admin','owner_director','owner_maintenance_manager','contractor_director',
   'operations_manager','project_manager','facility_manager','maintenance_manager',
   'contract_manager','consultant_manager','consultant_engineer','finance_manager','auditor_readonly'
  )
order by r.code,p.code;
