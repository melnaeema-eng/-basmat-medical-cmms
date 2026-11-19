import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabaseClient'
import { Field, Notice, Select, Status } from './FacilityFields'

const emptyForm = { part: '', quantity: '1', reason: '' }

export default function WorkOrderSpareParts({ workOrder }) {
  const { can } = useAuth()
  const { lang, t } = useLanguage()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [rejection, setRejection] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const retry = useRef(null)
  const workOrderId = workOrder.id
  const L = (ar, en) => lang === 'ar' ? ar : en
  const label = part => [part.sku, L(part.name_ar, part.name_en) || part.name_ar || part.name_en,
    part.manufacturer, part.manufacturer_part_number].filter(Boolean).join(' · ')

  const load = useCallback(async () => {
    const result = await supabase.rpc('bf_work_order_spares', { p_work_order: workOrderId })
    if (result.error) throw result.error
    return result.data
  }, [workOrderId])

  useEffect(() => {
    let current = true
    load().then(result => { if (current) setData(result) }).catch(result => {
      if (current && result.code !== '42501') setError(result.message)
    })
    return () => { current = false }
  }, [load])

  async function run(action, requestId) {
    if (busy) return
    setBusy(true)
    setError('')
    setSuccess('')
    const args = { p_work_order: workOrderId, p_action: action }
    if (requestId) args.p_request = requestId
    if (action === 'request') {
      const fingerprint = JSON.stringify(form)
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() }
      Object.assign(args, { p_part: form.part, p_quantity: Number(form.quantity), p_reason: form.reason, p_key: retry.current.key })
    }
    if (action === 'reject') args.p_reason = rejection.reason
    try {
      const result = await supabase.rpc('bf_work_order_spares', args)
      if (result.error) throw result.error
      if (action === 'request') {
        setForm(emptyForm)
        retry.current = null
      }
      setRejection(null)
      setSuccess(action === 'request' ? L('أُرسل الطلب إلى مشرف الصيانة للمراجعة.', 'The request is ready for maintenance supervisor review.') : t('saved'))
      setData(await load())
    } catch (failure) {
      setError(failure.message === 'Requested parts are available in stock'
        ? L('الكمية المطلوبة متوفرة. تابع الحجز والصرف من المستودع.', 'The requested quantity is available. Continue with stock reservation and issue.')
        : failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data && !error) return null

  return <section className="facility-panel">
    <h3>{L('طلبات قطع الغيار', 'Spare parts requests')}</h3>
    <Notice error={error} success={success} />
    {data?.can_request && <form className="facility-form" onSubmit={event => { event.preventDefault(); run('request') }}>
      <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div className="form-grid">
          <Field label={L('الصنف من قائمة المستودع', 'Warehouse catalog item')} required>
            <Select required value={form.part} onChange={part => setForm({ ...form, part })}
              placeholder={t('select')} options={data.parts.map(part => ({
                value: part.id, label: label(part) + ' · ' + L('المتاح', 'Available') + ' ' + part.available,
              }))} />
          </Field>
          <Field label={t('quantity')} required><input type="number" min="0.001" step="0.001" required value={form.quantity}
            onChange={event => setForm({ ...form, quantity: event.target.value })} /></Field>
          <Field label={t('reason')} wide required><textarea minLength={5} maxLength={1000} required value={form.reason}
            onChange={event => setForm({ ...form, reason: event.target.value })} /></Field>
        </div>
        <p className="muted">{L('إذا لم تجد الصنف، اطلب من المشتريات إضافته إلى قائمة المستودع.', 'If the item is missing, ask Procurement to add it to the warehouse catalog.')}</p>
        <button type="submit" className="btn primary" disabled={!form.part}>{L('إرسال طلب القطعة للمشرف', 'Send spare parts request for review')}</button>
      </fieldset>
    </form>}
    {data?.requests.map(request => <div className="facility-panel" key={request.id}>
      <div className="row-actions"><strong>{request.number}</strong><Status value={request.status} /></div>
      <p>{request.reason}</p>
      {request.lines.map(line => <p key={line.id}>{label(line)} × {line.quantity}</p>)}
      {request.closing_reason && <p>{request.closing_reason}</p>}
      {request.purchase && <p>
        {L('طلب الشراء', 'Purchase requisition')}{' '}
        {can('procurement.view', workOrder.organization_id)
          ? <Link to={'/procurement/requisition/' + request.purchase.id}>{request.purchase.number}</Link>
          : request.purchase.number}{' '}<Status value={request.purchase.status} />
      </p>}
      <div className="row-actions">
        {data.can_approve && !request.own && request.status === 'submitted' && request.lines.length > 0 && <>
          <button type="button" className="btn primary" disabled={busy} onClick={() => run('approve', request.id)}>{L('اعتماد طلب القطعة', 'Approve spare parts request')}</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => setRejection({ id: request.id, reason: '' })}>{t('reject')}</button>
        </>}
        {data.can_purchase && request.status === 'approved' && (!request.purchase || ['cancelled', 'rejected'].includes(request.purchase.status)) &&
          <button type="button" className="btn primary" disabled={busy} onClick={() => run('purchase', request.id)}>{L('إرسال العجز إلى المشتريات', 'Send shortage to Procurement')}</button>}
        {can('inventory.view', workOrder.organization_id) &&
          <Link to={'/advanced-stock/' + request.id}>{L('الحجز والصرف والاستلام', 'Reservation, issue and receipt')}</Link>}
      </div>
      {rejection?.id === request.id && <form onSubmit={event => { event.preventDefault(); run('reject', request.id) }}>
        <Field label={t('reason')} required><textarea required minLength={5} maxLength={1000} value={rejection.reason}
          onChange={event => setRejection({ id: request.id, reason: event.target.value })} /></Field>
        <button type="submit" className="btn secondary" disabled={busy}>{L('تأكيد الرفض', 'Confirm rejection')}</button>
      </form>}
    </div>)}
  </section>
}
