const messages={
 assign:['إسناد الفني','Assign a technician'], accept:['قبول أمر العمل','Accept the work order'], start:['بدء التنفيذ','Start maintenance'],
 execute:['تنفيذ الصيانة وتسجيل النتائج','Perform maintenance and record results'], submit:['إرسال الإنجاز للمراجعة','Submit completed work for review'], review:['مراجعة واعتماد الإنجاز','Review and approve completed work'],
 resume:['معالجة سبب التعليق واستئناف العمل','Resolve the hold and resume work'], close:['إغلاق أمر العمل','Close the work order'], dossier:['متابعة الاعتمادات وشهادة الإنجاز والمستخلص','Continue approvals, certificate and statement'],
 closed:['اكتمل إغلاق العمل','Work closed'], cancelled:['العمل ملغى','Work cancelled'], triage:['مراجعة البلاغ','Review the request'], convert:['تحويل البلاغ إلى أمر عمل','Convert the request to a work order'], converted:['متابعة أمر العمل المرتبط','Continue the linked work order'], unknown:['مراجعة حالة العمل','Review work status']
}
export function maintenanceAction({kind,status,approvalStatus,assigned=false,technician='',lang='ar',integrated=false,steps=[],results=[]}){
 const ar=lang==='ar',l=(a,e)=>ar?a:e
 let key='unknown',responsible=l('مشرف الصيانة','Maintenance supervisor')
 const tech=technician||l('الفني المسند','Assigned technician')
 if(status==='closed'||status==='cancelled')return {key:status,title:messages[status][ar?0:1],responsible:'',terminal:true}
 if(kind==='request')key=({submitted:'triage',triaged:'convert',converted:'converted'})[status]||'unknown'
 else if(['draft','scheduled'].includes(status)||(!assigned&&status==='assigned'))key='assign'
 else if(status==='assigned'){key=kind==='ppm'?'start':'accept';responsible=tech}
 else if(status==='accepted'){key='start';responsible=tech}
 else if(status==='on_hold'){key='resume';responsible=tech}
 else if(status==='in_progress'){
  key='execute';responsible=tech
  if(kind==='ppm'&&steps.length&&checklistFocus(steps,results).next===null)key='submit'
 }
 else if(status==='completed')key=kind!=='ppm'&&approvalStatus!=='pending'?'submit':'review'
 else if(status==='approved')key=integrated?'dossier':'close'
 let title=messages[key][ar?0:1]
 if(key==='execute'&&kind==='ppm'){
  const next=checklistFocus(steps,results).next
  if(next)title=l(next.title_ar||next.title_en,next.title_en||next.title_ar)||title
 }
 return {key,title,responsible,terminal:false}
}
// Only persisted results move the active step. Failed results remain visible for follow-up.
export function checklistFocus(steps=[],results=[]){
 const saved=new Map(results.filter(r=>r.result).map(r=>[r.step_id,r]))
 return {next:steps.find(s=>!saved.has(s.id))||null,completed:steps.filter(s=>saved.has(s.id)),failed:steps.filter(s=>saved.get(s.id)?.result==='fail')}
}

export function executionFocus(steps=[],results=[]){
 const saved=new Set(results.map(r=>Number(r.step_seq)))
 return {next:steps.find(s=>!saved.has(Number(s.seq)))||null,completed:steps.filter(s=>saved.has(Number(s.seq))),failed:steps.filter(s=>results.some(r=>Number(r.step_seq)===Number(s.seq)&&r.pass_fail==='fail'))}
}
