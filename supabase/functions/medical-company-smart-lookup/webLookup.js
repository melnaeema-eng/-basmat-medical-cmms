export class LookupError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status}}
export function decode(value=''){
 return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):''}).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[m])
}
const clean=v=>decode(String(v||'')).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
export function normalize(v){return clean(v).toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0300-\u036f]/g,'').replace(/[أإآ]/g,'ا').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function attrs(tag){const a={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))a[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return a}
export function websiteUrl(value){
 let u;try{u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value)}catch{throw new LookupError('INVALID_WEBSITE')}
 const h=u.hostname.toLowerCase()
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!h.includes('.')||!/[a-z]/i.test(h)||/[:\[\]]/.test(h)||/^\d+(?:\.\d+)*$/.test(h)||/(?:^|\.)(?:localhost|local|internal|test|invalid|supabase\.co)$/.test(h))throw new LookupError('INVALID_WEBSITE')
 u.protocol='https:';u.hash='';return u
}
export function isPublicIP(ip){
 if(ip.includes(':'))return !/^2001:db8:/i.test(ip)&&/^[23][0-9a-f]{0,3}:/i.test(ip)&&!ip.includes('.')
 const p=ip.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return false
 const [a,b]=p
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0)
}
export async function publicHtml(value,{fetcher=fetch,resolve=async(h,t)=>Deno.resolveDns(h,t)}={}){
 let u=websiteUrl(value)
 for(let n=0;n<4;n++){
  const checks=await Promise.allSettled([resolve(u.hostname,'A'),resolve(u.hostname,'AAAA')]);const ips=checks.flatMap(r=>r.status==='fulfilled'?r.value:[])
  if(!ips.length||ips.some(ip=>!isPublicIP(ip)))throw new LookupError('INVALID_WEBSITE')
  let r;try{r=await fetcher(u.href,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{'accept':'text/html,application/xhtml+xml','user-agent':'BasmatCompanyLookup/1.0'}})}catch{throw new LookupError('WEBSITE_UNAVAILABLE',502)}
  if(r.status>=300&&r.status<400){const location=r.headers.get('location');if(!location)throw new LookupError('WEBSITE_UNAVAILABLE',502);u=websiteUrl(new URL(location,u).href);continue}
  if(!r.ok)throw new LookupError('WEBSITE_UNAVAILABLE',502)
  if(!/text\/html|application\/xhtml\+xml/i.test(r.headers.get('content-type')||''))throw new LookupError('WEBSITE_NOT_HTML',422)
  const reader=r.body.getReader();let size=0;const chunks=[]
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>800000){await reader.cancel();throw new LookupError('WEBSITE_TOO_LARGE',422)}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  return {url:u.href,html:new TextDecoder().decode(bytes)}
 }
 throw new LookupError('WEBSITE_UNAVAILABLE',502)
}
const social=/(^|\.)(linkedin|facebook|instagram|youtube|x|twitter|wikipedia|google|bing|amazon|cambridge|bayt|indeed)\./i
export function parseSearchFeed(xml,name){
 const words=normalize(name).split(' ').filter(x=>x.length>1&&!['شركة','شركه','الشركة','company','co','ltd','the'].includes(x));const seen=new Set(),out=[]
 if(!words.length)return []
 for(const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
  const item=m[1],field=k=>clean(item.match(new RegExp('<'+k+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+k+'>','i'))?.[1]),title=field('title');let u
  try{u=websiteUrl(field('link'))}catch{continue}
  if(social.test(u.hostname)||/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(u.pathname))continue
  const text=normalize(title+' '+field('description'))
  // A multi-word company must match every name word; avoid auto-filling unrelated firms.
  if(!words.every(w=>text.includes(w))||seen.has(u.hostname))continue
  seen.add(u.hostname);out.push({title,url:u.href,domain:u.hostname})
 }
 return out.slice(0,5)
}
function safeLink(value,base){try{const u=new URL(value,base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function extractCompany(html,url,query=''){
 const meta={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]);meta[a.property||a.name]=a.content||''}
 const nodes=[];const collect=n=>{if(Array.isArray(n))return n.forEach(collect);if(n&&typeof n==='object'){nodes.push(n);if(n['@graph'])collect(n['@graph'])}}
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{collect(JSON.parse(m[1]))}catch{}}
 const org=nodes.find(n=>[n['@type']].flat().some(t=>/^(Organization|Corporation|LocalBusiness|MedicalBusiness|ProfessionalService)$/.test(t)))||{}
 const anchors=[...html.matchAll(/<a\b[^>]*>/gi)].map(m=>attrs(m[0]))
 const structuredName=clean(org.legalName||org.name),siteName=clean(meta['og:site_name'])
 const meaningful=v=>v&&!/^(home|contact us|about us|الرئيسية|تواصل معنا|اتصل بنا)$/i.test(v)
 const titleParts=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).split(/\s*[|–—]\s*|\s+-\s+/).filter(meaningful)
 const names=[structuredName,siteName,...titleParts.slice(-1),query].filter(meaningful)
 const emailAnchor=anchors.find(a=>/^mailto:/i.test(a.href||''))?.href?.slice(7).split('?')[0]
 let cf='';const encoded=html.match(/data-cfemail=["']([a-f0-9]+)["']/i)?.[1]
 if(encoded&&encoded.length%2===0){const k=parseInt(encoded.slice(0,2),16);for(let i=2;i<encoded.length;i+=2)cf+=String.fromCharCode(parseInt(encoded.slice(i,i+2),16)^k)}
 const email=String(org.email||emailAnchor||cf||'').replace(/^mailto:/,'').trim();const validEmail=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:null
 const address=org.address||{};const location=typeof address==='string'?address:[address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode,typeof address.addressCountry==='string'?address.addressCountry:address.addressCountry?.name].filter(Boolean).join('، ')
 const img=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>/logo/i.test((a.class||'')+' '+(a.alt||'')+' '+(a.src||'')))
 const logo=typeof org.logo==='string'?org.logo:org.logo?.url||img?.src
 const phone=org.telephone||anchors.find(a=>/^tel:/i.test(a.href||''))?.href?.slice(4)
 const source=new URL(url).href
 const data={name_ar:names.find(n=>/[\u0600-\u06ff]/.test(n))||null,name_en:names.find(n=>/[a-z]/i.test(n)&&!/[\u0600-\u06ff]/.test(n))||null,website:new URL(url).origin,email:validEmail,phone:phone?clean(phone):null,city:typeof address==='object'?clean(address.addressLocality)||null:null,address:clean(location)||null,logo_url:logo?safeLink(logo,url):null,specialties:[],manufacturers:[],source_reference:source,confidence:null,lookup_stage:'public_website',requires_review:true}
 const contacts=anchors.filter(a=>a.href&&/contact|اتصل|تواصل/i.test(a.href)).map(a=>safeLink(a.href,url)).filter(v=>v&&new URL(v).hostname===new URL(url).hostname)
 return {data,contacts:[...new Set(contacts)].slice(0,2)}
}
export async function lookupWebsite(website,name,options){
 const first=await publicHtml(website,options),initial=extractCompany(first.html,first.url,name);let data=initial.data;const sources=[first.url]
 for(const contact of initial.contacts.slice(0,1)){
  if(contact===first.url)continue
  try{const page=await publicHtml(contact,options),extra=extractCompany(page.html,page.url,name).data;sources.push(page.url)
   for(const k of ['email','phone','city','address','logo_url'])if(!data[k]&&extra[k])data[k]=extra[k]
  }catch{}
 }
 return {...data,sources,source_reference:sources.join('\n')}
}
