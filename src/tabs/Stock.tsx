import { useState } from 'react'
import { formatKg, formatToman, stockLevels, toFa, toJalaliDate, todayIso, type Catalog, type Movement } from '../core'
import type { Update } from '../store'
import { DateField } from '../DateField'
import { InfoTip, NumInput } from '../ui'

export function Stock({ catalog, movements, update, readOnly }: { catalog: Catalog; movements: Movement[]; update: Update; readOnly?: boolean }) {
  const levels = stockLevels(movements)
  // a live example from the first material that has a purchase price
  const exId = Object.keys(levels).find(id => levels[id].avgPrice != null && levels[id].qtyKg > 0)
  const example = exId ? `مثلاً ${formatKg(levels[exId].qtyKg)} کیلو ${catalog.materials[exId]?.name} که کیلویی ${formatToman(levels[exId].avgPrice)} تومان خریده‌ایم، روی هم ${formatToman(levels[exId].qtyKg * levels[exId].avgPrice!)} تومان ارزش دارد.` : null
  const [materialId, setMaterialId] = useState(Object.keys(catalog.materials)[0])
  const [kg, setKg] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso)
  const [error, setError] = useState('')

  const add = (type: 'in' | 'waste_in') => {
    const iso = date
    if (!kg || kg <= 0) return setError('مقدار را وارد کنید')
    update(s => {
      s.movements.push({ id: `M${Date.now().toString(36)}`, date: iso, materialId, kg, type, pricePerKg: type === 'in' ? price ?? undefined : undefined })
    })
    setError(''); setKg(null)
  }

  return (
    <>
      {!readOnly && <div className="card">
        <h2>ثبت ورود به انبار (خرید یا ضایعات برگشتی)</h2>
        <p className="muted" style={{ marginTop: -4 }}>«ضایعات برگشتی» یعنی دورریزی که دوباره در تولید به کار می‌رود.</p>
        <div className="row">
          <label>ماده<select value={materialId} onChange={e => setMaterialId(e.target.value)}>{Object.values(catalog.materials).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>مقدار (کیلو)<NumInput unit="کیلو" value={kg} onChange={setKg} /></label>
          <label>قیمت خرید هر کیلو (تومان)<NumInput unit="تومان" money value={price} onChange={setPrice} /></label>
          <div className="lbl"><span>تاریخ</span><DateField value={date} onChange={setDate} /></div>
          <button className="btn" onClick={() => add('in')}>ثبت خرید</button>
          <button className="btn ghost" onClick={() => add('waste_in')}>ضایعات برگشتی</button>
        </div>
        {error && <div className="alert err">{error}</div>}
        <p className="muted">وقتی خرید را با قیمت ثبت می‌کنید، قیمت آن ماده در برنامه خودش با میانگین خریدها به‌روز می‌شود. مصرف هر پارت هم خودکار از موجودی کم می‌شود.</p>
      </div>}
      <div className="card">
        <h2>باقی‌مانده مواد <InfoTip>
          <p><b>موجودی</b>: هرچه وارد انبار شده (خرید و ضایعات برگشتی) منهای هرچه در پارت‌ها مصرف شده.</p>
          <p><b>میانگین قیمت</b>: میانگین قیمتِ خریدها. خریدی که بیشتر بوده، بیشتر اثر دارد. مصرف کردن، میانگین را عوض نمی‌کند.</p>
          <p><b>ارزش موجودی</b>: موجودی را در میانگین قیمت می‌زنیم.</p>
          {example && <p>{example}</p>}
        </InfoTip></h2>
        <div className="tablewrap scroll-box">
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
        <div className="tablewrap scroll-box">
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
