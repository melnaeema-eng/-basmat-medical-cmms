export function executionActionAccess(pkg,profile,canManage=false){
 const authorized=!!pkg&&profile?.status==='active'&&!!profile.id&&(pkg.technician_id===profile.id||canManage)
 return {authorized,canStart:authorized&&['assigned','blocked'].includes(pkg.status),canEdit:authorized&&pkg.status==='started'}
}
