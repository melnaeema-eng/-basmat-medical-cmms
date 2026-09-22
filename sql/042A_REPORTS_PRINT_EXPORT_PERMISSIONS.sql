-- BAFM Reports Print/Export Hotfix
-- Adds reports.export to enterprise management/reporting roles.
begin;

insert into public.bf_permissions(code,description)
values
 ('reports.view','View operational management reports'),
 ('reports.export','Export operational management reports')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
join public.bf_permissions p on p.code in('reports.view','reports.export')
where r.code in(
 'company_admin',
 'owner_director',
 'owner_maintenance_manager',
 'contractor_director',
 'operations_manager',
 'project_manager',
 'facility_manager',
 'maintenance_manager',
 'contract_manager',
 'consultant_manager',
 'consultant_engineer',
 'finance_manager',
 'auditor_readonly'
)
on conflict do nothing;

commit;
