import { useState } from 'react'
import { formatToman, overheadPerKg, extrasPerKg, type Catalog, type CostLine } from '../core'
import type { Update } from '../store'
import { NumInput, TextInput, Toman } from '../ui'

function Lines({ title, help, lines, onChange }: { title: string; help: string; lines: CostLine[]; onChange: (l: CostLine[]) => void }) {
  // the row that was just added gets the cursor, so the name can be typed right away
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const add = () => { setFocusIdx(lines.length); onChange([...lines, { name: '', amount: 0 }]) }
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="btn ghost" style={{ marginInlineStart: 'auto' }} onClick={add}>＋ افزودن ردیف</button>
      </div>
      <p className="muted help">{help}</p>
      <div className="tablewrap">
        <table>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={3} className="muted">هنوز ردیفی نیست. دکمه‌ی «افزودن ردیف» را (بالا یا پایین جدول) بزنید، بعد اسم هزینه و مبلغش را بنویسید.</td></tr>}
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input value={l.name} placeholder="نام هزینه را بنویسید…" autoFocus={i === focusIdx} onChange={e => onChange(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="n"><NumInput unit="تومان" money value={l.amount} onChange={v => onChange(lines.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} /></td>
                <td><button className="btn danger" onClick={() => onChange(lines.filter((_, j) => j !== i))}>حذف</button></td>
              </tr>
            ))}
            <tr><td><b>جمع</b></td><td className="n"><b><Toman v={lines.reduce((s, l) => s + l.amount, 0)} /></b></td><td /></tr>
          </tbody>
        </table>
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={add}>＋ افزودن ردیف</button>
    </div>
  )
}

function StageCosts({ catalog, update }: { catalog: Catalog; update: Update }) {
  const recipes = Object.values(catalog.recipes)
  return (
    <div className="card">
      <h2>هزینه‌ی هر مرحله‌ی ساخت (سربار)</h2>
      <p className="muted help">در کارخانه هر مرحله هزینه‌ی خودش را دارد (مثلاً ساختن PRP و بعد ساختن پروفایل). برای هر مرحله بنویسید به ازای <b>هر کیلو</b> که در آن مرحله ساخته می‌شود چند تومان هزینه می‌شود. این مبلغ به قیمت تمام‌شده اضافه می‌شود. اگر هزینه‌ای ندارد، صفر بگذارید.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>مرحله (فرمول)</th><th className="n">هزینه‌ی هر کیلو (تومان)</th></tr></thead>
          <tbody>
            {recipes.map(r => (
              <tr key={r.id}>
                <td className="mat-name">{r.name}{r.id === 'scf' && <div className="muted hint">هزینه‌ی خرید هر کیلو پلیمر: مالیات ۹٪ + کرایه + خردکردن. اگر قیمت پلیمر عوض شد، این عدد را هم درست کن: «قیمت پلیمر × ۰٫۰۹ + ۱٬۵۰۷ + ۲۴٬۰۰۰». (اکسل: ۴۳٬۶۶۹)</div>}</td>
                <td className="n">
                  <NumInput unit="تومان" money value={r.overheadPerKg ?? 0} onChange={v => update(s => {
                    if (v && v > 0) s.catalog.recipes[r.id].overheadPerKg = v
                    else delete s.catalog.recipes[r.id].overheadPerKg
                  })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Costs({ catalog, update }: { catalog: Catalog; update: Update }) {
  const c = catalog.config
  const oh = overheadPerKg(c)
  const addTariff = () => update(s => { s.catalog.tariffs.push({ id: `t-${Date.now().toString(36)}`, name: 'تعرفه جدید', marginPct: 20 }) })
  return (
    <>
      <StageCosts catalog={catalog} update={update} />
      <Lines title="هزینه‌های ثابتِ هر ماه (برق، حقوق، اجاره و مانند آن)" help="هر ماه این پول‌ها را می‌دهید، چه کار کنید چه نکنید. اسم هر هزینه و مبلغ یک ماهش را بنویسید. برنامه این مبلغ را بین کیلوهایی که در ماه می‌سازید پخش می‌کند تا ببیند روی هر کیلو چقدر می‌افتد." lines={c.monthlyCosts} onChange={l => update(s => { s.catalog.config.monthlyCosts = l })} />
      <div className="card">
        <p className="muted help">عدد «چند کیلو در ماه» را واقعی بنویسید. هر چه بیشتر بسازید، سهم هر کیلو از هزینه‌های ثابت کمتر می‌شود، و برعکس. دو کادر کناری فقط نتیجه را نشان می‌دهند و خودتان چیزی در آن‌ها نمی‌نویسید.</p>
        <div className="row">
          <label>چند کیلو در این ماه ساخته‌اید؟<NumInput unit="کیلو" value={c.monthlyProductionKg} onChange={v => update(s => { s.catalog.config.monthlyProductionKg = v ?? 0 })} /></label>
          <div className="kpi"><span className="muted">سهم هر کیلو از این هزینه‌ها</span><b>{formatToman(oh.value)} تومان</b></div>
          <div className="kpi"><span className="muted">سهم هر ۱۰۰ کیلو</span><b>{formatToman(oh.value * 100)} تومان</b></div>
        </div>
        {oh.warning && <div className="alert">{oh.warning}</div>}
      </div>
      <Lines title="هزینه‌هایی که برای هر پارت پرداخت می‌شود (کرایه، انبارداری، باسکول)" help="این‌ها را فقط وقتی یک پارت می‌سازید یا جابه‌جا می‌کنید می‌دهید. مبلغ یک بار پارت را بنویسید؛ برنامه آن را بین کیلوهای همان پارت پخش می‌کند." lines={c.perBatchCosts} onChange={l => update(s => { s.catalog.config.perBatchCosts = l })} />
      <div className="card">
        <p className="muted help">
          «یک پارت معمولی» برای پخش کردن هزینه‌های هر پارت لازم است. «دورریز» یعنی چند درصد مواد هدر می‌رود و خرجش روی قیمت می‌آید. «رُند کردن» قیمت‌ها را به عدد گرد می‌رساند (مثلاً ۱۰٬۰۰۰). «هشدار» وقتی است که کارگر در پارت بیشتر یا کمتر از فرمول بریزد.
        </p>
        <div className="row">
          <label>یک پارت معمولی چند کیلو است؟<NumInput unit="کیلو" value={c.batchKg} onChange={v => update(s => { s.catalog.config.batchKg = v ?? 100 })} /></label>
          <div className="kpi"><span className="muted">سهم هر کیلو از کرایه و انبارداری</span><b>{formatToman(extrasPerKg(c))} تومان</b></div>
          <label>چند درصد مواد دورریز می‌شود؟<NumInput unit="٪" value={c.wastePct} decimals={2} onChange={v => update(s => { s.catalog.config.wastePct = Math.min(Math.max(v ?? 0, 0), 99) })} /></label>
          <label>قیمت‌ها به نزدیک‌ترین … تومان برسند<NumInput unit="تومان" money value={c.roundTo} onChange={v => update(s => { s.catalog.config.roundTo = v ?? 1 })} /></label>
          <label>اگر مشتری با چک دو ماهه بخرد، قیمت چند درصد بیشتر شود؟<NumInput unit="٪" value={c.chequeSurchargePct ?? 0} decimals={2} onChange={v => update(s => { s.catalog.config.chequeSurchargePct = v ?? 0 })} /></label>
          <label>اگر مقدار یک ماده در پارت از فرمول بیشتر از … درصد فرق کند، هشدار بده<NumInput unit="٪" value={c.defaultTolerancePct} decimals={2} onChange={v => update(s => { s.catalog.config.defaultTolerancePct = v ?? 5 })} /></label>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>تعرفه‌ها: چند درصد سود می‌خواهید؟</h2>
          <button className="btn ghost" style={{ marginInlineStart: 'auto' }} onClick={addTariff}>＋ افزودن تعرفه</button>
        </div>
        <p className="muted help">هر تعرفه یک نوع فروش است (مثلاً عمده یا خرده) و درصد سودش را می‌نویسید. در «لیست قیمت» می‌توانید بین آن‌ها جابه‌جا شوید. سود روی قیمت تمام‌شده اضافه می‌شود.</p>
        <div className="tablewrap">
          <table>
            <tbody>
              {catalog.tariffs.map((t, i) => (
                <tr key={t.id}>
                  <td><TextInput required value={t.name} onChange={v => update(s => { s.catalog.tariffs[i].name = v })} /></td>
                  <td className="n"><NumInput unit="٪" value={t.marginPct} decimals={2} onChange={v => update(s => { s.catalog.tariffs[i].marginPct = v ?? 0 })} /></td>
                  <td><button className="btn danger" disabled={catalog.tariffs.length < 2} onClick={() => update(s => { s.catalog.tariffs.splice(i, 1) })}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={addTariff}>＋ افزودن تعرفه</button>
      </div>
    </>
  )
}
