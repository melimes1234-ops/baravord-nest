import { validateCatalog, type Catalog } from '../core'

export function Issues({ catalog }: { catalog: Catalog }) {
  const issues = validateCatalog(catalog)
  return (
    <div className="card">
      <h2>هشدارها و موارد ناقص</h2>
      {issues.length === 0 && <p>همه چیز کامل است.</p>}
      {issues.map((i, k) => (
        <div key={k} className={`alert ${i.level === 'error' ? 'err' : ''}`}><b>{i.where}:</b> {i.message}</div>
      ))}
    </div>
  )
}
