import { useState } from 'react'
import { recipeUsage, type Catalog } from '../core'
import type { Update } from '../store'
import { InfoTip, NumInput, Tag, TextInput } from '../ui'

const emptyForm = { name: '', code: '', widthMm: null as number | null, thicknessMm: null as number | null, weightPer3mG: null as number | null, colorable: true }

export function Products({ catalog, update }: { catalog: Catalog; update: Update }) {
  // Intermediate formulas (like PRP) are used inside other formulas, not as a product's own formula.
  const isSemi = (id: string) => catalog.recipes[id].kind === 'semi' || (!catalog.recipes[id].kind && recipeUsage(id, catalog).recipes.length > 0)
  const recipes = Object.values(catalog.recipes).filter(r => !isSemi(r.id))
  const [form, setForm] = useState(emptyForm)
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  // Weight can be typed per 3 m or per 1 m. It is always stored per 3 m, so prices do not depend on the choice.
  const [per, setPer] = useState<3 | 1>(3)
  const toShown = (w: number | null) => (w == null ? null : per === 1 ? Math.round((w / 3) * 100) / 100 : w)
  const fromShown = (v: number | null) => (v == null ? null : Math.round((per === 1 ? v * 3 : v) * 1000) / 1000)
  const [err, setErr] = useState('')

  const add = () => {
    const name = form.name.trim()
    if (!name) return setErr('نام محصول را بنویسید')
    if (Object.values(catalog.products).some(p => p.name.toLowerCase() === name.toLowerCase())) return setErr('محصولی با این نام قبلاً هست')
    if (!recipeId) return setErr('یک فرمول پایه انتخاب کنید')
    update(s => {
      const id = `p-${Date.now().toString(36)}`
      s.catalog.products[id] = {
        id, name, code: form.code.trim(), usages: [], weightPer3mG: form.weightPer3mG, baseRecipeId: recipeId, colorable: form.colorable,
        ...(form.widthMm != null ? { widthMm: form.widthMm } : {}),
        ...(form.thicknessMm != null ? { thicknessMm: form.thicknessMm } : {}),
      }
    })
    setForm(emptyForm)
    setErr('')
  }

  return (
    <>
      <div className="card">
        <h2>محصولات و وزن ({Object.keys(catalog.products).length} محصول)</h2>
        <div className="row">
          <div>
            <span className="field-label">وزن را بر اساس چه طولی وارد می‌کنید؟</span>
            <div className="seg" role="group" aria-label="طول وزن">
              <button aria-pressed={per === 3} onClick={() => setPer(3)}>شاخه ۳ متری</button>
              <button aria-pressed={per === 1} onClick={() => setPer(1)}>۱ متر</button>
            </div>
          </div>
          <span className="muted">در هر دو حالت یک عدد ذخیره می‌شود (وزن ۳ متر = ۳ × وزن ۱ متر)، پس محاسبات هیچ فرقی نمی‌کند.</span>
          <InfoTip>
            <p><b>وزن:</b> می‌توانید وزن را برای ۳ متر یا برای ۱ متر وارد کنید. محاسبات فرقی نمی‌کند، چون همیشه یک عدد (وزن ۳ متر) ذخیره می‌شود.</p>
            <p>اگر وزن ۱ متری گرد نباشد (مثلاً ۱۰۳۶٫۶۷)، در ۳ ضرب می‌شود و ممکن است وزن ۳ متر چند صدم گرم فرق کند. در قیمت اثری ندارد.</p>
            <p><b>عرض:</b> برای قیمت متر مربع استفاده می‌شود (قیمت هر متر ÷ عرض به متر). اگر عرض پوششی واقعی با عرض اسمی فرق دارد، همین‌جا عوضش کنید.</p>
            <p>برای محصولات توخالی یا مکعبی (مثل Off، IMP و Coffin) قیمت متر مربع با سطح پوشش یکی نیست.</p>
          </InfoTip>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>نام</th><th>کد</th><th className="n">عرض (mm)</th><th className="n">ضخامت (mm)</th><th className="n">وزن {per === 1 ? '۱ متر' : '۳ متر'} (گرم)</th><th>فرمول پایه</th><th>رنگ‌پذیر</th><th /></tr></thead>
            <tbody>
              {Object.values(catalog.products).map(p => (
                <tr key={p.id}>
                  <td><TextInput required width={130} value={p.name} onChange={v => update(s => { s.catalog.products[p.id].name = v })} /></td>
                  <td><TextInput ltr width={90} value={p.code} onChange={v => update(s => { s.catalog.products[p.id].code = v })} /></td>
                  <td className="n"><NumInput value={p.widthMm ?? null} onChange={v => update(s => { if (v == null) delete s.catalog.products[p.id].widthMm; else s.catalog.products[p.id].widthMm = v })} /></td>
                  <td className="n"><NumInput value={p.thicknessMm ?? null} onChange={v => update(s => { if (v == null) delete s.catalog.products[p.id].thicknessMm; else s.catalog.products[p.id].thicknessMm = v })} /></td>
                  <td className="n"><NumInput money={per === 3} decimals={2} value={toShown(p.weightPer3mG)} onChange={v => update(s => { s.catalog.products[p.id].weightPer3mG = fromShown(v) })} /></td>
                  <td>
                    <select value={p.baseRecipeId} onChange={e => update(s => { s.catalog.products[p.id].baseRecipeId = e.target.value })}>
                      {Object.values(catalog.recipes).filter(r => !isSemi(r.id) || r.id === p.baseRecipeId).map(r => <option key={r.id} value={r.id}>{r.name}{r.custom ? ' (آزمایشی)' : ''}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={p.colorable} onChange={e => update(s => { s.catalog.products[p.id].colorable = e.target.checked })} aria-label="رنگ‌پذیر" style={{ minWidth: 0 }} /></td>
                  <td>
                    {p.weightPer3mG == null && p.colorable && <><Tag kind="err">وزن وارد نشده</Tag>{' '}</>}
                    {confirmDel === p.id ? (
                      <>
                        <button className="btn danger" onClick={() => { update(s => { delete s.catalog.products[p.id] }); setConfirmDel(null) }}>حذف شود</button>{' '}
                        <button className="btn ghost" onClick={() => setConfirmDel(null)}>نه</button>
                      </>
                    ) : (
                      <button className="btn danger" onClick={() => setConfirmDel(p.id)}>حذف</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          با حذف یک محصول، فقط از لیست قیمت و پارت‌های جدید برداشته می‌شود. پارت‌هایی که قبلاً با آن ثبت شده‌اند و موجودی انبار دست نمی‌خورند.
        </p>
      </div>

      <div className="card">
        <h2>محصول جدید</h2>
        <div className="row">
          <label>نام<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً Flex2" /></label>
          <label>کد<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="مثلاً FD150" style={{ direction: 'ltr' }} /></label>
          <label>عرض (mm)<NumInput value={form.widthMm} onChange={v => setForm({ ...form, widthMm: v })} /></label>
          <label>ضخامت (mm)<NumInput value={form.thicknessMm} onChange={v => setForm({ ...form, thicknessMm: v })} /></label>
          <label>وزن {per === 1 ? '۱ متر' : '۳ متر'} (گرم)<NumInput money={per === 3} decimals={2} value={toShown(form.weightPer3mG)} onChange={v => setForm({ ...form, weightPer3mG: fromShown(v) })} /></label>
          <label>فرمول پایه
            <select value={recipeId} onChange={e => setRecipeId(e.target.value)}>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={form.colorable} onChange={e => setForm({ ...form, colorable: e.target.checked })} /> رنگ‌پذیر</label>
          <button className="btn" onClick={add}>افزودن محصول</button>
        </div>
        {err && <div className="alert err">{err}</div>}
        <p className="muted">محصول جدید بلافاصله در لیست قیمت می‌آید. اگر وزن را خالی بگذارید، قیمت هر متر و شاخه حساب نمی‌شود تا وزن را وارد کنید.</p>
      </div>
    </>
  )
}
