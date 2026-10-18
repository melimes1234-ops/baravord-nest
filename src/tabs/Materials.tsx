import { useState } from 'react'
import type { Update } from '../store'
import { toFa, type Catalog, type Movement } from '../core'
import { NumInput, Tag, TextInput } from '../ui'

/** Short plain-words notes shown under a material's name. */
const HINTS: Record<string, string> = {
  pp: 'پلیمر اصلی PRP (حدود ۵۶٪ از PRP). در اکسل دو اسکرپ بازیافتی است: SC4 (۲۰۵٬۰۰۰) و SCH (۱۸۲٬۰۰۰) که با نسبت ۲۰۰۰ به ۳۲۳ مخلوط می‌شوند؛ قیمت این ردیف میانگین آن‌هاست. هر پلیمری می‌خری (اسکرپ، نو یا بازیافتی)، قیمت خرید هر کیلوی آن را به تومان بنویس، بدون مالیات و کرایه. مالیات ۹٪، کرایه و خردکردن جدا حساب می‌شود: تب «هزینه‌ها»، کارت «هزینه‌ی هر مرحله‌ی ساخت»، ردیف «پلیمر آماده‌ی مصرف».',
  waste: 'ضایعاتی که دوباره به تولید برمی‌گردد (از صفحه‌ی «محصول ساخته‌شده»). قیمتش صفر است.',
}

/** Formulas and colours that use a material (a used material cannot be deleted without breaking them). */
function usedIn(catalog: Catalog, id: string): string[] {
  const uses = (items: { ref: { kind: string; id: string } }[]) => items.some(i => i.ref.kind === 'material' && i.ref.id === id)
  return [
    ...Object.values(catalog.recipes).filter(r => uses(r.items)).map(r => `فرمول «${r.name}»`),
    ...Object.values(catalog.colors).filter(c => uses(c.items)).map(c => `رنگ «${c.name}»`),
  ]
}

export function Materials({ catalog, update, movements = [] }: { catalog: Catalog; update: Update; movements?: Movement[] }) {
  const [name, setName] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  return (
    <div className="card">
      <h2>مواد اولیه: هر کیلو چند تومان است؟</h2>
      <div className="tablewrap scroll-box">
        <table>
          <thead><tr><th>ماده (اسمش را می‌توانید عوض کنید)</th><th className="n">قیمت هر کیلو (تومان)</th><th /></tr></thead>
          <tbody>
            {Object.values(catalog.materials).map(m => {
              const uses = usedIn(catalog, m.id)
              const stock = movements.filter(x => x.materialId === m.id).length
              return (
              <tr key={m.id}>
                <td className="mat-name"><TextInput required width={220} value={m.name} onChange={v => update(s => { s.catalog.materials[m.id].name = v })} />{HINTS[m.id] && <div className="muted hint">{HINTS[m.id]}</div>}</td>
                <td className="n">
                  <NumInput
                    money
                    unit="تومان"
                    value={m.pricePerKg}
                    onChange={v => update(s => { s.catalog.materials[m.id].pricePerKg = v })}
                  />
                </td>
                <td>
                  {m.pricePerKg == null && <Tag kind="err">قیمت نوشته نشده</Tag>}{' '}
                  {confirmDel === m.id ? (
                    uses.length > 0 ? (
                      <span className="alert err" style={{ display: 'inline-block', margin: 0, padding: '4px 8px' }}>
                        حذف نمی‌شود، چون در {uses.join('، ')} استفاده شده. اول از آنجا برش دارید.{' '}
                        <button className="btn ghost" onClick={() => setConfirmDel(null)}>باشه</button>
                      </span>
                    ) : (
                      <>
                        {stock > 0 && <span className="muted">{toFa(stock)} ثبت انبار دارد و در تاریخچه بی‌نام می‌شود. </span>}
                        <button className="btn danger" onClick={() => { update(s => { delete s.catalog.materials[m.id] }); setConfirmDel(null) }}>حذف شود</button>{' '}
                        <button className="btn ghost" onClick={() => setConfirmDel(null)}>انصراف</button>
                      </>
                    )
                  ) : (
                    <button className="btn danger" onClick={() => setConfirmDel(m.id)}>حذف</button>
                  )}
                </td>
              </tr>
              )
            })}
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
