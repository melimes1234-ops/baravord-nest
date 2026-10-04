import { useState } from 'react'
import { formatToman, rialToToman } from '../core'
import type { Update } from '../store'
import type { Catalog } from '../core'
import { NumInput, Tag } from '../ui'

export function Materials({ catalog, update }: { catalog: Catalog; update: Update }) {
  const [rial, setRial] = useState(false)
  const [name, setName] = useState('')
  return (
    <div className="card">
      <h2>مواد اولیه و قیمت هر کیلو</h2>
      <div className="row">
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={rial} onChange={e => setRial(e.target.checked)} style={{ minWidth: 0 }} />
          قیمت را به ریال وارد می‌کنم (تقسیم بر ۱۰ و ذخیره به تومان)
        </label>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>ماده</th><th className="n">قیمت هر کیلو ({rial ? 'ریال' : 'تومان'})</th><th className="n">معادل تومان</th><th /></tr></thead>
          <tbody>
            {Object.values(catalog.materials).map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="n">
                  <NumInput
                    money
                    value={m.pricePerKg == null ? null : rial ? m.pricePerKg * 10 : m.pricePerKg}
                    onChange={v => update(s => { s.catalog.materials[m.id].pricePerKg = v == null ? null : rial ? rialToToman(v) : v })}
                  />
                </td>
                <td className="n">{formatToman(m.pricePerKg)}</td>
                <td>{m.pricePerKg == null && <Tag kind="err">قیمت وارد نشده</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input placeholder="نام ماده جدید" value={name} onChange={e => setName(e.target.value)} />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            update(s => {
              const id = `m-${Date.now().toString(36)}`
              s.catalog.materials[id] = { id, name: name.trim(), pricePerKg: null }
            })
            setName('')
          }}
        >
          افزودن ماده
        </button>
      </div>
    </div>
  )
}
