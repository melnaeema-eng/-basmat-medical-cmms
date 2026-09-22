import {Navigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
export default function ProtectedRoute({children}){
 const {user,profile,loading}=useAuth()
 if(loading)return <div className="center-screen">Loading...</div>
 if(!user)return <Navigate to="/login" replace/>
 if(profile?.status!=='active')return <div className="center-screen">Access unavailable / الوصول غير متاح</div>
 return children
}
