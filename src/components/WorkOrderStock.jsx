import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabaseClient'
import { Field, Notice, Select } from './FacilityFields'

function StockAction({ action, target, title, quantity, options = [], assignees = [], bins = [], busy, submit }) {
  const { t, lang } = useLanguage()
  const L = (ar, en) => lang === 'ar' ? ar : en
  const name = row => L(row.name_ar, row.name_en) || row.name_ar || row.name_en
  const [lot, setLot] = useState(options.length === 1 ? options[0].id : '')
  const [recipient, setRecipient] = useState(target.recipient || (assignees.length === 1 ? assignees[0].id : ''))
  const [bin, setBin] = useState(bins.length === 1 ? bins[0].id : '')
  const receipt = action === 'supplier_receipt'
  const issue = action === 'issue' || action === 'issue_reserved'
  const selectedLot = options.find(item => item.id === lot)
  const amount = Math.min(quantity || 0, Number(selectedLot?.available ?? quantity ?? 0))
  const item = [target.number, name(target), target.serial].filter(Boolean).join(' · ')
  const formKey = [lot, amount].join(':')
  const cannotSubmit = (receipt && !bin) || (issue && !recipient) || (action === 'issue' && !selectedLot)
  return <form className="facility-form facility-panel" onSubmit={event => {
    event.preventDefault()
    if (busy || cannotSubmit) return
    const data = Object.fromEntries(new FormData(event.currentTarget))
    if (action !== 'close') data.quantity = Number(data.quantity || amount)
    if (lot) data.stock_lot_id = lot
    if (issue) data.recipient = recipient
    if (receipt) data.bin_id = bin
    if (action === 'return') data.custody = target.custody
    submit(action, target.id, data)
  }}>
    <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <p><strong>{item}</strong>{quantity ? ' · ' + L('الكمية', 'Quantity') + ' ' + amount : ''}</p>
      {receipt && bins.length === 1 && <p className="muted">{name(bins[0])}</p>}
      {issue && recipient && <p className="muted">{L('الفني المستلم', 'Receiving technician')} · {assignees.find(row => row.id === recipient)?.name}</p>}
      <div className="form-grid">
        {action === 'issue' && options.length > 1 &&
          <Field label={L('موقع القطعة', 'Stock location')} required>
            <Select required value={lot} onChange={setLot} options={options.map(row => ({ value: row.id, label: [name(row), row.serial, row.batch, row.available].filter(Boolean).join(' · ') }))} />
          </Field>}
        {issue && assignees.length > 1 && !target.recipient &&
          <Field label={L('الفني المستلم', 'Receiving technician')} required>
            <Select required value={recipient} onChange={setRecipient} options={assignees.map(row => ({ value: row.id, label: row.name }))} />
          </Field>}
        {amount > 0 && <Field label={t('quantity')} required>
          <input key={formKey} required name="quantity" type="number" min="0.001" step="0.001" max={amount} defaultValue={amount} />
        </Field>}
        {receipt && <>
          {bins.length !== 1 && <Field label={L('موقع التخزين', 'Storage location')} required>
            <Select required value={bin} onChange={setBin} options={bins.map(row => ({ value: row.id, label: name(row) }))} />
          </Field>}
          <Field label={L('مرجع تسليم المورد', 'Supplier delivery reference')} required><input required name="supplier_reference" minLength={3} /></Field>
          <details className="span-2">
            <summary>{L('الرقم التسلسلي والدفعة والانتهاء، إن وجدت', 'Serial number, batch and expiry, if applicable')}</summary>
            <div className="form-grid">
              <Field label={L('الرقم التسلسلي', 'Serial number')}><input name="serial_number" /></Field>
              <Field label={L('الدفعة', 'Batch')}><input name="lot_code" /></Field>
              <Field label={L('تاريخ الانتهاء', 'Expiry date')}><input type="date" name="expires_on" /></Field>
            </div>
          </details>
        </>}
      </div>
      <div className="row-actions"><button type="submit" className="btn primary" disabled={cannotSubmit}>{title}</button></div>
    </fieldset>
  </form>
}

export default function WorkOrderStock({ workOrderId, refreshKey, onRefresh }) {
  const { t, lang } = useLanguage()
  const [data, setData] = useState(null)
  const [feedback, setFeedback] = useState({})
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const retry = useRef(null)
  const L = (ar, en) => lang === 'ar' ? ar : en
  const load = useCallback(async () => {
    const { data: state, error } = await supabase.rpc('bf_work_order_stock', { p_work_order: workOrderId })
    if (error) throw error
    return state
  }, [workOrderId])

  useEffect(() => {
    let current = true
    load().then(state => { if (current) setData(state) }).catch(error => {
      if (current && error.code !== '42501') setFeedback({ error: error.message })
    })
    return () => { current = false }
  }, [load, refreshKey])

  async function submit(action, target, payload) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setFeedback({})
    const fingerprint = JSON.stringify([action, target, payload])
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() }
    try {
      const result = await supabase.rpc('bf_work_order_stock', {
        p_work_order: workOrderId, p_action: action, p_target: target, p_data: payload, p_key: retry.current.key,
      })
      if (result.error) throw result.error
      retry.current = null
      setFeedback({ success: t('saved') })
      setData(await load())
      onRefresh?.()
    } catch (error) {
      setFeedback({ error: error.message })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const cards = []
  const add = (action, target, title, quantity, extra = {}) => cards.push(
    <StockAction key={action + ':' + target.id + ':' + quantity + ':' + (target.custody || '')}
      {...{ action, target, title, quantity, busy, submit }} {...extra} />
  )
  for (const line of data?.receipts || []) add('supplier_receipt', line, L('استلام البضاعة', 'Receive delivery'), line.remaining, { bins: data.bins })
  for (const line of data?.issues || []) add('issue', line, L('صرف القطعة للفني', 'Issue part to technician'), line.remaining, { options: line.lots, assignees: data.assignees })
  for (const allocation of data?.allocations || []) {
    if (allocation.reserved > 0) add('issue_reserved', allocation, L('صرف القطعة المحجوزة', 'Issue reserved part'), allocation.reserved, { assignees: data.assignees })
    if (allocation.awaiting > 0) add('receive', allocation, L('تأكيد استلام القطعة', 'Confirm part receipt'), allocation.awaiting)
    if (allocation.unused > 0) add('consume', allocation, L('تسجيل استخدام القطعة', 'Record part usage'), allocation.unused)
    if (allocation.return_received > 0) add('return', { ...allocation, custody: 'received' }, L('إرجاع القطعة غير المستخدمة', 'Return unused part'), allocation.return_received)
    if (allocation.return_unreceived > 0) add('return', { ...allocation, custody: 'unreceived' }, L('إرجاع قطعة لم يتسلّمها الفني', 'Return uncollected part'), allocation.return_unreceived)
  }
  for (const request of data?.closable || []) add('close', request, L('إغلاق طلب المواد', 'Close material request'))
  if (!cards.length && !feedback.error && !feedback.success) return null
  return <section className="facility-panel">
    <h3>{L('الإجراء المطلوب لقطع الغيار', 'Spare parts actions')}</h3>
    <Notice {...feedback} />
    {cards}
  </section>
}
