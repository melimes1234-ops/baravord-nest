import { useState } from 'react'
import type { Update } from '../store'
import type { Catalog } from '../core'
import { NumInput, Tag } from '../ui'

/** Short plain-words notes shown under a material's name. */
const HINTS: Record<string, string> = {
  pp: 'پلیمر اصلی PRP (حدود ۵۶٪ از PRP). در اکسل دو اسکرپ بازیافتی است: SC4 (۲۰۵٬۰۰۰) و SCH (۱۸۲٬۰۰۰) که با نسبت ۲۰۰۰ به ۳۲۳ مخلوط می‌شوند؛ قیمت این ردیف میانگین آن‌هاست. هر پلیمری می‌خری (اسکرپ، نو یا بازیافتی)، قیمت خرید هر کیلوی آن را به تومان بنویس، بدون مالیات و کرایه. مالیات ۹٪، کرایه و خردکردن جدا حساب می‌شود: تب «هزینه‌ها»، کارت «هزینه‌ی هر مرحله‌ی ساخت»، ردیف «پلیمر آماده‌ی مصرف».',
  waste: 'ضایعاتی که دوباره به تولید برمی‌گردد (از صفحه‌ی «محصول ساخته‌شده»). قیمتش صفر است.',
}

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
                <td className="mat-name">{m.name}{HINTS[m.id] && <div className="muted hint">{HINTS[m.id]}</div>}</td>
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
