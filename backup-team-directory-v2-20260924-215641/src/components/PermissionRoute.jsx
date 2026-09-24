import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
export default function PermissionRoute({permission,children}){
 const {can}=useAuth(),{t}=useLanguage()
 return can(permission)?children:<div className="facility-empty">{t('noPermission')}</div>
}
