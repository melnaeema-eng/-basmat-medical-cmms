import test from 'node:test'
import assert from 'node:assert/strict'
import {isCompanyAdministrationPath} from '../src/lib/companyWorkspace.js'
test('Company-management URLs remain blocked while owners, projects and the device library remain available',()=>{
 for(const path of ['/maintenance-companies','/organizations','/organizations/new','/medical-tenant-admin','/medical-smart-onboarding','/medical-knowledge-library','/medical-service-library'])assert.equal(isCompanyAdministrationPath(path),true,path)
 for(const path of ['/owners','/project-setup','/asset-library','/corrective','/contracts','/users'])assert.equal(isCompanyAdministrationPath(path),false,path)
})
