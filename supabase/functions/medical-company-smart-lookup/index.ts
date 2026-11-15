import {LookupError,parseSearchFeed,lookupWebsite} from './webLookup.js'
const headers={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers})
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return json({ok:true})
 if(req.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405)
 try{
  if(Number(req.headers.get('content-length')||0)>4000)return json({ok:false,code:'INVALID_INPUT'},400)
  const body=await req.json(),name=String(body?.name||'').trim(),website=String(body?.website||'').trim()
  if(!name||name.length>200||website.length>1000)return json({ok:false,code:'INVALID_INPUT'},400)
  // Public website lookup only: no AI model, external account or paid search key.
  if(website)return json({ok:true,...await lookupWebsite(website,name)})
  let response
  try{const u=new URL('https://www.bing.com/search');u.searchParams.set('q',name+' official website');u.searchParams.set('format','rss');response=await fetch(u,{signal:AbortSignal.timeout(8000),headers:{'accept':'application/rss+xml,application/xml','user-agent':'BasmatCompanyLookup/1.0'}})}catch{throw new LookupError('WEB_SEARCH_UNAVAILABLE',503)}
  if(!response.ok)throw new LookupError('WEB_SEARCH_UNAVAILABLE',503)
  const xml=(await response.text()).slice(0,250000),candidates=parseSearchFeed(xml,name)
  if(!candidates.length)throw new LookupError('WEB_SEARCH_NO_MATCH',404)
  return json({ok:true,lookup_stage:'website_selection',candidates})
 }catch(e){return json({ok:false,code:e instanceof LookupError?e.code:'WEB_SEARCH_UNAVAILABLE'},e instanceof LookupError?e.status:503)}
})
