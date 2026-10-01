// Medical CMMS route/action permission compatibility.
// Keeps current UI route keys while enforcing the new medical ACL keys.
export const medicalPermissionAliases={
  'assets.view':'medical.assets.view',
  'assets.manage':'medical.assets.manage',

  'inventory.view':'medical.inventory.view',
  'inventory.manage':'medical.inventory.manage',

  'ppm.view':'medical.ppm.view',
  'ppm.execute':'medical.ppm.execute',
  'ppm.review':'medical.ppm.review',
  'ppm.manage':'medical.ppm.manage',

  'corrective.view':'medical.work_orders.view',
  'corrective.execute':'medical.work_orders.execute',
  'corrective.review':'medical.work_orders.review',
  'corrective.assign':'medical.work_orders.assign',
  'corrective.manage':'medical.work_orders.manage',

  'maintenance.execute':'medical.work_orders.execute',

  'supplier-performance.view':'medical.service_companies.view',
  'supplier-performance.manage':'medical.service_companies.manage',
  'medical-service-companies.view':'medical.service_companies.view',
  'medical-service-companies.manage':'medical.service_companies.manage'
}

export function resolveMedicalPermission(permission){
  return medicalPermissionAliases[permission]||permission
}
