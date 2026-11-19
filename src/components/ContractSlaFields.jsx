const priorities=['P1','P2','P3','P4']

export default function ContractSlaFields({value={},onChange,lang,disabled}){
 const L=(ar,en)=>lang==='ar'?ar:en
 return <fieldset className="span-2" disabled={disabled}>
  <legend>{L('اتفاقية مستوى الخدمة (SLA)','Service level agreement (SLA)')}</legend>
  <small>{L('المدد بالدقائق المتصلة من تسجيل البلاغ أو أمر العمل. الاستجابة تُسجّل عند قبول الفني. اترك صف الأولوية فارغًا إذا لم يحدد العقد مدده.','Use elapsed minutes from the request or work order creation. Technician acceptance counts as response. Leave a priority blank if the contract has no targets for it.')}</small>
  <div className="form-grid">{priorities.map(priority=>['response','completion'].map(metric=><label key={priority+metric}>
   {priority} · {metric==='response'?L('دقائق الاستجابة','Response minutes'):L('دقائق الإنجاز','Completion minutes')}
   <input type="number" min="1" max="999999" step="1" value={value[priority]?.[metric]??''}
    onChange={e=>onChange({...value,[priority]:{...value[priority],[metric]:e.target.value}})}/>
  </label>))}</div>
  <label><input type="checkbox" checked={value.ppm===true}
   onChange={e=>onChange({...value,ppm:e.target.checked})}/> {L('قياس الوقائية حتى نهاية اليوم المجدول بتوقيت الرياض','Measure preventive maintenance through the end of its scheduled day in Riyadh')}</label>
 </fieldset>
}
