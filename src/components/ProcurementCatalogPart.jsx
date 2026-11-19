import { useState } from 'react'
import CompanyField from './CompanyField'
import { Dialog, Field, FormActions, Notice, Select } from './FacilityFields'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const fields = [
  ['name_ar', 'اسم الصنف بالعربية', 'Arabic item name', 200],
  ['name_en', 'اسم الصنف بالإنجليزية', 'English item name', 200],
  ['manufacturer', 'الشركة المصنّعة', 'Manufacturer', 150],
  ['manufacturer_part_number', 'رقم قطعة المصنّع', 'Manufacturer part number', 150],
]

export default function ProcurementCatalogPart({ organizations, selectedCompany, onSave }) {
  const { lang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [organization, setOrganization] = useState('')
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const L = (ar, en) => lang === 'ar' ? ar : en
  const title = L('إضافة صنف لقائمة المستودع', 'Add a warehouse catalog item')
  async function submit(event) {
    event.preventDefault()
    if (busy || !organization) return
    setBusy(true)
    setError('')
    try {
      const result = await supabase.rpc('bf_procurement_catalog_part', { p_org: organization, p_data: form })
      if (result.error) throw result.error
      setOpen(false)
      setSuccess(L('الصنف متاح الآن للاختيار في طلبات قطع الغيار.', 'The item is now available to select in spare parts requests.'))
      await onSave()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <>
    <button type="button" className="btn secondary" onClick={() => {
      setOrganization(selectedCompany || (organizations.length === 1 ? organizations[0].id : ''))
      setForm({})
      setError('')
      setSuccess('')
      setOpen(true)
    }}>{title}</button>
    {success && <Notice success={success} />}
    <Dialog open={open} title={title} onClose={() => !busy && setOpen(false)}>
      <Notice error={error} />
      <form className="facility-form" onSubmit={submit}>
        <div className="form-grid">
          <CompanyField label={t('organization')} required><Select required value={organization} onChange={setOrganization}
            placeholder={t('select')} options={organizations.map(org => ({ value: org.id, label: org.name }))} /></CompanyField>
          {fields.map(([key, ar, en, max]) => <Field key={key} label={L(ar, en)} required>
            <input required maxLength={max} value={form[key] || ''} onChange={event => setForm({ ...form, [key]: event.target.value })} />
          </Field>)}
        </div>
        <FormActions busy={busy || !organization} onCancel={() => setOpen(false)} />
      </form>
    </Dialog>
  </>
}
