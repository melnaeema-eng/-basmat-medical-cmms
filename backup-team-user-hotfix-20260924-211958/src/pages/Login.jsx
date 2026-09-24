import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'

export default function Login() {
  const { signIn, user } = useAuth()
  const { t, lang, setLang } = useLanguage()
  const [form, setForm] = useState({ email:'', password:'' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await signIn(form.email, form.password)
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-head">
          <div className="brand-mark large">BF</div>
          <h1>{t('appName')}</h1>
          <p>{t('loginHint')}</p>
        </div>
        <form onSubmit={submit} className="form-grid one">
          <label>{t('email')}<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></label>
          <label>{t('password')}<input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
          <button type="button" className="btn secondary" onClick={()=>setLang(lang==='ar'?'en':'ar')}>{t('language')}</button>
        </form>
      </div>
    </div>
  )
}
