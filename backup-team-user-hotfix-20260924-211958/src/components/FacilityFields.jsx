import {useLanguage} from '../i18n/LanguageContext'
export function Field({label,required,children,wide}){return <label className={wide?'span-2':''}><span>{label}{required?' *':''}</span>{children}</label>}
export function Select({value,onChange,options,placeholder,disabled,required}){
 return <select value={value??''} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>
  <option value="">{placeholder||'—'}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
 </select>
}
export function Choice({rows,value,onChange,lang,placeholder,disabled,required,labelKey='name'}){
 return <Select value={value} onChange={onChange} disabled={disabled} required={required} placeholder={placeholder}
  options={(rows||[]).map(r=>({value:r.id,label:lang==='ar'?r.name_ar||r.name_en||r[labelKey]:r.name_en||r.name_ar||r[labelKey]}))}/>
}
export function Dialog({open,title,onClose,children}){
 if(!open)return null
 return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card facility-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e=>e.stopPropagation()}>
  <div className="modal-header"><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>{children}
 </div></div>
}
export function Notice({error,success}){return <>{error&&<div role="alert" className="alert error">{error}</div>}{success&&<div role="status" className="alert success">{success}</div>}</>}
export function Status({value}){const {t}=useLanguage();return <span className={'facility-status status-'+value}>{t(value)}</span>}
export function FormActions({busy,onCancel}){const {t}=useLanguage();return <div className="form-actions"><button type="button" className="btn secondary" onClick={onCancel}>{t('cancel')}</button><button className="btn primary" disabled={busy}>{busy?t('loading'):t('save')}</button></div>}
