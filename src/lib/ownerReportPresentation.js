// Report labels use the document language, including archived and printed copies.
const statuses={draft:['مسودة','Draft'],assigned:['مسند','Assigned'],accepted:['مقبول','Accepted'],in_progress:['قيد التنفيذ','In progress'],on_hold:['متوقف','On hold'],completed:['منجز فنياً','Technically completed'],approved:['معتمد','Approved'],closed:['مغلق','Closed'],cancelled:['ملغى','Cancelled'],scheduled:['مجدول','Scheduled'],in_service:['في الخدمة','In service'],out_of_service:['خارج الخدمة','Out of service'],unknown:['غير مسجل','Not recorded'],P1:['حرجة','Critical'],P2:['عالية','High'],P3:['متوسطة','Medium'],P4:['منخفضة','Low']}
export function ownerReportStatus(value,lang='en'){
 if(value==null||value==='')return '—'
 return statuses[value]?.[lang==='ar'?0:1]||String(value).replaceAll('_',' ')
}
