export function recurrenceDates(start,frequency,interval,count=12){
 const date=new Date(start+'T12:00:00Z'),out=[]
 for(let n=0;n<count;n++){
  const d=new Date(date)
  const multiplier={monthly:1,quarterly:3,semiannual:6,annual:12}[frequency]
  if(multiplier){
   const targetMonth=date.getUTCMonth()+multiplier*interval*n
   d.setUTCDate(1);d.setUTCMonth(targetMonth)
   const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()
   d.setUTCDate(Math.min(date.getUTCDate(),last))
  }else d.setUTCDate(date.getUTCDate()+(frequency==='weekly'?7:1)*interval*n)
  out.push(d.toISOString().slice(0,10))
 }
 return out
}
