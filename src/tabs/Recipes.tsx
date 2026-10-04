import { useState } from 'react'
import { formatKg, sumKg, toFa, type Catalog, type RecipeItem } from '../core'
import type { Update } from '../store'
import { NumInput, Tag } from '../ui'

type Target = { type: 'recipe' | 'color'; id: string }

export function Recipes({ catalog, update }: { catalog: Catalog; update: Update }) {
  const targets: (Target & { name: string; items: RecipeItem[]; review?: boolean })[] = [
    ...Object.values(catalog.recipes).map(r => ({ type: 'recipe' as const, id: r.id, name: `فرمول ${r.name}`, items: r.items, review: r.needsReview })),
    ...Object.values(catalog.colors).map(c => ({ type: 'color' as const, id: c.id, name: `رنگ ${c.name}`, items: c.items, review: c.needsReview })),
  ]
  const [sel, setSel] = useState(`${targets[0].type}:${targets[0].id}`)
  const cur = targets.find(t => `${t.type}:${t.id}` === sel) ?? targets[0]

  const edit = (fn: (items: RecipeItem[]) => void, markReviewed = true) =>
    update(s => {
      const obj = cur.type === 'recipe' ? s.catalog.recipes[cur.id] : s.catalog.colors[cur.id]
      fn(obj.items)
      if (markReviewed) obj.needsReview = false
    })

  const nameOf = (i: RecipeItem) =>
    i.ref.kind === 'material' ? catalog.materials[i.ref.id]?.name : `${catalog.recipes[i.ref.id]?.name} (نیمه‌ساخته)`
  const total = sumKg(cur.items)
  const addOptions = [
    ...Object.values(catalog.materials).map(m => ({ key: `material:${m.id}`, label: m.name })),
    ...Object.values(catalog.recipes).filter(r => !(cur.type === 'recipe' && r.id === cur.id)).map(r => ({ key: `recipe:${r.id}`, label: `${r.name} (نیمه‌ساخته)` })),
  ]

  return (
    <div className="card">
      <h2>فرمول‌های استاندارد</h2>
      <div className="row">
        <label>
          فرمول
          <select value={sel} onChange={e => setSel(e.target.value)}>
            {targets.map(t => <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>{t.name}</option>)}
          </select>
        </label>
        {cur.review && <Tag>از روی دست‌نوشته خوانده شده؛ بررسی و ویرایش کنید</Tag>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>جزء</th><th className="n">کیلو</th><th className="n">درصد</th><th /></tr></thead>
          <tbody>
            {cur.items.map((it, idx) => (
              <tr key={`${it.ref.kind}:${it.ref.id}`}>
                <td>{nameOf(it)}</td>
                <td className="n"><NumInput value={it.qtyKg} onChange={v => edit(items => { items[idx].qtyKg = v ?? 0 })} /></td>
                <td className="n">{total > 0 ? toFa((it.qtyKg / total * 100).toFixed(1)) : '—'}٪</td>
                <td><button className="btn danger" onClick={() => edit(items => { items.splice(idx, 1) })}>حذف</button></td>
              </tr>
            ))}
            <tr><td><b>جمع</b></td><td className="n"><b>{formatKg(total)}</b></td><td /><td /></tr>
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <select id="add-item" defaultValue="">
          <option value="" disabled>افزودن جزء…</option>
          {addOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          className="btn"
          onClick={() => {
            const el = document.getElementById('add-item') as HTMLSelectElement
            if (!el.value) return
            const [kind, id] = el.value.split(':') as ['material' | 'recipe', string]
            edit(items => { if (!items.some(i => i.ref.kind === kind && i.ref.id === id)) items.push({ ref: { kind, id }, qtyKg: 0 }) })
            el.value = ''
          }}
        >
          افزودن
        </button>
      </div>
      <p className="muted">
        تغییر فرمول استاندارد روی قیمت‌های بعدی اثر می‌گذارد. برای تغییر فقط یک پارت، از بخش «پارت تولید» استفاده کنید.
      </p>
    </div>
  )
}
