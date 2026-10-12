import { useState } from 'react'
import type { Update } from '../store'
import type { Catalog } from '../core'
import { NumInput, Tag } from '../ui'

export function Materials({ catalog, update }: { catalog: Catalog; update: Update }) {
  const [name, setName] = useState('')
  return (
    <div className="card">
      <h2>مواد اولیه: هر کیلو چند تومان است؟</h2>
      <div className="tablewrap scroll-box">
        <table>
          <thead><tr><th>ماده</th><th className="n">قیمت هر کیلو (تومان)</th><th /></tr></thead>
          <tbody>
            {Object.values(catalog.materials).map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="n">
                  <NumInput
                    money
                    unit="تومان"
                    value={m.pricePerKg}
                    onChange={v => update(s => { s.catalog.materials[m.id].pricePerKg = v })}
                  />
                </td>
                <td>{m.pricePerKg == null && <Tag kind="err">قیمت نوشته نشده</Tag>}</td>
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
