import {useLayoutEffect,useState} from 'react'
import {Navigate,useLocation} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {companyWorkspace,isCompanyAdministrationPath} from '../lib/companyWorkspace'
export default function CompanyWorkspaceBoundary({children}){
 const {access,profile,user,loading}=useAuth(),{lang}=useLanguage(),{pathname}=useLocation(),ar=lang==='ar'
 const scope=companyWorkspace(access,profile),key=(user?.id||'')+':'+(scope.companyId||'')
 const [bound,setBound]=useState(''),[storageError,setStorageError]=useState(false)
 useLayoutEffect(()=>{
  if(scope.isSuperAdmin||!scope.companyId)return
  try{
   localStorage.setItem('basmat.active.organization',scope.companyId)
   window.dispatchEvent(new CustomEvent('basmat-organization-changed',{detail:{organization_id:scope.companyId}}))
   setStorageError(false);setBound(key)
  }catch{setStorageError(true)}
 },[scope.isSuperAdmin,scope.companyId,key])
 if(loading)return <p role="status">{ar?'جارٍ تحميل الحساب…':'Loading account…'}</p>
 if(scope.isSuperAdmin)return children
 if(!scope.companyId||storageError)return <div className="facility-panel" role="alert"><h2>{ar?'تعذّر فتح مساحة الشركة':'Company workspace unavailable'}</h2><p>{ar?'راجع مدير النظام للتأكد من الشركة المسندة إلى حسابك.':'Ask your administrator to verify the company assigned to your account.'}</p></div>
 if(isCompanyAdministrationPath(pathname))return <Navigate to="/" replace/>
 if(bound!==key)return <p role="status">{ar?'جارٍ فتح مساحة شركتك…':'Opening your company workspace…'}</p>
 return children
}
