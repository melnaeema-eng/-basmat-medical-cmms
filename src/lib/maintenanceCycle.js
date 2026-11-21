import {emitNotificationRefresh} from './notifications'
import {supabase} from './supabaseClient'
import {loadCycleCenter} from './cycleCenter'
export async function cycleRpc(name,args={}){
 const {data,error}=await supabase.rpc(name,args)
 if(error)throw error
 if(['bf44_closeout_action','bf44_statement_action','bf44_approval_action'].includes(name))emitNotificationRefresh()
 return data
}
export function migrationMissing(error){return error?.code==='PGRST202'||error?.code==='42883'||/Could not find.*bf44_/i.test(error?.message||'')}
export const readCycle=org=>loadCycleCenter(cycleRpc,org)
export const readDossier=id=>cycleRpc('bf44_dossier',{p_work_order:id})
export const closeout=(id,action)=>cycleRpc('bf44_closeout_action',{p_work_order:id,p_action:action})
export const statementAction=(action,id,data={})=>cycleRpc('bf44_statement_action',{p_action:action,p_id:id||null,p_data:data})
export const readStatement=id=>cycleRpc('bf44_statement_read',{p_id:id})
export const decideApproval=(id,action,comment='')=>cycleRpc('bf44_approval_action',{p_action:action,p_id:id,p_data:{comment}})

