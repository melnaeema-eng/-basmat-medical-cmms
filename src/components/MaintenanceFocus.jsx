import './MaintenanceFocus.css'
export function NextActionCard({action,lang='ar',children}){
 if(!action)return null
 const ar=lang==='ar'
 return <div className={'maintenance-focus'+(action.terminal?' is-finished':'')} role="status" aria-live="polite" aria-atomic="true">
  <span className="maintenance-focus-label">{action.terminal?(ar?'حالة العمل':'Work status'):(ar?'الإجراء التالي':'Next action')}</span>
  <h2>{action.title}</h2>
  {!action.terminal&&<p><strong>{ar?'المسؤول: ':'Responsible: '}</strong>{action.responsible}</p>}
  {children}
 </div>
}
export function StageSection({completed=false,label,children}){
 return completed?<details className="maintenance-history"><summary>{label}</summary>{children}</details>:<>{children}</>
}
