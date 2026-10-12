import { validateCatalog, type Catalog } from '../core'

export function Issues({ catalog, go }: { catalog: Catalog; go?: (tab: string) => void }) {
  const issues = validateCatalog(catalog)
  return (
    <div className="card">
      <h2>چه چیزهایی هنوز کامل نیست؟</h2>
      {issues.length === 0 && <p>همه چیز کامل است. ✓</p>}
      {issues.map((i, k) => (
        <div key={k} className={`alert ${i.level === 'error' ? 'err' : ''}`}><b>{i.where}:</b> {i.message}{i.tab && go && <> <button className="btn ghost link" onClick={() => go(i.tab!)}>بروید به «{i.tab}» ←</button></>}</div>
      ))}
    </div>
  )
}
