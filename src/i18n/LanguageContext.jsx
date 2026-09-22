import {productExperienceDict} from '../lib/productExperienceLanguage'
import {accessReviewDict} from '../lib/accessReviewLanguage'
import {governanceDict} from '../lib/governanceLanguage'
import {softFmDict} from '../lib/softFmLanguage'
import {organizationOnboardingDict} from '../lib/organizationOnboardingLanguage'
import {enterpriseStructureDict} from '../lib/enterpriseStructureLanguage'
import {enterpriseAccessDict} from '../lib/enterpriseAccessLanguage'
import {releaseReadinessDict} from '../lib/releaseReadinessLanguage'
import {securityReadinessDict} from '../lib/securityReadinessLanguage'
import {mobileFieldDict} from '../lib/mobileFieldLanguage'
import {documentControlDict} from '../lib/documentControlLanguage'
import {ownerPortalDict} from '../lib/ownerPortalLanguage'
import {executiveDict} from '../lib/executiveLanguage'
import {contractRenewalDict} from '../lib/contractRenewalLanguage'
import {hseDict} from '../lib/hseLanguage'
import {utilitiesDict} from '../lib/utilitiesLanguage'
import {permitDict} from '../lib/permitLanguage'
import {complianceDict} from '../lib/complianceLanguage'
import {reliabilityDict} from '../lib/reliabilityLanguage'
import {backlogDict} from '../lib/backlogLanguage'
import {workforceDict} from '../lib/workforceLanguage'
import {supplierPerformanceDict} from '../lib/supplierPerformanceLanguage'
import {planningDict} from '../lib/planningLanguage'
import {auditDict} from '../lib/auditLanguage'
import {kpiDict} from '../lib/kpiLanguage'
import {costingDict} from '../lib/costingLanguage'
import {lifecycleDict} from '../lib/lifecycleLanguage'
import {documentDict} from '../lib/documentLanguage'
import {notificationDict} from '../lib/notificationLanguage'
import {approvalDict} from '../lib/approvalLanguage'
import {reportFixDict} from '../lib/reportFixLanguage'
import {reportDict} from '../lib/reportLanguage'
import {fieldDict} from '../lib/fieldLanguage'
import {advancedStockDict} from '../lib/advancedStockLanguage'
import {procurementDict} from '../lib/procurementLanguage'
import {inventoryDict} from '../lib/inventoryLanguage'
import {ppmDict} from '../lib/ppmLanguage'
import { correctiveDict } from '../lib/correctiveLanguage'
import { dict as facilityDict } from '../lib/facilityLanguage'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LanguageContext = createContext(null)

const dictionary = {
  en: {
    appName: 'Basmat Medical Equipment CMMS',
    sprint: 'Sprint 2 — Auth + CRUD + RLS',
    dashboard: 'Dashboard',
    organizations: 'Organizations',
    clients: 'Clients',
    contracts: 'Contracts',
    sites: 'Sites',
    usersRoles: 'Users & Roles',
    logout: 'Logout',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    welcome: 'Facilities maintenance command center',
    activeOrganizations: 'Organizations',
    activeClients: 'Clients',
    activeContracts: 'Active Contracts',
    activeSites: 'Sites',
    add: 'Add',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Archive',
    loading: 'Loading...',
    noData: 'No records found',
    name: 'Name',
    code: 'Code',
    status: 'Status',
    actions: 'Actions',
    active: 'Active',
    inactive: 'Inactive',
    archived: 'Archived',
    draft: 'Draft',
    suspended: 'Suspended',
    expired: 'Expired',
    closed: 'Closed',
    client: 'Client',
    organization: 'Organization',
    contractNumber: 'Contract Number',
    contractType: 'Contract Type',
    startDate: 'Start Date',
    endDate: 'End Date',
    contractValue: 'Contract Value',
    siteName: 'Site Name',
    city: 'City',
    address: 'Address',
    phone: 'Phone',
    role: 'Role',
    user: 'User',
    fullName: 'Full Name',
    superAdmin: 'Super Admin',
    language: 'العربية',
    confirmArchive: 'Archive this record?',
    saved: 'Saved successfully',
    error: 'Something went wrong',
    loginHint: 'Use a Supabase Auth user created for Basmat Medical Equipment CMMS.',
    unauthorized: 'You do not have access to this module.',
    comprehensive: 'Comprehensive',
    nonComprehensive: 'Non-Comprehensive',
    ppm: 'PPM',
    corrective: 'Corrective',
    manpower: 'Manpower',
    mixed: 'Mixed',
    companyAdmin: 'Company Admin',
    facilityManager: 'Facility Manager',
    maintenanceManager: 'Maintenance Manager',
    supervisor: 'Supervisor',
    technician: 'Technician',
    helpDesk: 'Help Desk',
    storeKeeper: 'Store Keeper',
    clientAdmin: 'Client Admin',
    clientUser: 'Client User',
    assignRole: 'Assign Role',
    membership: 'Organization Membership',
    createAuthUserNote: 'Create the Auth user first in Supabase Authentication, then assign the role here.',
  },
  ar: {
    appName: 'Basmat Medical Equipment CMMS',
    sprint: 'Sprint 2 — الدخول + الإدارة + الأمان',
    dashboard: 'لوحة التحكم',
    organizations: 'الشركات',
    clients: 'العملاء',
    contracts: 'العقود',
    sites: 'المواقع',
    usersRoles: 'المستخدمون والصلاحيات',
    logout: 'تسجيل الخروج',
    login: 'تسجيل الدخول',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signIn: 'دخول',
    signingIn: 'جارٍ الدخول...',
    welcome: 'مركز إدارة وتشغيل صيانة الأجهزة الطبية',
    activeOrganizations: 'الشركات',
    activeClients: 'العملاء',
    activeContracts: 'العقود النشطة',
    activeSites: 'المواقع',
    add: 'إضافة',
    edit: 'تعديل',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'أرشفة',
    loading: 'جارٍ التحميل...',
    noData: 'لا توجد بيانات',
    name: 'الاسم',
    code: 'الكود',
    status: 'الحالة',
    actions: 'الإجراءات',
    active: 'نشط',
    inactive: 'غير نشط',
    archived: 'مؤرشف',
    draft: 'مسودة',
    suspended: 'معلق',
    expired: 'منتهي',
    closed: 'مغلق',
    client: 'العميل',
    organization: 'الشركة',
    contractNumber: 'رقم العقد',
    contractType: 'نوع العقد',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ النهاية',
    contractValue: 'قيمة العقد',
    siteName: 'اسم الموقع',
    city: 'المدينة',
    address: 'العنوان',
    phone: 'الهاتف',
    role: 'الدور',
    user: 'المستخدم',
    fullName: 'الاسم الكامل',
    superAdmin: 'مدير المنصة',
    language: 'English',
    confirmArchive: 'هل تريد أرشفة هذا السجل؟',
    saved: 'تم الحفظ بنجاح',
    error: 'حدث خطأ',
    loginHint: 'استخدم مستخدم Supabase Auth المخصص لنظام Basmat Medical Equipment CMMS.',
    unauthorized: 'ليس لديك صلاحية للوصول إلى هذه الوحدة.',
    comprehensive: 'شامل',
    nonComprehensive: 'غير شامل',
    ppm: 'صيانة وقائية PPM',
    corrective: 'صيانة تصحيحية',
    manpower: 'قوى عاملة',
    mixed: 'مختلط',
    companyAdmin: 'مدير الشركة',
    facilityManager: 'مدير الأجهزة الطبية',
    maintenanceManager: 'مدير الصيانة',
    supervisor: 'مشرف',
    technician: 'فني',
    helpDesk: 'مكتب المساعدة',
    storeKeeper: 'أمين المخزن',
    clientAdmin: 'مدير العميل',
    clientUser: 'مستخدم العميل',
    assignRole: 'إسناد دور',
    membership: 'عضوية الشركة',
    createAuthUserNote: 'أنشئ المستخدم أولاً في Supabase Authentication ثم أسند له الدور من هنا.',
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('bf_lang') || 'en')
  useEffect(() => {
    localStorage.setItem('bf_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key) => productExperienceDict[lang]?.[key] ?? accessReviewDict[lang]?.[key] ?? governanceDict[lang]?.[key] ?? softFmDict[lang]?.[key] ?? organizationOnboardingDict[lang]?.[key] ?? enterpriseStructureDict[lang]?.[key] ?? enterpriseAccessDict[lang]?.[key] ?? releaseReadinessDict[lang]?.[key] ?? securityReadinessDict[lang]?.[key] ?? mobileFieldDict[lang]?.[key] ?? documentControlDict[lang]?.[key] ?? ownerPortalDict[lang]?.[key] ?? executiveDict[lang]?.[key] ?? contractRenewalDict[lang]?.[key] ?? hseDict[lang]?.[key] ?? utilitiesDict[lang]?.[key] ?? permitDict[lang]?.[key] ?? complianceDict[lang]?.[key] ?? reliabilityDict[lang]?.[key] ?? backlogDict[lang]?.[key] ?? workforceDict[lang]?.[key] ?? supplierPerformanceDict[lang]?.[key] ?? planningDict[lang]?.[key] ?? auditDict[lang]?.[key] ?? kpiDict[lang]?.[key] ?? costingDict[lang]?.[key] ?? lifecycleDict[lang]?.[key] ?? documentDict[lang]?.[key] ?? notificationDict[lang]?.[key] ?? approvalDict[lang]?.[key] ?? reportFixDict[lang]?.[key] ?? reportDict[lang]?.[key] ?? fieldDict[lang]?.[key] ?? advancedStockDict[lang]?.[key] ?? procurementDict[lang]?.[key] ?? inventoryDict[lang]?.[key] ?? ppmDict[lang]?.[key] ?? correctiveDict[lang]?.[key] ?? facilityDict[lang]?.[key] ?? dictionary[lang]?.[key] ?? key,
    dir: lang === 'ar' ? 'rtl' : 'ltr'
  }), [lang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
