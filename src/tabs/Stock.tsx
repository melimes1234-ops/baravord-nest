import { useState } from 'react'
import { formatKg, formatToman, fromJalaliDate, stockLevels, toFa, toJalaliDate, type Catalog, type Movement } from '../core'
import type { Update } from '../store'
import { NumInput } from '../ui'

export function Stock({ catalog, movements, update }: { catalog: Catalog; movements: Movement[]; update: Update }) {
  const levels = stockLevels(movements)
  const [materialId, setMaterialId] = useState(Object.keys(catalog.materials)[0])
  const [kg, setKg] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [date, setDate] = useState(() => toJalaliDate(new Date().toISOString()))
  const [error, setError] = useState('')

  const add = (type: 'in' | 'waste_in') => {
    const iso = fromJalaliDate(date)
    if (!iso) return setError('تاریخ شمسی معتبر نیست (مثلاً ۱۴۰۵/۰۷/۱۲)')
    if (!kg || kg <= 0) return setError('مقدار را وارد کنید')
    update(s => {
      s.movements.push({ id: `M${Date.now().toString(36)}`, date: iso, materialId, kg, type, pricePerKg: type === 'in' ? price ?? undefined : undefined })
      // A priced purchase also updates the material price used in costing.
      if (type === 'in' && price != null) s.catalog.materials[materialId].pricePerKg = levelsAfter(s.movements, materialId) ?? price
    })
    setError(''); setKg(null)
  }

  return (
    <>
      <div className="card">
        <h2>ثبت ورود به انبار (خرید یا ضایعات برگشتی)</h2>
        <div className="row">
          <label>ماده<select value={materialId} onChange={e => setMaterialId(e.target.value)}>{Object.values(catalog.materials).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>مقدار (کیلو)<NumInput value={kg} onChange={setKg} /></label>
          <label>قیمت خرید هر کیلو (تومان)<NumInput money value={price} onChange={setPrice} /></label>
          <label>تاریخ شمسی<input value={date} onChange={e => setDate(e.target.value)} style={{ width: 120 }} /></label>
          <button className="btn" onClick={() => add('in')}>ثبت خرید</button>
          <button className="btn ghost" onClick={() => add('waste_in')}>ضایعات برگشتی</button>
        </div>
        {error && <div className="alert err">{error}</div>}
        <p className="muted">با ثبت خرید، قیمت ماده با میانگین موزون موجودی به‌روز می‌شود. مصرف تولید خودکار از فرمول واقعی هر پارت کم می‌شود.</p>
      </div>
      <div className="card">
        <h2>باقی‌مانده مواد</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>ماده</th><th className="n">موجودی (کیلو)</th><th className="n">میانگین قیمت</th><th className="n">ارزش موجودی</th></tr></thead>
            <tbody>
              {Object.values(catalog.materials).map(m => {
                const s = levels[m.id]
                return (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="n">{formatKg(s?.qtyKg ?? 0)}</td>
                    <td className="n">{formatToman(s?.avgPrice)}</td>
                    <td className="n">{s?.avgPrice == null ? '—' : formatToman(s.qtyKg * s.avgPrice)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>تاریخچه ورود و خروج</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>تاریخ</th><th>ماده</th><th>نوع</th><th className="n">کیلو</th></tr></thead>
            <tbody>
              {[...movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map(m => (
                <tr key={m.id}>
                  <td>{toJalaliDate(m.date)}</td>
                  <td>{catalog.materials[m.materialId]?.name}</td>
                  <td>{m.type === 'in' ? 'خرید' : m.type === 'waste_in' ? 'ضایعات برگشتی' : m.type === 'out' ? `مصرف پارت ${m.ref ?? ''}` : 'تعدیل'}</td>
                  <td className="n">{toFa(formatKg(m.kg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function levelsAfter(movements: Movement[], id: string): number | null {
  return stockLevels(movements)[id]?.avgPrice ?? null
}
