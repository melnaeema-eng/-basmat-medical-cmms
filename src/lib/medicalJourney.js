// A journey belongs to one source record. Never infer owner acceptance from QA.
export function latestOwnerApproval(approvals, entityType, entityId){
  return approvals.filter(a=>a.entity_type===entityType&&a.entity_id===entityId&&a.reviewer_type==='owner')
    .sort((a,b)=>Number(b.round||0)-Number(a.round||0)||String(b.requested_at||'').localeCompare(String(a.requested_at||'')))[0]||null
}

export function journeyState(record, owner, documents=[]){
  const cancelled=record.status==='cancelled'
  const reviewed=['approved','closed'].includes(record.status)
  const accepted=reviewed&&owner?.status==='approved'
  const certificate=accepted?documents.find(d=>d.document_type==='approval_certificate'&&d.entity_type==='approval'&&d.entity_id===owner.id&&d.status==='final'):null
  const submitted=reviewed||record.status==='completed'
  const assigned=submitted||['assigned','accepted','in_progress','on_hold'].includes(record.status)
  const steps=[true,assigned,submitted,reviewed,!!accepted,!!certificate,!!certificate&&record.status==='closed']
  return {steps,cancelled,certificate,next:cancelled?-1:steps.findIndex(x=>!x)}
}

// Resume safely if certificate creation succeeded but closing was rejected.
export async function finishMedicalJourney({record,owner,read,generate,close}){
  if(!['approved','closed'].includes(record.status)||owner?.status!=='approved')throw Error('Owner acceptance is required before certification.')
  const {documents,eligible}=await read()
  const exists=documents.some(d=>d.document_type==='approval_certificate'&&d.entity_type==='approval'&&d.entity_id===owner.id&&d.status==='final')
  if(!exists){
    if(!eligible.some(e=>e.document_type==='approval_certificate'&&e.entity_type==='approval'&&e.entity_id===owner.id))throw Error('Certificate generation permission is required.')
    await generate()
  }
  if(record.status!=='closed')await close()
}


// Internal QA never skips the separate owner handover stage.
export function approvalNextAction(record,owner,documents=[],lang='ar'){
 const l=(a,e)=>lang==='ar'?a:e,state=journeyState(record,owner,documents)
 if(state.cancelled)return {key:'cancelled',title:l('العمل ملغى','Work cancelled'),terminal:true}
 if(state.next===-1)return {key:'finished',title:l('اكتملت دورة الإنجاز','Completion journey finished'),terminal:true}
 if(!state.steps[3])return null
 if(owner?.status==='pending')return {key:'owner_review',title:l('مراجعة الإنجاز وقبوله من المالك','Owner review and acceptance'),responsible:l('ممثل المالك المخوّل','Authorized owner representative')}
 if(!state.steps[4])return {key:'request_owner',title:owner?.status==='rejected'?l('استكمال ملاحظات المالك وإعادة الإرسال','Address owner comments and resubmit'):l('تجهيز التقرير وإرساله لقبول المالك','Prepare report and submit for owner acceptance'),responsible:l('مشرف الصيانة المخوّل بالإرسال','Maintenance supervisor authorized to submit')}
 if(!state.steps[5])return {key:'certificate',title:l('إصدار شهادة الإنجاز','Issue the completion certificate'),responsible:l('المخوّل بإصدار شهادة الإنجاز','Authorized certificate issuer')}
 return {key:'close',title:l('إغلاق أمر العمل بعد قبول المالك وإصدار الشهادة','Close work after owner acceptance and certification'),responsible:l('مشرف الصيانة المخوّل بالإغلاق','Maintenance supervisor authorized to close')}
}
export function canDecideOwnerApproval(owner,userId,authorized){
 return authorized===true&&owner?.status==='pending'&&!!userId&&owner.requested_by!==userId
}
export function canFinishApprovedJourney(record,owner,documents,eligible,canClose){
 if(!canClose||!['approved','closed'].includes(record.status)||owner?.status!=='approved')return false
 const certificate=journeyState(record,owner,documents).certificate
 return !!certificate||(eligible||[]).some(d=>d.document_type==='approval_certificate'&&d.entity_type==='approval'&&d.entity_id===owner.id)
}
export function medicalWorkflowError(error,lang='ar'){
 const message=error?.message||String(error)
 if(message.includes('Closure blocked: owner acceptance required'))return lang==='ar'?'يجب إرسال الإنجاز للمالك والحصول على قبوله قبل الإغلاق.':'Submit the completed work to the owner and obtain acceptance before closing.'
 if(message.includes('Requester cannot decide own approval'))return lang==='ar'?'يجب أن يراجع طلب القبول ممثل مالك آخر؛ لا يمكن اعتماد طلبك بنفسك.':'Another authorized owner representative must review this request; you cannot approve your own request.'
 return message
}
