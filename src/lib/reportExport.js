import {ownerLogoSource} from './ownerLogo.js'
// Dependency-free XLSX writer: ZIP store method, inline strings, no formula execution.
const encoder=new TextEncoder()
const xml=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
function crc32(bytes){
 let crc=0xffffffff
 for(const byte of bytes){
  crc^=byte
  for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)
 }
 return (crc^0xffffffff)>>>0
}
function zip(files){
 const chunks=[],directory=[];let offset=0
 const u16=n=>[n&255,(n>>>8)&255]
 const u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]
 for(const file of files){
  const nameBytes=encoder.encode(file.name),dataBytes=typeof file.data==='string'?encoder.encode(file.data):file.data
  const crc=crc32(dataBytes),size=dataBytes.length
  const local=new Uint8Array([
   0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(size),...u32(size),...u16(nameBytes.length),0,0,
   ...nameBytes,...dataBytes
  ])
  chunks.push(local)
  const central=new Uint8Array([
   0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,...u32(crc),...u32(size),...u32(size),...u16(nameBytes.length),0,0,0,0,0,0,0,0,...u32(offset),
   ...nameBytes
  ])
  directory.push(central);offset+=local.length
 }
 const dirSize=directory.reduce((s,b)=>s+b.length,0)
 const end=new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...u16(directory.length),...u16(directory.length),...u32(dirSize),...u32(offset),0,0])
 return new Blob([...chunks,...directory,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
function cellRef(col,row){
 let s='',n=col+1
 while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}
 return s+row
}
function sheetXml(columns,labels,rows){
 let rowIndex=1,body=''
 body+=`<row r="${rowIndex}">`+columns.map((c,i)=>`<c r="${cellRef(i,rowIndex)}" t="inlineStr"><is><t>${xml(labels[c]||c)}</t></is></c>`).join('')+'</row>'
 rowIndex++
 for(const row of rows){
  body+=`<row r="${rowIndex}">`
  columns.forEach((c,i)=>{
   const v=row?.[c]
   if(v===null||v===undefined){body+=`<c r="${cellRef(i,rowIndex)}" t="inlineStr"><is><t></t></is></c>`;return}
   if(typeof v==='number'&&Number.isFinite(v)){body+=`<c r="${cellRef(i,rowIndex)}"><v>${v}</v></c>`;return}
   body+=`<c r="${cellRef(i,rowIndex)}" t="inlineStr"><is><t>${xml(typeof v==='object'?JSON.stringify(v):String(v))}</t></is></c>`
  })
  body+='</row>';rowIndex++
 }
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}
function fileName(title,ext){
 return `${title||'report'}`.trim().replace(/[^a-z0-9\u0600-\u06FF._-]+/gi,'_').replace(/_+/g,'_')+'.'+ext
}
function download(blob,name){
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
export function exportXlsx(report,columns,labels,title){
 const contextRows=[
  ['BAMM','Basmat Alnawabigh Medical Equipment Maintenance Management System'],
  ['Organization',report.context?.organization_name||''],
  ['Owner',report.context?.client_name||''],
  ['Site',report.context?.site_name||''],
  ['From',report.filters?.start_date||''],
  ['To',report.filters?.end_date||''],
  ['Generated at',report.generated_at||'']
 ]
 const metadataColumns=['field','value']
 const metadataLabels={field:'Field',value:'Value'}
 const metadataObjects=contextRows.map(([field,value])=>({field,value}))
 const files=[
  {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`},
  {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
  {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>BAMM</dc:creator><cp:lastModifiedBy>BAMM</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`},
  {name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>BAMM</Application></Properties>`},
  {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/><sheet name="Context" sheetId="2" r:id="rId2"/></sheets></workbook>`},
  {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`},
  {name:'xl/worksheets/sheet1.xml',data:sheetXml(columns,labels,report.rows||[])},
  {name:'xl/worksheets/sheet2.xml',data:sheetXml(metadataColumns,metadataLabels,metadataObjects)},
 ]
 download(zip(files),fileName(title||'BAMM_Report','xlsx'))
}

const reportLogo=()=>new URL('/medical-report-logo.png',window.location.origin).href

function human(v){
 if(v===null||v===undefined||v==='') return '—'
 if(typeof v==='object') return JSON.stringify(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

export function printReport(report,columns,labels,title,lang='en',targetWindow=null){
 const win=targetWindow||window.open('','_blank')
 if(!win)throw Error('Allow pop-ups to print the report')
 const doc=win.document
 const dir=lang==='ar'?'rtl':'ltr'
 doc.open()
 doc.write(`<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><link rel="stylesheet" href="${window.location.origin}/cairo.css"><meta charset="utf-8"/><title>BAMM - ${title}</title><style>
  body{font-family:Arial,sans-serif;margin:0;background:#f6f8fb;color:#172033}
  .page{padding:22px 24px 34px}
  .toolbar{display:flex;justify-content:$space-between;align-items:center;gap:12px;margin-bottom:14px}
  .print-btn{background:#173766;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}
  .sheet{background:#fff;border:1px solid #d9e1ea;border-radius:18px;padding:24px;box-shadow:0 6px 24px rgba(15,23,42,.06)}
  .brand{display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:3px solid #f1c644;padding-bottom:14px;margin-bottom:18px}
  .brand-left{display:flex;align-items:center;gap:14px}
  .brand img{width:72px;height:72px;border-radius:14px;object-fit:cover;box-shadow:0 4px 14px rgba(11,31,59,.18)}
  .brand-title strong{display:block;font-size:22px;line-height:1;color:#0b1f3b}
  .brand-title span{display:block;margin-top:6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#d7a81e;font-weight:700}
  .report-title{text-align:right}
  html[dir="rtl"] .report-title{text-align:left}
  html[dir="ltr"] .report-title{text-align:right}
  .report-title h1{margin:0;font-size:28px;color:#0b1f3b}
  .report-title p{margin:6px 0 0;color:#5d6b82;font-size:12px}
  .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.meta-six{}
  .card{border:1px solid #e6ebf2;border-radius:14px;padding:12px 14px;background:#fafbfd}
  .card label{display:block;font-size:11px;color:#6a778b;margin-bottom:6px}
  .card strong{font-size:14px;color:#172033;word-break:break-word}
  .definition{margin:4px 0 16px;color:#536174;font-size:13px}
  .table-wrap{overflow:hidden;border:1px solid #dfe6ef;border-radius:14px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{padding:10px 9px;border-bottom:1px solid #edf1f6;text-align:start;vertical-align:top}
  thead th{background:#173766;color:#fff;font-weight:700}
  tbody tr:nth-child(even){background:#fafbfd}
  .footer{margin-top:16px;display:flex;justify-content:space-between;align-items:center;color:#6b7280;font-size:11px}
  @media print{body{background:#fff} .page{padding:0} .toolbar{display:none} .sheet{box-shadow:none;border:0;border-radius:0;padding:0} @page{size:A4 landscape;margin:10mm}}
 /* BASMAT ALNAWABIGH PRINT SIGNATURE */
body::before{content:"BASMAT ALNAWABIGH";position:fixed;inset:42% 0 auto 0;text-align:center;font-size:52pt;font-weight:800;letter-spacing:4px;color:rgba(11,43,75,.055);transform:rotate(-28deg);z-index:0;pointer-events:none;white-space:nowrap}
body::after{content:"BAMM | Basmat Alnawabigh";position:fixed;left:12mm;right:12mm;bottom:4mm;text-align:center;font-size:8pt;font-weight:700;color:#536274;border-top:1px solid #cfd8e3;padding-top:2mm;background:#fff;z-index:9998;pointer-events:none}</style></head><body>
 <div class="page">
   <div class="toolbar"><button class="print-btn" onclick="window.print()">${lang==='ar'?'طباعة التقرير':'Print report'}</button><div></div></div>
   <div class="sheet">
     <div class="brand">
       <div class="brand-left">
         <img src="${reportLogo()}" alt="BAMM"/>
         <div class="brand-title">
           <strong>BAMM</strong>
           <span>Basmat Alnawabigh Medical Equipment Maintenance Management System</span>
         </div>
       </div>
       ${report.owner_identity?`<div style="text-align:center;max-width:180px">${ownerLogoSource(report.owner_identity.logo_url)?`<img src="${human(ownerLogoSource(report.owner_identity.logo_url))}" alt="Owner logo" style="width:90px;height:65px;object-fit:contain;border-radius:0;box-shadow:none"/>`:''}<div>${human(report.owner_identity.name)}</div></div>`:''}
       <div class="report-title">
         <h1>${title}</h1>
         <p>${lang==='ar'?'تقرير تشغيلي احترافي':'Professional operational report'}</p>
       </div>
     </div>
     <div class="meta meta-six">
       <div class="card"><label>${lang==='ar'?'المنظمة':'Organization'}</label><strong>${human(report.context?.organization_name)}</strong></div>
       <div class="card"><label>${lang==='ar'?'الجهة المالكة':'Owner'}</label><strong>${human(report.context?.client_name)}</strong></div>
       <div class="card"><label>${lang==='ar'?'الموقع':'Site'}</label><strong>${human(report.context?.site_name)}</strong></div>
       <div class="card"><label>${lang==='ar'?'الفترة':'Period'}</label><strong>${human(report.filters?.start_date)} — ${human(report.filters?.end_date)}</strong></div>
       <div class="card"><label>${lang==='ar'?'تاريخ الإصدار':'Generated at'}</label><strong>${human(report.generated_at)}</strong></div>
       <div class="card"><label>${lang==='ar'?'عدد السجلات':'Records'}</label><strong>${(report.rows||[]).length}</strong></div>
     </div>
     <div class="definition">${lang==='ar'?'يعرض هذا التقرير البيانات الحالية حسب الفلاتر المختارة وقت الطباعة.':'This report shows the current data based on the selected filters at print time.'}</div>
     ${report.reference_lookup_unavailable?`<p>${lang==='ar'?'تعذر جلب بعض الأسماء؛ تظهر شرطة مكان الاسم غير المتاح.':'Some names could not be retrieved; unavailable names are shown as a dash.'}</p>`:''}
     <div class="table-wrap">
      <table><thead><tr>${columns.map(col=>`<th>${human(labels[col]||col)}</th>`).join('')}</tr></thead>
      <tbody>
       ${(report.rows||[]).length
          ? (report.rows||[]).map(row=>`<tr>${columns.map(col=>`<td>${human(row?.[col])}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}" style="text-align:center;padding:24px">${lang==='ar'?'لا توجد بيانات للفلاتر المحددة':'No data for the selected filters'}</td></tr>`}
      </tbody></table>
     </div>
     <div class="footer">
       <span>BAMM</span>
       <span>${lang==='ar'?'تم إنشاء التقرير بواسطة النظام':'System-generated report'}</span>
     </div>
   </div>
 </div></body></html>`)
 doc.close()
 win.focus()
}

export function printCurrentReport(report,columns,labels,title,lang='en'){
 const rows=report?.rows||[]
 const view={...report,rows}
 return printReport(view,columns,labels,title,lang)
}
