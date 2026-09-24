import {supabase} from './supabaseClient'
export async function loadNotifications(unreadOnly=false,limit=100,offset=0){
 const {data,error}=await supabase.rpc('bf12_feed',{p_unread_only:unreadOnly,p_limit:limit,p_offset:offset})
 if(error)throw error
 return data
}
export async function setNotificationRead(key,read=true){
 const {error}=await supabase.rpc('bf12_read',{p_key:key,p_read:read})
 if(error)throw error
}
export async function markAllNotificationsRead(){
 const {data,error}=await supabase.rpc('bf12_mark_all_read')
 if(error)throw error
 return data
}
