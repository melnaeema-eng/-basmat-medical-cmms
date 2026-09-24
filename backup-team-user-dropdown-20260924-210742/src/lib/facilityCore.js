export const levels=[
 {key:'buildings',parent:'site_id',previous:'sites'},
 {key:'floors',parent:'building_id',previous:'buildings'},
 {key:'zones',parent:'floor_id',previous:'floors'},
 {key:'rooms',parent:'zone_id',previous:'zones'}
]
export const code=prefix=>`${prefix}-${crypto.randomUUID().slice(0,8).toUpperCase()}`
export const display=(row,lang)=>row?(lang==='ar'?row.name_ar||row.name_en||row.name:row.name_en||row.name_ar||row.name)||row.code||'—':'—'
export const active=rows=>(rows||[]).filter(r=>r.status!=='archived')
export const date=value=>value?new Date(value).toISOString().slice(0,10):''
export const locationLabel=(asset,data,lang)=>['sites','buildings','floors','zones','rooms'].map((key,i)=>{
 const id=i===0?asset.site_id:asset[levels[i-1].key.slice(0,-1)+'_id']
 return display(data[key]?.find(r=>r.id===id),lang)
}).filter(x=>x!=='—').join(' / ')
