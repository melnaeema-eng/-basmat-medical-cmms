import { useState } from 'react'
import { CycleField, useCycleLanguage } from './CycleFields'
import { useLanguage } from '../i18n/LanguageContext'
import { formatCycleMoney } from '../lib/cycleMoney'

const blankRate = { item_code: '', description: '', category: 'labor', unit: '', pricing: 'unit', unit_rate: '' }
const blankMeasurement = { certificate_id: '', price_item_id: '', quantity: '', basis: '' }
const categories = {
  labor: ['العمالة', 'Labor'], parts: ['قطع الغيار', 'Spare parts'], cleaning: ['مواد النظافة', 'Cleaning supplies'],
  plant: ['المعدات', 'Equipment'], other: ['أخرى', 'Other'],
}
const pricing = {
  unit: ['حسب الكمية', 'Per unit'], monthly: ['مبلغ شهري ثابت', 'Fixed monthly amount'], included: ['مشمول دون مطالبة إضافية', 'Included without additional charge'],
}

export function StatementMeasurementTable({ rows, currency }) {
  const L = useCycleLanguage()
  const { lang } = useLanguage()
  if (!rows.length) return null
  const headings = [
    ['شهادة الإنجاز / أمر العمل', 'Certificate / work order'], ['بند العقد', 'Contract item'], ['الفئة', 'Category'],
    ['الموقع', 'Location'], ['طريقة التسعير', 'Pricing'], ['الكمية / الوحدة', 'Quantity / unit'], ['سعر الوحدة', 'Unit rate'],
    ['قيمة الأعمال', 'Work value'], ['قيمة المطالبة', 'Claim value'], ['مرجع الحصر', 'Measurement reference'],
  ]
  return <section>
    <h3>{L('حصر الأعمال المنفّذة', 'Measured work')}</h3>
    <div className="table-wrap"><table>
      <thead><tr>{headings.map(([ar, en]) => <th key={en}>{L(ar, en)}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{row.certificate_number}<small>{row.work_order_number}</small></td>
        <td>{row.item_code} · {row.description}</td>
        <td>{L(...categories[row.category])}</td>
        <td>{row.location || '—'}</td>
        <td>{L(...pricing[row.pricing])}</td>
        <td>{row.quantity} {row.unit}</td>
        <td>{Number(row.unit_rate).toLocaleString(lang, { maximumFractionDigits: 4 })} {currency}</td>
        <td>{formatCycleMoney(row.work_value, lang)} {currency}</td>
        <td>{formatCycleMoney(row.claim_value, lang)} {currency}</td>
        <td>{row.basis}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

export function StatementCostEvidence({selectedCost,currency}) {
  const L=useCycleLanguage()
  const {lang}=useLanguage()
  if(!selectedCost)return null
  return <div className="span-2">
          <p>{L('سجل أمر العمل الداخلي','Internal work order record')} · {selectedCost.labor_minutes} {L('دقيقة عمل','labor minutes')}
             {' · '}{L('العمالة','Labor')} {formatCycleMoney(selectedCost.labor_cost,lang)}
             {' · '}{L('المواد','Materials')} {formatCycleMoney(selectedCost.material_cost,lang)}
             {' · '}{L('المصاريف','Expenses')} {formatCycleMoney(selectedCost.additional_cost,lang)} {currency}</p>
          {Number(selectedCost.unpriced_labor_minutes)>0&&<p>{selectedCost.unpriced_labor_minutes} {L('دقيقة دون تكلفة ساعة داخلية','minutes without an internal hourly cost')}</p>}
  </div>
}

export default function StatementMeasurements({ data, busy, run, loadEvidence, importLabor }) {
  const L = useCycleLanguage()
  const { lang } = useLanguage()
  const [rate, setRate] = useState(blankRate)
  const [measurement, setMeasurement] = useState(blankMeasurement)
  const rates = data.rate_items || []
  const rows = data.work_measurements || []
  const certificates = [...data.eligible, ...data.lines.map(line => ({ id: line.certificate_id, number: line.certificate_number, work_order_number: line.work_order_number }))]
  const [evidence, setEvidence] = useState(null)
  const selectedCost=evidence?.[measurement.certificate_id]
  const selectedRate = rates.find(item => item.id === measurement.price_item_id)
  const hourly=selectedRate?.category==='labor' && ['unit','included'].includes(selectedRate.pricing)
    && ['h','hr','hrs','hour','hours','ساعة','ساعات'].includes(selectedRate.unit.trim().toLowerCase())
  const rateCurrency = item => Number(item.unit_rate).toLocaleString(lang, { maximumFractionDigits: 4 }) + ' ' + data.currency
  function selectMeasurement(next) {
    const existing = rows.find(row => row.certificate_id === next.certificate_id && row.price_item_id === next.price_item_id)
    const selected = rates.find(item => item.id === next.price_item_id)
    setMeasurement({ ...next, quantity: existing?.quantity ?? (selected?.pricing === 'monthly' ? '1' : ''), basis: existing?.basis ?? '' })
  }
  return <section className="facility-panel no-print">
    <h2>{L('إعداد حصر الأعمال', 'Prepare work measurements')}</h2>
    {data.zero_value_training && <p>{L('المشروع تدريبي. تُحفظ البنود ضمن العقد وبقيمة صفرية.', 'Training project. Items are recorded as included with zero value.')}</p>}
    <details open={!rates.length || undefined}>
      <summary>{L('إضافة بند من جدول أسعار العقد', 'Add an item from the contract price schedule')}</summary>
      <form onSubmit={async event => {
        event.preventDefault()
        const payload = data.zero_value_training ? { ...rate, pricing: 'included', unit_rate: '0' } : rate
        if (await run('add_rate', payload)) setRate(blankRate)
      }}>
        <fieldset disabled={busy} className="form-grid">
          <CycleField label={L('رقم بند العقد', 'Contract item number')}>
            <input required maxLength={80} value={rate.item_code} onChange={e => setRate({ ...rate, item_code: e.target.value })} />
          </CycleField>
          <CycleField label={L('وصف البند في العقد', 'Contract item description')}>
            <input required minLength={3} maxLength={300} value={rate.description} onChange={e => setRate({ ...rate, description: e.target.value })} />
          </CycleField>
          <CycleField label={L('الفئة', 'Category')}>
            <select value={rate.category} onChange={e => setRate({ ...rate, category: e.target.value })}>
              {Object.entries(categories).map(([value, labels]) => <option key={value} value={value}>{L(...labels)}</option>)}
            </select>
          </CycleField>
          <CycleField label={L('الوحدة', 'Unit')}>
            <input required maxLength={50} value={rate.unit} onChange={e => setRate({ ...rate, unit: e.target.value })} />
          </CycleField>
          {!data.zero_value_training && <>
            <CycleField label={L('طريقة التسعير', 'Pricing method')}>
              <select value={rate.pricing} onChange={e => setRate({ ...rate, pricing: e.target.value })}>
                {Object.entries(pricing).map(([value, labels]) => <option key={value} value={value}>{L(...labels)}</option>)}
              </select>
            </CycleField>
            <CycleField label={L('سعر العقد', 'Contract price') + ' · ' + data.currency}>
              <input required type="number" min="0" step="0.0001" value={rate.unit_rate} onChange={e => setRate({ ...rate, unit_rate: e.target.value })} />
            </CycleField>
          </>}
          <button className="btn secondary">{L('حفظ سعر البند', 'Save contract rate')}</button>
        </fieldset>
      </form>
    </details>
    {loadEvidence&&<button type="button" className="btn secondary" disabled={busy} onClick={async()=>setEvidence(await loadEvidence())}>{L('عرض تكاليف أوامر العمل الداخلية','Show internal work order costs')}</button>}
    {rates.length > 0 && certificates.length > 0 && <form onSubmit={async event => {
      event.preventDefault()
      if (await run('save', measurement)) setMeasurement({ ...blankMeasurement, certificate_id: measurement.certificate_id })
    }}>
      <fieldset disabled={busy} className="form-grid">
        <CycleField label={L('شهادة إنجاز الشهر', 'Completion certificate for the month')}>
          <select required value={measurement.certificate_id} onChange={e => selectMeasurement({ ...measurement, certificate_id: e.target.value })}>
            <option value="">—</option>{certificates.map(cert => <option key={cert.id} value={cert.id}>{cert.number} · {cert.work_order_number}</option>)}
          </select>
        </CycleField>
        <CycleField label={L('بند العقد', 'Contract item')}>
          <select required value={measurement.price_item_id} onChange={e => selectMeasurement({ ...measurement, price_item_id: e.target.value })}>
            <option value="">—</option>{rates.map(item => <option key={item.id} value={item.id}>{item.item_code} · {item.description} · {rateCurrency(item)}</option>)}
          </select>
        </CycleField>
        <CycleField label={L('الكمية المنفّذة', 'Measured quantity') + (selectedRate?.unit ? ' · ' + selectedRate.unit : '')}>
          <input required type="number" min="0.001" step="0.001" readOnly={selectedRate?.pricing === 'monthly'} value={measurement.quantity} onChange={e => setMeasurement({ ...measurement, quantity: e.target.value })} />
        </CycleField>
        <CycleField label={L('مرجع الحصر أو سبب التغطية', 'Measurement reference or coverage basis')}>
          <input required minLength={5} maxLength={1000} value={measurement.basis} onChange={e => setMeasurement({ ...measurement, basis: e.target.value })} />
        </CycleField>
        <StatementCostEvidence selectedCost={selectedCost} currency={data.currency}/>
        {hourly&&Number(selectedCost?.labor_minutes)>0&&<button type="button" className="btn secondary" onClick={async()=>{
          if(await importLabor(measurement.certificate_id,measurement.price_item_id))
           setMeasurement(next=>({...next,quantity:String(Number((Number(selectedCost.labor_minutes)/60).toFixed(3))),basis:L('سجل ساعات أمر العمل','Work order labor log')}))
        }}>{L('استيراد ساعات العمل وتسعيرها ببند العقد','Import labor hours at the contract rate')}</button>}
        <button className="btn primary">{L('حفظ الحصر واحتساب القيمة', 'Save measurement and calculate value')}</button>
      </fieldset>
    </form>}
    {!certificates.length && <p role="status">{L('لا توجد شهادات غير مدرجة صادرة لهذا المشروع في الشهر المحدد.', 'There are no unallocated completion certificates for this project and month.')}</p>}
    {rows.map(row => <div key={row.id} className="row-actions">
      <span>{row.certificate_number} · {row.item_code} · {row.quantity} {row.unit}</span>
      <button type="button" disabled={busy} className="btn secondary" onClick={() => selectMeasurement({ certificate_id: row.certificate_id, price_item_id: row.price_item_id })}>{L('تعديل الكمية', 'Edit quantity')}</button>
      <button type="button" disabled={busy} className="btn secondary" onClick={() => {
        if (window.confirm(L('إزالة بند الحصر من المسودة؟','Remove this measurement from the draft?'))) run('remove', { measurement_id: row.id })
      }}>{L('إزالة', 'Remove')}</button>
    </div>)}
  </section>
}
