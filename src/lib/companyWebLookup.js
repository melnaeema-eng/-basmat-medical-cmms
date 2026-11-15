const labels={
 WEB_SEARCH_NO_MATCH:['لم يظهر موقع مطابق بوضوح. أدخل رابط الموقع الرسمي لاستيراد بياناته، أو افتح بحث الإنترنت أدناه.','No clear website match. Enter the official website to import its data, or open the web search below.'],
 WEB_SEARCH_UNAVAILABLE:['محرك البحث غير متاح حاليًا. أدخل رابط الموقع الرسمي لاستيراد بياناته مباشرة.','Web search is unavailable. Enter the official website to import its data directly.'],
 INVALID_WEBSITE:['أدخل رابط موقع عام صالح للشركة.','Enter a valid public company website.'],
 WEBSITE_UNAVAILABLE:['تعذّر قراءة الموقع. تأكد من الرابط أو أدخل البيانات يدويًا.','The website could not be read. Check the URL or enter the data manually.'],
 WEBSITE_NOT_HTML:['الرابط ليس صفحة موقع؛ أدخل رابط الصفحة الرئيسية للشركة.','This URL is not a web page. Enter the company homepage.'],
 WEBSITE_TOO_LARGE:['الصفحة كبيرة جدًا. جرّب رابط صفحة التواصل في موقع الشركة.','The page is too large. Try the company contact page.'],
 INVALID_INPUT:['اكتب اسم الشركة ورابطًا صحيحًا عند توفره.','Enter the company name and a valid website if available.'],
 UNAUTHENTICATED:['انتهت الجلسة. سجّل الدخول مرة أخرى.','Your session expired. Sign in again.'],
 LOOKUP_QUOTA_EXHAUSTED:['خدمة الذكاء الاصطناعي بلا رصيد. استخدم استيراد الموقع الرسمي المجاني.','AI credits are exhausted. Use free official-website import.']
}
export async function requestCompanyWebLookup(invoke,name,website='',lang='ar'){
 const {data,error}=await invoke({name:name.trim(),website:website.trim()})
 if(!error&&data?.ok!==false)return data||{}
 let body=data
 if(error?.context?.json)try{body=await error.context.clone().json()}catch{}
 let code=body?.code
 if(!code&&body?.stage==='openai'&&/insufficient_quota|credit_balance_exhausted/.test(String(body.error)))code='LOOKUP_QUOTA_EXHAUSTED'
 if(!code&&(error?.context?.status===401||body?.code==='Invalid JWT'))code='UNAUTHENTICATED'
 const message=(labels[code]||labels.WEB_SEARCH_UNAVAILABLE)[lang==='ar'?0:1]
 const e=new Error(message);e.code=code||'WEB_SEARCH_UNAVAILABLE';throw e
}
export function companyWebDraft(blank,data,name){
 // A new lookup must never inherit the ID or legal numbers of a previously selected company.
 const ar=/[\u0600-\u06ff]/.test(name)
 const text=v=>typeof v==='string'?v:''
 return {...blank,id:null,name_ar:text(data.name_ar)||(ar?name:''),name_en:text(data.name_en)||(!ar?name:''),website:text(data.website),email:text(data.email),phone:text(data.phone),city:text(data.city),address:text(data.address),logo_url:text(data.logo_url),logo_source:data.logo_url?'public_website':'',specialties:[],manufacturers:[],source_type:'public_website',source_reference:text(data.source_reference),confidence:null}
}
export function companySourceLinks(reference){
 return String(reference||'').split(/\n/).map(s=>s.trim()).filter(s=>{try{return ['http:','https:'].includes(new URL(s).protocol)}catch{return false}})
}
