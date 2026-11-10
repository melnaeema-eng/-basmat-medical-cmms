const riyadhFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'})
const lower=v=>String(v??'').toLowerCase()
export const ownerDone=row=>['closed','completed','approved','complete','done','finished'].includes(lower(row.status))
const cancelled=row=>['cancelled','canceled'].includes(lower(row.status))
export function riyadhDay(value){
 if(!value)return ''
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value)
 const d=new Date(value);if(Number.isNaN(d.getTime()))return ''
 const parts=riyadhFormatter.formatToParts(d)
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-')
}
export function ownerReportModel({workOrders=[],ppmJobs=[],assets=[],sites=[],start,end,reportType='monthly',now=new Date(),lang='en'}){
 const ar=lang==='ar',today=riyadhDay(now),asOf=end<today?end:today
 const period=(row,key)=>{const date=riyadhDay(row[key]);return date&&date>=start&&date<=end}
 const siteMap=new Map(sites.map(s=>[s.id,s])),assetMap=new Map(assets.map(a=>[a.id,a]))
 const label=a=>a?`${a.asset_tag||''} — ${(ar?a.name_ar:a.name_en)||a.name_ar||a.name_en||''}`.replace(/^ — | — $/g,''):'—'
 const enrich=r=>({...r,asset_label:label(assetMap.get(r.asset_id)),serial_number:assetMap.get(r.asset_id)?.serial_number||'—',site_name:siteMap.get(r.site_id)?.name||'—',due_date:r.due_date||r.completion_due_at||null})
 const wo=workOrders.filter(r=>period(r,'created_at')).map(enrich)
 const ppm=ppmJobs.filter(r=>!cancelled(r)&&period(r,'due_date')).map(enrich)
 const backlog=workOrders.filter(r=>!ownerDone(r)&&!cancelled(r)&&riyadhDay(r.created_at)&&riyadhDay(r.created_at)<=end).map(enrich)
 const cutoff=Math.min(new Date(now).getTime(),Date.parse(end+'T23:59:59.999+03:00'))
 const overdue=r=>{const raw=r.completion_due_at||r.due_date;return !ownerDone(r)&&!cancelled(r)&&!!raw&&(String(raw).includes('T')?Date.parse(raw)<cutoff:riyadhDay(raw)<asOf)}
 const overdueWO=backlog.filter(overdue),overduePPM=ppmJobs.filter(r=>!cancelled(r)&&riyadhDay(r.due_date)<=end&&overdue(r)).map(enrich)
 const eligible=ppm.filter(r=>riyadhDay(r.due_date)<=asOf)
 const eligibleWO=wo.filter(r=>!cancelled(r))
 const closed=wo.filter(r=>lower(r.status)==='closed'),completed=wo.filter(ownerDone),completedPPM=ppm.filter(ownerDone)
 const slaMet=wo.filter(r=>lower(r.sla_status)==='met').length,slaBreached=wo.filter(r=>lower(r.sla_status)==='breached').length
 const activeAssets=assets.filter(r=>lower(r.status)!=='archived')
 const warranty=activeAssets.filter(r=>period(r,'warranty_end'))
 const group=(list,key)=>Object.entries(list.reduce((s,r)=>{s[r[key]||'unknown']=(s[r[key]||'unknown']||0)+1;return s},{})).sort((a,b)=>b[1]-a[1])
 const trend=[];let cursor=start
 while(cursor<=end){
  const d=new Date(cursor+'T12:00:00Z');let finish
  if(reportType==='annual'){finish=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12))}
  else {finish=new Date(d);finish.setUTCDate(finish.getUTCDate()+(reportType==='weekly'?0:6))}
  const stop=[finish.toISOString().slice(0,10),end].sort()[0]
  const w=wo.filter(r=>riyadhDay(r.created_at)>=cursor&&riyadhDay(r.created_at)<=stop),p=ppm.filter(r=>r.due_date>=cursor&&r.due_date<=stop)
  trend.push({period:cursor===stop?cursor:`${cursor} — ${stop}`,work_orders:w.length,closed:w.filter(r=>lower(r.status)==='closed').length,ppm_due:p.length,ppm_done:p.filter(ownerDone).length})
  const next=new Date(stop+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);cursor=next.toISOString().slice(0,10)
 }
 const linked=new Set(ppmJobs.map(p=>p.work_order_id).filter(Boolean)),repeats=new Map()
 for(const row of wo.filter(r=>r.asset_id&&!linked.has(r.id)&&!cancelled(r))){const current=repeats.get(row.asset_id)||{asset_label:row.asset_label,serial_number:row.serial_number,site_name:row.site_name,count:0};current.count++;repeats.set(row.asset_id,current)}
 const nextStart=new Date(end+'T12:00:00Z');nextStart.setUTCDate(nextStart.getUTCDate()+1)
 const nextEnd=new Date(nextStart)
 if(reportType==='annual')nextEnd.setUTCFullYear(nextEnd.getUTCFullYear()+1)
 else if(reportType==='monthly')nextEnd.setUTCMonth(nextEnd.getUTCMonth()+1)
 else nextEnd.setUTCDate(nextEnd.getUTCDate()+7)
 const upcoming=ppmJobs.filter(r=>!cancelled(r)&&!ownerDone(r)&&r.due_date>=nextStart.toISOString().slice(0,10)&&r.due_date<nextEnd.toISOString().slice(0,10)).map(enrich).sort((a,b)=>a.due_date.localeCompare(b.due_date))
 const assetRows=activeAssets.map(a=>({...a,asset_label:label(a),site_name:siteMap.get(a.site_id)?.name||'—'}))
 return {wo,ppm,assets:assetRows,assetStatus:group(activeAssets,'operational_status'),sites,backlog,overdueWO,overduePPM,upcoming,warranty:warranty.map(a=>({...a,asset_label:label(a),site_name:siteMap.get(a.site_id)?.name||'—'})),trend,repeatedAssets:[...repeats.values()].filter(r=>r.count>1).sort((a,b)=>b.count-a.count).slice(0,10),held:backlog.filter(r=>lower(r.status)==='on_hold'),awaitingClose:workOrders.filter(r=>ownerDone(r)&&lower(r.status)!=='closed'&&riyadhDay(r.created_at)<=end).map(enrich),
  metrics:{totalWO:wo.length,completedWO:completed.length,closedWO:closed.length,openWO:backlog.length,overdueWO:overdueWO.length,criticalWO:backlog.filter(r=>lower(r.priority)==='p1').length,totalPPM:ppm.length,completedPPM:completedPPM.length,duePPM:eligible.length,executedDuePPM:eligible.filter(ownerDone).length,overduePPM:overduePPM.length,ppmCompliance:eligible.length?Math.round(eligible.filter(ownerDone).length/eligible.length*100):null,cancelledWO:wo.length-eligibleWO.length,closureDenominator:eligibleWO.length,woClosure:eligibleWO.length?Math.round(closed.length/eligibleWO.length*100):null,assets:activeAssets.length,criticalAssets:activeAssets.filter(r=>lower(r.criticality)==='critical').length,warrantyEnding:warranty.length,slaRate:slaMet+slaBreached?Math.round(slaMet/(slaMet+slaBreached)*100):null},woStatus:group(wo,'status'),ppmStatus:group(ppm,'status'),woPriority:group(wo,'priority'),asOf,generatedAt:new Date(now).toISOString()}
}
export function ownerReportPeriod(type,now=new Date()){
 const day=riyadhDay(now),date=new Date(day+'T12:00:00Z'),year=date.getUTCFullYear(),month=date.getUTCMonth()
 if(type==='annual')return [`${year}-01-01`,`${year}-12-31`]
 if(type==='weekly'){
  const weekday=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+1-weekday)
  const start=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6)
  return [start,date.toISOString().slice(0,10)]
 }
 return [`${year}-${String(month+1).padStart(2,'0')}-01`,new Date(Date.UTC(year,month+1,0,12)).toISOString().slice(0,10)]
}
