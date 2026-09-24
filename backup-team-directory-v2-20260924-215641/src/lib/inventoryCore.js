export const quantity=value=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:3})
export const available=stock=>Number(stock.quantity)-Number(stock.reserved)
export function stockTotals(rows,partId){
 return rows.filter(x=>x.part_id===partId).reduce((a,x)=>({
  quantity:a.quantity+Number(x.quantity),reserved:a.reserved+Number(x.reserved)
 }),{quantity:0,reserved:0})
}
