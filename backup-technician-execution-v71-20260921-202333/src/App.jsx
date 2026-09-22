import MasterAssetLibrary from './pages/MasterAssetLibrary'
import AccessReview from './pages/AccessReview'
import GovernanceMatrix from './pages/GovernanceMatrix'
import SoftFmOperations from './pages/SoftFmOperations'
import OrganizationOnboarding from './pages/OrganizationOnboarding'
import EnterpriseStructure from './pages/EnterpriseStructure'
import EnterpriseAccess from './pages/EnterpriseAccess'
import ReleaseReadiness from './pages/ReleaseReadiness'
import SecurityReadiness from './pages/SecurityReadiness'
import MobileField from './pages/MobileField'
import DocumentControl from './pages/DocumentControl'
import OwnerPortal from './pages/OwnerPortal'
import ExecutiveDashboard from './pages/ExecutiveDashboard'
import ContractRenewalDashboard from './pages/ContractRenewalDashboard'
import HseIncidents from './pages/HseIncidents'
import UtilitiesDashboard from './pages/UtilitiesDashboard'
import PermitToWork from './pages/PermitToWork'
import ComplianceRegister from './pages/ComplianceRegister'
import ReliabilityDashboard from './pages/ReliabilityDashboard'
import BacklogPriority from './pages/BacklogPriority'
import WorkforceDispatch from './pages/WorkforceDispatch'
import SupplierPerformance from './pages/SupplierPerformance'
import PlanningCalendar from './pages/PlanningCalendar'
import AuditCenter from './pages/AuditCenter'
import KpiDashboard from './pages/KpiDashboard'
import MaintenanceCosting from './pages/MaintenanceCosting'
import AssetLifecycle from './pages/AssetLifecycle'
import Documents from './pages/Documents'
import Notifications from './pages/Notifications'
import ApprovalPortal from './pages/ApprovalPortal'
import ManagementReports from './pages/ManagementReports'
import AdvancedStock from './pages/AdvancedStock'
import AdvancedStockDetails from './pages/AdvancedStockDetails'
import Procurement from './pages/Procurement'
import ProcurementDetails from './pages/ProcurementDetails'
import Inventory from './pages/Inventory'
import InventoryDetails from './pages/InventoryDetails'
import PPM from './pages/PPM'
import PPMDetails from './pages/PPMDetails'
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom'
import {AuthProvider} from './context/AuthContext'
import {LanguageProvider} from './i18n/LanguageContext'
import ProtectedRoute from './components/ProtectedRoute'
import PermissionRoute from './components/PermissionRoute'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Organizations from './pages/Organizations'
import Clients from './pages/Clients'
import Contracts from './pages/Contracts'
import Sites from './pages/Sites'
import UsersRoles from './pages/UsersRoles'
import LocationManagement from './pages/LocationManagement'
import AssetCategories from './pages/AssetCategories'
import AssetRegister from './pages/AssetRegister'
import Corrective from './pages/Corrective'
import CorrectiveDetails from './pages/CorrectiveDetails'
import AssetDetails from './pages/AssetDetails'
import MedicalMaintenanceCenter from './pages/MedicalMaintenanceCenter'
export default function App(){
 const guard=(permission,element)=><PermissionRoute permission={permission}>{element}</PermissionRoute>
 return <LanguageProvider><AuthProvider><BrowserRouter><Routes>
  <Route path="/login" element={<Login/>}/>
  <Route element={<ProtectedRoute><AppShell/></ProtectedRoute>}>
   <Route index element={<Dashboard/>}/>
   <Route path="/organizations" element={guard('organizations.view',<OrganizationOnboarding/>)}/>
   <Route path="/soft-fm" element={guard('soft-fm.view',<SoftFmOperations/>)}/>
   <Route path="/governance" element={guard('governance.view',<GovernanceMatrix/>)}/>
   <Route path="/access-review" element={guard('access-review.view',<AccessReview/>)}/>
   <Route path="/clients" element={guard('clients.view',<Clients/>)}/>
   <Route path="/contracts" element={guard('contracts.view',<Contracts/>)}/>
   <Route path="/sites" element={guard('sites.view',<Sites/>)}/>
   <Route path="/locations" element={guard('locations.view',<LocationManagement/>)}/>
   <Route path="/asset-categories" element={guard('assets.view',<AssetCategories/>)}/>
   <Route path="/asset-library" element={guard('assets.view',<MasterAssetLibrary/>)}/>
   <Route path="/assets" element={guard('assets.view',<AssetRegister/>)}/>
   <Route path="/assets/:id" element={guard('assets.view',<AssetDetails/>)}/>
   <Route path="/corrective" element={guard('corrective.view',<Corrective/>)}/>
   <Route path="/corrective/:kind/:id" element={guard('corrective.view',<CorrectiveDetails/>)}/>
   <Route path="/ppm" element={guard('ppm.view',<PPM/>)}/>
   <Route path="/ppm/:kind/:id" element={guard('ppm.view',<PPMDetails/>)}/>
   <Route path="/inventory" element={guard('inventory.view',<Inventory/>)}/>
   <Route path="/inventory/request/:id" element={guard('inventory.view',<InventoryDetails/>)}/>
   <Route path="/procurement" element={guard('procurement.view',<Procurement/>)}/>
   <Route path="/procurement/:kind/:id" element={guard('procurement.view',<ProcurementDetails/>)}/>
   <Route path="/advanced-stock" element={guard('inventory.view',<AdvancedStock/>)}/>
   <Route path="/advanced-stock/:id" element={guard('inventory.view',<AdvancedStockDetails/>)}/>
   <Route path="/reports" element={guard('reports.view',<ManagementReports/>)}/>
   <Route path="/approvals" element={<ApprovalPortal/>}/>
   <Route path="/notifications" element={<Notifications/>}/>
   <Route path="/documents" element={<Documents/>}/>
   <Route path="/asset-lifecycle" element={<AssetLifecycle/>}/>
   <Route path="/maintenance-costing" element={<MaintenanceCosting/>}/>
   <Route path="/kpi" element={guard('kpi.view',<KpiDashboard/>)}/>
   <Route path="/audit" element={guard('audit.view',<AuditCenter/>)}/>
   <Route path="/planning" element={guard('planning.view',<PlanningCalendar/>)}/>
   <Route path="/supplier-performance" element={guard('supplier-performance.view',<SupplierPerformance/>)}/>
   <Route path="/workforce" element={guard('workforce.view',<WorkforceDispatch/>)}/>
   <Route path="/backlog" element={guard('backlog.view',<BacklogPriority/>)}/>
   <Route path="/reliability" element={guard('reliability.view',<ReliabilityDashboard/>)}/>
   <Route path="/compliance" element={guard('compliance.view',<ComplianceRegister/>)}/>
   <Route path="/permits" element={guard('permit.view',<PermitToWork/>)}/>
   <Route path="/utilities" element={guard('utilities.view',<UtilitiesDashboard/>)}/>
   <Route path="/hse" element={guard('hse.view',<HseIncidents/>)}/>
   <Route path="/contract-renewal" element={guard('contract-renewal.view',<ContractRenewalDashboard/>)}/>
   <Route path="/executive" element={guard('executive.view',<ExecutiveDashboard/>)}/>
   <Route path="/owner-portal" element={<OwnerPortal/>}/>
   <Route path="/document-control" element={guard('document-control.view',<DocumentControl/>)}/>
   <Route path="/field-mobile" element={guard('mobile-field.view',<MobileField/>)}/>
   <Route path="/security-readiness" element={guard('security.view',<SecurityReadiness/>)}/>
   <Route path="/release-readiness" element={guard('release.view',<ReleaseReadiness/>)}/>
   <Route path="/enterprise-access" element={guard('enterprise-access.view',<EnterpriseAccess/>)}/>
   <Route path="/enterprise-structure" element={guard('enterprise-structure.view',<EnterpriseStructure/>)}/>
   <Route path="/users"       element={guard('users.view',<UsersRoles/>)}/>
   <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route>
       <Route path="/medical" element={guard('medical.view', <MedicalMaintenanceCenter />)} />
</Routes></BrowserRouter></AuthProvider></LanguageProvider>
}

