import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const mainOrg='25abee4e-0084-4c44-ab95-649392aea091';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Vary':'Origin'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message:string,status=400)=>json({error:message},status);
const db=createClient(url,service,{auth:{persistSession:false}});
const validUUID=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const active=(x:any)=>x?.is_active===true&&(!x.valid_from||x.valid_from<=new Date().toISOString().slice(0,10))&&(!x.valid_until||x.valid_until>=new Date().toISOString().slice(0,10));
async function audit(actor:string,organization_id:string,action:string,target:string,details:unknown){
 const {error}=await db.from('bf_org_admin_audit').insert({actor_id:actor,organization_id,action,target_user_id:target,details});
 if(error)throw Error('Audit insert failed; operation must be reviewed: '+error.message);
}
async function userByEmail(email:string){for(let page=1;page<=10;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw error;const hit=data.users.find(u=>u.email?.toLowerCase()===email);if(hit)return hit;if(data.users.length<1000)break;}return null;}
Deno.serve(async req=>{
 try{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return fail('POST required',405);
 const jwt=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)return fail('Authentication required',401);
 const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
 const {data:{user},error}=await caller.auth.getUser(jwt);if(error||!user)return fail('Authentication required',401);
 const body=await req.json();const action=body.action;
 // This deployment is configured for ONE operating company. No organization switching.
 const org=mainOrg;
 const accessCheck=await caller.rpc('bf_company_admin_access',{p_org:org});
 if(accessCheck.error||accessCheck.data?.can_manage!==true)return fail('Company administrator permission required',403);
 if(action==='directory'){
  const [{data:organization,error:oe},{data:roles,error:re},{data:assignments,error:ae},{data:memberships,error:me}]=await Promise.all([
   db.from('bf_organizations').select('id,name,status').eq('id',org),
   db.from('bf_acl_roles').select('id,role_code,role_name_ar,is_active').eq('is_active',true).in('id',(accessCheck.data.roles||[]).map((r:any)=>r.id)),
   db.from('bf_acl_user_roles').select('user_id,organization_id,role_id,is_active,valid_from,valid_until').eq('organization_id',org),
   db.from('bf_acl_user_organizations').select('user_id,organization_id,is_active').eq('organization_id',org)
  ]);
  if(oe||re||ae||me)throw oe||re||ae||me;
  const userIds=[...new Set((assignments||[]).map(x=>x.user_id))];
  let profiles:any[]=[];
  if(userIds.length){const {data,error:pe}=await db.from('bf_profiles').select('id,full_name').in('id',userIds);if(pe)throw pe;profiles=data||[];}
  const roleMap=new Map((roles||[]).map(r=>[r.id,r]));const profileMap=new Map(profiles.map(p=>[p.id,p]));const membershipIds=new Set((memberships||[]).filter(m=>m.is_active).map(m=>m.user_id));
  return json({organizations:organization||[],roles:roles||[],members:(assignments||[]).map(a=>({...a,role_code:roleMap.get(a.role_id)?.role_code,role_name_ar:roleMap.get(a.role_id)?.role_name_ar,full_name:profileMap.get(a.user_id)?.full_name||'مستخدم',is_active:!!a.is_active&&membershipIds.has(a.user_id)}))});
 }
 if(action==='inspect_user'){
  const email=String(body.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return fail('بريد إلكتروني غير صالح');
  const target=await userByEmail(email);
  if(!target)return json({exists:false,can_assign:true,message:'حساب جديد؛ يمكن إرسال دعوة للانضمام إلى شركة بصمة النوابغ.'});
  const {data:membership,error:membershipError}=await db.from('bf_acl_user_organizations').select('organization_id,is_active').eq('user_id',target.id).maybeSingle();
  if(membershipError)throw membershipError;
  if(membership && membership.organization_id!==org){
    const {data:employer}=await db.from('bf_organizations').select('name').eq('id',membership.organization_id).maybeSingle();
    return json({exists:true,can_assign:false,conflict:'different_employer',employer_name:employer?.name||'منظمة أخرى',message:'المستخدم مرتبط بالفعل بجهة عمل أخرى. لن يتم نقل عضويته أو منح دور تابع لشركة بصمة النوابغ تلقائياً. يلزم طلب انتساب معتمد منفصل.'});
  }
  return json({exists:true,can_assign:true,message:'الحساب موجود ويمكن إدارة عضويته في شركة بصمة النوابغ.'});
 }
 if(action==='invite'){
  const m=body.member||{};const email=String(m.email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return fail('Valid email required');
  if(m.organization_id!==org)return fail('Organization not authorized',403);
  const role=String(m.role_code||'');if(!/^[a-z][a-z0-9_]{1,63}$/.test(role))return fail('Invalid role');
  if(m.start&&(!/^\d{4}-\d{2}-\d{2}$/.test(m.start)))return fail('Invalid start date');
  if(m.end&&(!/^\d{4}-\d{2}-\d{2}$/.test(m.end)||m.start&&m.end<m.start))return fail('Invalid end date');
  const {data:roleRow,error:roleError}=await db.from('bf_acl_roles').select('id,organization_id').eq('role_code',role).eq('is_active',true).or(`organization_id.is.null,organization_id.eq.${org}`).maybeSingle();if(roleError||!roleRow)return fail('Active role not found');
  const roleCheck=await caller.rpc('bf_company_can_assign_role',{p_org:org,p_role:roleRow.id});if(roleCheck.error||roleCheck.data!==true)return fail('Role cannot be delegated',403);
  if(['super_admin','platform_admin','owner_rep'].includes(role))return fail('This role requires a separate administrative approval workflow',403);
  // Check existing affiliation BEFORE sending an invitation or changing any account state.
  let target=await userByEmail(email);let invited=false;
  if(target){
   const {data:preExisting,error:preError}=await db.from('bf_acl_user_organizations').select('organization_id,is_active').eq('user_id',target.id).maybeSingle();
   if(preExisting&&preExisting.is_active!==true)return fail('Account membership is inactive; review activation first',409);
   if(preError)throw preError;
   if(preExisting&&preExisting.organization_id!==org)return json({error:'المستخدم مرتبط بمنظمة أخرى. لم تُرسل دعوة ولم تتغير العضوية. استخدم إجراءات انتساب معتمدة منفصلة.',code:'different_employer'},409);
  }
  if(!target){const {data,error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:'https://medical.basmat-alnawabig.com.sa/accept-invitation',data:{full_name:String(m.full_name||'').slice(0,150)}});if(error)throw error;target=data.user;invited=true;}
  if(!target)return fail('Could not resolve invited account');
  const profileCheck=await db.from('bf_profiles').select('status,is_super_admin').eq('id',target.id).maybeSingle();if(profileCheck.error)throw profileCheck.error;if(profileCheck.data?.status!=='active'||profileCheck.data?.is_super_admin)return fail('This account requires platform administrator review',403);
  // Membership table has user_id PK. Never silently reassign a member from another organization.
  const {data:existing,error:existingError}=await db.from('bf_acl_user_organizations').select('organization_id').eq('user_id',target.id).maybeSingle();if(existingError)throw existingError;
  if(existing&&existing.organization_id!==org)return fail('User belongs to another organization. Use a separate approved affiliation workflow; no silent transfer.',409);
  if(!existing){const {error}=await db.from('bf_acl_user_organizations').insert({user_id:target.id,organization_id:org,is_active:true});if(error)throw error;}
  const {data:assignment,error:assignError}=await db.from('bf_acl_user_roles').select('role_id').eq('user_id',target.id).eq('organization_id',org).eq('role_id',roleRow.id).maybeSingle();if(assignError)throw assignError;
  const record={is_active:true,valid_from:m.start||null,valid_until:m.end||null};
  if(assignment){const {error}=await db.from('bf_acl_user_roles').update(record).eq('user_id',target.id).eq('organization_id',org).eq('role_id',roleRow.id);if(error)throw error;}
  else{const {error}=await db.from('bf_acl_user_roles').insert({user_id:target.id,organization_id:org,role_id:roleRow.id,...record});if(error)throw error;}
  await audit(user.id,org,'invite_or_assign',target.id,{role_code:role,valid_from:record.valid_from,valid_until:record.valid_until});
  return json({ok:true,invited,user_id:target.id});
 }
 if(action==='enable'||action==='disable'){
  const target=body.user_id;if(!validUUID(target))return fail('Valid user ID required');
  if(target===user.id)return fail('Cannot change own account',403);
  if(body.organization_id!==org)return fail('Organization not authorized',403);
  const {data:mem,error}=await db.from('bf_acl_user_organizations').select('user_id').eq('user_id',target).eq('organization_id',org).maybeSingle();if(error||!mem)return fail('Membership not found',404);
  if(accessCheck.data.is_platform_admin!==true){const [p,r]=await Promise.all([db.from('bf_profiles').select('is_super_admin').eq('id',target).maybeSingle(),db.from('bf_acl_user_roles').select('role_id').eq('user_id',target).eq('organization_id',org).eq('is_active',true)]);if(p.error||r.error)throw p.error||r.error;const adminRoles=await db.from('bf_acl_roles').select('id').in('role_code',['org_admin','super_admin','platform_admin']);if(adminRoles.error)throw adminRoles.error;if(p.data?.is_super_admin||(r.data||[]).some((x:any)=>(adminRoles.data||[]).some((a:any)=>a.id===x.role_id)))return fail('Platform administrator review required',403);}
  const enabled=action==='enable';
  const {error:updateError}=await db.from('bf_acl_user_organizations').update({is_active:enabled}).eq('user_id',target).eq('organization_id',org);if(updateError)throw updateError;
  await audit(user.id,org,action,target,{is_active:enabled});return json({ok:true});
 }
 return fail('Unknown action',400);
 }catch(e){return fail(e instanceof Error?e.message:'Server error',500)}
});
