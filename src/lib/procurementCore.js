export const amount=(value,decimals=2)=>Number(value||0).toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})
export const total=lines=>lines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unit_price),0)
export function receiptRemaining(line){return Number(line.quantity)-Number(line.received_qty)}
