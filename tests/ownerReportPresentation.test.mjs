import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {transformWithOxc} from 'vite'
import {reportDict} from '../src/lib/reportLanguage.js'
import {ownerReportStatus} from '../src/lib/ownerReportPresentation.js'

// Render the production report components without the application shell or its locale provider.
const source=await readFile(new URL('../src/pages/OwnerReports.jsx',import.meta.url),'utf8')
const dependency=path=>new URL(path,import.meta.url).href
const prelude=`import React from ${JSON.stringify(dependency('../node_modules/react/index.js'))};
import {displayReportValue} from ${JSON.stringify(dependency('../src/lib/reportDisplay.js'))};
import {ownerReportStatus} from ${JSON.stringify(dependency('../src/lib/ownerReportPresentation.js'))};
const safe=v=>v==null||v===''?'—':v;
const pctTone=v=>v>=95?'#067647':v>=85?'#b54708':'#b42318';
`
const {code}=await transformWithOxc(prelude+source.slice(source.indexOf('function reportTitle(')),'report.jsx',{jsx:{runtime:'classic'}})
const {ReportDocument}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const report={metrics:{totalWO:1,totalPPM:0},woStatus:[['in_progress',1]],wo:[{work_order_number:'TEST-1',asset_label:'TEST-ASSET',status:'in_progress',priority:'P2',due_date:'2026-11-12'}],ppm:[]}
for(const ar of [true,false])test(`Report tables and charts render in ${ar?'Arabic':'English'} independently of UI context`,()=>{
 const html=renderToStaticMarkup(createElement(ReportDocument,{report,brand:{},reportType:'monthly',start:'2026-11-01',end:'2026-11-30',ar}))
 assert.ok(html.includes(`lang="${ar?'ar':'en'}"`))
 assert.ok(html.includes(`dir="${ar?'rtl':'ltr'}"`))
 assert.ok(html.includes(ar?'قيد التنفيذ':'In progress'))
 assert.ok(html.includes(ar?'عالية':'High'))
 assert.ok(!html.includes(ar?'In progress':'قيد التنفيذ'))
 assert.ok(html.includes(ar?reportDict.ar.asset_name:reportDict.en.asset_name)||html.includes(ar?'الأصل':'Medical device'))
})
test('Report terminology and export names identify the correct application',()=>{
 assert.equal(reportDict.en.asset_name,'Medical device')
 assert.notEqual(reportDict.ar.reportExportName,reportDict.en.reportExportName)
 assert.equal(ownerReportStatus('closed','ar'),'مغلق')
 assert.equal(ownerReportStatus('closed','en'),'Closed')
})
