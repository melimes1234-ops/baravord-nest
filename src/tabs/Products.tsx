import type { Catalog } from '../core'
import type { Update } from '../store'
import { NumInput, Tag } from '../ui'

export function Products({ catalog, update }: { catalog: Catalog; update: Update }) {
  return (
    <div className="card">
      <h2>محصولات و وزن شاخه ۳ متری</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>نام</th><th>کد</th><th>ابعاد (میلی‌متر)</th><th className="n">وزن ۳ متر (گرم)</th><th>فرمول پایه</th><th /></tr></thead>
          <tbody>
            {Object.values(catalog.products).map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.code}</td>
                <td>{p.widthMm ? `${p.widthMm}×${p.thicknessMm}` : '—'}</td>
                <td className="n">
                  <NumInput money value={p.weightPer3mG} onChange={v => update(s => { const q = s.catalog.products[p.id]; q.weightPer3mG = v; q.needsReview = false })} />
                </td>
                <td>
                  <select value={p.baseRecipeId} onChange={e => update(s => { s.catalog.products[p.id].baseRecipeId = e.target.value })}>
                    {Object.values(catalog.recipes).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  {p.weightPer3mG == null ? <Tag kind="err">وزن وارد نشود</Tag> : p.needsReview ? <Tag>وزن باید تأیید شود</Tag> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
