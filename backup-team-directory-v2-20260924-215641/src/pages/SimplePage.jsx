export default function SimplePage({ title, description }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <div style={{marginTop:24,background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:20}}>
        <strong>Sprint 1 foundation ready</strong>
        <p style={{color:'#6b7280'}}>CRUD screens will be expanded in the next delivery after database validation.</p>
      </div>
    </div>
  )
}
