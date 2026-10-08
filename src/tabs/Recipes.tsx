import { useState } from 'react'
import { colorSwatch, formatKg, sumKg, type Catalog, type RecipeItem } from '../core'
import type { Update } from '../store'
import { NumInput, Swatch } from '../ui'

type Target = { type: 'recipe' | 'color'; id: string }

export function Recipes({ catalog, update }: { catalog: Catalog; update: Update }) {
  const targets: (Target & { name: string; items: RecipeItem[] })[] = [
    ...Object.values(catalog.recipes).map(r => ({ type: 'recipe' as const, id: r.id, name: `فرمول ${r.name}`, items: r.items })),
    ...Object.values(catalog.colors).map(c => ({ type: 'color' as const, id: c.id, name: `رنگ ${c.name}`, items: c.items })),
  ]
  const [sel, setSel] = useState(`${targets[0].type}:${targets[0].id}`)
  const cur = targets.find(t => `${t.type}:${t.id}` === sel) ?? targets[0]

  const edit = (fn: (items: RecipeItem[]) => void) =>
    update(s => {
      const obj = cur.type === 'recipe' ? s.catalog.recipes[cur.id] : s.catalog.colors[cur.id]
      fn(obj.items)
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
      </div>
      {cur.type === 'color' && (
        <div className="row">
          <Swatch hex={colorSwatch(catalog.colors[cur.id], catalog)} large />
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            رنگ نمایشی
            <input
              type="color"
              value={colorSwatch(catalog.colors[cur.id], catalog)}
              onChange={e => update(s => { s.catalog.colors[cur.id].hex = e.target.value })}
            />
          </label>
          {catalog.colors[cur.id].hex && (
            <button className="btn ghost" onClick={() => update(s => { delete s.catalog.colors[cur.id].hex })}>برگشت به رنگ خودکار</button>
          )}
          <span className="muted">این رنگ فقط برای نمایش در برنامه است. به‌طور پیش‌فرض از روی رنگدانه‌های فرمول تخمین زده می‌شود و می‌توانید با رنگ واقعی جایگزینش کنید.</span>
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead><tr><th>جزء</th><th className="n">کیلو</th><th className="n">درصد</th><th /></tr></thead>
          <tbody>
            {cur.items.map((it, idx) => (
              <tr key={`${it.ref.kind}:${it.ref.id}`}>
                <td>{nameOf(it)}</td>
                <td className="n"><NumInput value={it.qtyKg} onChange={v => edit(items => { items[idx].qtyKg = v ?? 0 })} /></td>
                <td className="n">
                  <NumInput
                    value={total > 0 ? Math.round((it.qtyKg / total) * 10000) / 100 : 0}
                    decimals={2}
                    onChange={v => edit(items => {
                      const p = v ?? 0
                      if (p < 0 || p >= 100) return
                      const others = items.reduce((s, x, j) => (j === idx ? s : s + x.qtyKg), 0)
                      items[idx].qtyKg = Math.round(((p / 100) * others / (1 - p / 100)) * 1e6) / 1e6
                    })}
                  />٪
                </td>
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
        درصد هر جزء را هم می‌توان مستقیم نوشت: بقیه‌ی اجزا ثابت می‌مانند و جزء مورد نظر طوری تنظیم می‌شود که همان سهم را از کل داشته باشد.
        تغییر فرمول استاندارد روی قیمت‌های بعدی اثر می‌گذارد. برای تغییر فقط یک پارت، از بخش «پارت تولید» استفاده کنید.
      </p>
    </div>
  )
}
