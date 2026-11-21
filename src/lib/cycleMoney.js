// Keep database decimal strings exact, including contract values above Number.MAX_SAFE_INTEGER.
export function formatCycleMoney(value,locale='en'){
 const text=String(value??'0')
 if(!/^-?\d+(\.\d{1,2})?$/.test(text))return '—'
 const [whole,fraction='']=text.split('.')
 const decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==='decimal')?.value||'.'
 return BigInt(whole).toLocaleString(locale)+decimal+Number(fraction.padEnd(2,'0')).toLocaleString(locale,{useGrouping:false,minimumIntegerDigits:2})
}
