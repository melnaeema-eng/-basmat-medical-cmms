import {Navigate,useLocation} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
export default function ProtectedRoute({children}){
 const {user,profile,loading}=useAuth()
 const location=useLocation()
 if(loading)return <div className="center-screen">Loading...</div>
 if(!user)return <Navigate to="/login" state={{from:location.pathname+location.search+location.hash}} replace/>
 if(['inactive','disabled','suspended','archived'].includes(String(profile?.status||'').toLowerCase()))return <div className="center-screen">Access unavailable / الوصول غير متاح</div>
 return children
}
