import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSearchFeed,extractCompany,publicHtml,websiteUrl,isPublicIP,lookupWebsite} from '../supabase/functions/medical-company-smart-lookup/webLookup.js'
import {requestCompanyWebLookup,companyWebDraft,companySourceLinks} from '../src/lib/companyWebLookup.js'
const html=`<meta property="og:site_name" content="Built Industrial"><script type="application/ld+json">{"@type":"Organization","name":"Built Industrial","email":"info@built.com.sa","telephone":"920012209","address":{"addressLocality":"Riyadh","streetAddress":"Main Road"},"logo":"/logo.png"}</script><a href="/contact">Contact</a>`
test('extracts published fields and sources, leaving unsupported manufacturers empty',()=>{
 const {data}=extractCompany(html,'https://built.com.sa/','بلت')
 assert.equal(data.name_ar,'بلت');assert.equal(data.name_en,'Built Industrial')
 assert.equal(data.email,'info@built.com.sa');assert.equal(data.phone,'920012209')
 assert.equal(data.logo_url,'https://built.com.sa/logo.png');assert.deepEqual(data.manufacturers,[])
 assert.equal(data.source_reference,'https://built.com.sa/');assert.equal(data.requires_review,true)
})
test('supports RSS CDATA and filters unrelated companies and directories',()=>{
 const rss='<rss><channel><item><title><![CDATA[Built Industrial]]></title><description>Built Industrial company</description><link><![CDATA[https://built.com.sa/]]></link></item><item><title>Built protein bars</title><link>https://built.com</link></item><item><title>Built Industrial</title><link>https://linkedin.com/company/built</link></item></channel></rss>'
 assert.deepEqual(parseSearchFeed(rss,'Built Industrial').map(x=>x.domain),['built.com.sa'])
 assert.deepEqual(parseSearchFeed(rss,'شركة أخرى'),[])
})
test('rejects private addresses, credentials, ports and unsafe schemes',()=>{
 for(const u of ['https://127.0.0.1','https://[::1]','https://localhost','https://user:pass@example.com','https://example.com:8443','file:///etc/passwd','https://x.supabase.co'])assert.throws(()=>websiteUrl(u))
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(isPublicIP(ip),false,ip)
 assert.equal(isPublicIP('93.184.216.34'),true)
})
test('validates DNS and each redirect without fetching internal services',async()=>{
 let fetched=0
 await assert.rejects(publicHtml('https://example.com',{resolve:async()=>['127.0.0.1'],fetcher:async()=>{fetched++}}),{code:'INVALID_WEBSITE'})
 assert.equal(fetched,0)
 await assert.rejects(publicHtml('https://example.com',{resolve:async()=>['93.184.216.34'],fetcher:async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest'}})}),{code:'INVALID_WEBSITE'})
})
test('imports contacts from the same website and retains both source URLs',async()=>{
 const r=await lookupWebsite('https://built.com.sa/','بلت',{resolve:async()=>['93.184.216.34'],fetcher:async url=>new Response(String(url).endsWith('/contact')?'<a href="tel:920012209">Phone</a><a href="mailto:info@built.com.sa">Email</a>':'<meta property="og:site_name" content="Built Industrial"><a href="/contact">Contact</a>',{headers:{'content-type':'text/html'}})})
 assert.equal(r.phone,'920012209');assert.equal(r.email,'info@built.com.sa');assert.equal(r.sources.length,2)
})
test('turns service failures into readable messages instead of generic non-2xx',async()=>{
 const context=new Response(JSON.stringify({ok:false,code:'WEB_SEARCH_NO_MATCH'}),{status:404})
 await assert.rejects(requestCompanyWebLookup(async()=>({error:{context}}),'بلت','','ar'),/رابط الموقع الرسمي/)
 const old=new Response(JSON.stringify({ok:false,stage:'openai',error:'insufficient_quota credit_balance_exhausted'}),{status:500})
 await assert.rejects(requestCompanyWebLookup(async()=>({error:{context:old}}),'Built','','en'),/AI credits are exhausted/)
})
test('new web draft cannot retain a prior record ID or invent legal identifiers',()=>{
 const r=companyWebDraft({id:'previous-company',registration_no:'',vat_no:''},{name_en:'Built Industrial',id:'injected-id',registration_no:'invented',manufacturers:['unverified']},'بلت')
 assert.equal(r.id,null);assert.equal(r.registration_no,'');assert.equal(r.vat_no,'');assert.deepEqual(r.manufacturers,[])
 assert.equal(r.source_type,'public_website')
 assert.deepEqual(companySourceLinks('https://built.com.sa/\njavascript:alert(1)\nnot a URL'),['https://built.com.sa/'])
})

test('uses company title after a generic contact-page title when site metadata is absent',()=>{
 assert.equal(extractCompany('<title>contact us &#8211; Built industrial</title>','https://built.com.sa/ar/contact-us/','بلت').data.name_en,'Built industrial')
 assert.equal(extractCompany('<title>Contact us</title>','https://example.com','بلت').data.name_en,null)
})
