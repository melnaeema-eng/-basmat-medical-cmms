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
