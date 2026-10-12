import { useMemo, useState, type ReactNode } from 'react'
import { calcCsv, explainPrice, faNum, formatKg, formatToman, toFa, type Catalog, type Check, type Explain } from '../core'
import { DEMO } from '../demo'
import { InfoTip, Tag } from '../ui'

const money = (n: number | null) => formatToman(n)
const kg = (n: number) => formatKg(n, 3)
const pct = (n: number) => toFa(String(Math.round(n * 100) / 100)).replace('.', '٫')
/** Numbers read left-to-right even inside Persian text. */
const N = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="num-inline">{children}</bdi>

function Step(props: { n: number; title: string; what: ReactNode; calc?: ReactNode; result: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <li className="calc-step">
      <span className="step-num" aria-hidden="true">{toFa(props.n)}</span>
      <div className="step-body">
        <b>{props.title}</b>
        <div className="calc-line"><span className="calc-tag">چه کار می‌کنیم؟</span> {props.what}</div>
        {props.calc && <div className="calc-line"><span className="calc-tag">با عددها</span> {props.calc}</div>}
        {props.children}
        <div className="calc-result"><span>جواب</span> {props.result}</div>
        {props.note && <div className="calc-note">{props.note}</div>}
      </div>
    </li>
  )
}

function summaryText(e: Explain): string {
  const L: string[] = []
  L.push(`محاسبه‌ی قیمت: ${e.product.name}${e.colorName ? ` / رنگ ${e.colorName}` : ''} / تعرفه ${e.tariff.name} (${e.marginPct}٪ سود)`)
  L.push('')
  L.push('مواد خام در پارت:')
  for (const r of e.rows) L.push(`  ${r.name}: ${kg(r.kg)} کیلو × ${r.pricePerKg == null ? 'بدون قیمت' : money(r.pricePerKg)} = ${r.cost == null ? '—' : money(r.cost)}`)
  L.push(`۱) هزینه مواد هر کیلو = ${money(e.materialCost)} ÷ ${kg(e.totalKg)} = ${money(e.materialPerKg)}`)
  L.push(`۲) با ضایعات ${e.wastePct}٪ = ${money(e.materialPerKg)} ÷ (۱ − ${e.wastePct / 100}) = ${money(e.afterWastePerKg)}`)
  L.push(`۳) سربار هر کیلو = ${money(e.monthlyCostTotal)} ÷ ${money(e.monthlyProductionKg)} = ${money(e.overheadPerKg)}`)
  L.push(`۴) کرایه و انبارداری هر کیلو = ${money(e.perBatchCostTotal)} ÷ ${kg(e.batchKg)} = ${money(e.extrasPerKg)}`)
  L.push(`۵) قیمت تمام‌شده هر کیلو = ${money(e.costPerKg)}`)
  L.push(`۶) قیمت فروش هر کیلو = ${money(e.costPerKg)} × (۱ + ${e.marginPct / 100}) = ${money(e.salePerKg)}`)
  L.push(`۷) هر متر = ${money(e.perMeter)} / شاخه ${e.lengthM} متری = ${money(e.perStick)} (وزن ${e.weightG ?? '—'} گرم)`)
  L.push(`۸) هر متر مربع = ${money(e.perMeterRaw)} ÷ ${e.widthM ?? '—'} متر = ${money(e.perSqm)}`)
  const bad = e.checks.filter(c => !c.ok)
  if (bad.length) { L.push('', 'هشدارها:'); for (const c of bad) L.push(`  - ${c.title}: ${c.detail}`) }
  return L.join('\n')
}

const ICON: Record<Check['level'], string> = { ok: '✓', warn: '!', error: '✕' }

export function Calc({ catalog }: { catalog: Catalog }) {
  const products = Object.values(catalog.products)
  const colors = Object.values(catalog.colors)
  const [productId, setProductId] = useState(products.find(p => p.id === 'flex')?.id ?? products[0]?.id ?? '')
  const [colorId, setColorId] = useState(colors[0]?.id ?? '')
  const [tariffId, setTariffId] = useState(catalog.tariffs[0]?.id ?? '')
  const [copied, setCopied] = useState(false)
  const [showText, setShowText] = useState(false)

  const product = catalog.products[productId] ?? products[0]
  const tariff = catalog.tariffs.find(t => t.id === tariffId) ?? catalog.tariffs[0]
  const e = useMemo(
    () => (product && tariff ? explainPrice(product, product.colorable ? colorId || null : null, tariff, catalog) : null),
    [catalog, product, colorId, tariff],
  )
  if (!e || !product) return <div className="card">ابتدا یک محصول و یک تعرفه تعریف کنید.</div>

  const text = summaryText(e)
  const bad = e.checks.filter(c => !c.ok)
  const errors = bad.filter(c => c.level === 'error').length
  const sub = e.items.filter(i => i.recipeTotalKg != null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShowText(true) // clipboard blocked: show the text to copy by hand
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([calcCsv(catalog, product.colorable ? colorId || null : null, tariff)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `calculations-${tariff.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="card">
        <h2>محاسبات <InfoTip><p>اینجا می‌بینید قیمت هر محصول قدم‌به‌قدم چطور حساب می‌شود.</p><p>اگر عددی غلط به نظر رسید، «کپی خلاصه‌ی محاسبه» را بزنید و برای ما بفرستید.</p></InfoTip></h2>
        <p style={{ margin: '0 0 12px' }}>
          قیمت هر محصول در ۱۰ قدم ساخته می‌شود. محصول، رنگ و تعرفه را انتخاب کنید و از بالا به پایین بخوانید.
          هر قدم می‌گوید چه کار می‌کنیم، با چه عددهایی، و جوابش چیست.
        </p>
        <div className="row">
          <label>محصول
            <select value={product.id} onChange={ev => setProductId(ev.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {product.colorable && (
            <label>رنگ
              <select value={colorId} onChange={ev => setColorId(ev.target.value)}>
                {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label>تعرفه
            <select value={tariff.id} onChange={ev => setTariffId(ev.target.value)}>
              {catalog.tariffs.map(t => <option key={t.id} value={t.id}>{t.name} ({toFa(t.marginPct)}٪)</option>)}
            </select>
          </label>
          <button className="btn ghost" style={{ marginTop: 18 }} onClick={copy}>{copied ? 'کپی شد' : 'کپی خلاصه‌ی محاسبه'}</button>
          {!DEMO && <button className="btn ghost" style={{ marginTop: 18 }} onClick={download}>دانلود جدول همه‌ی محصولات (CSV)</button>}
        </div>
        {showText && <textarea className="copybox" readOnly value={text} rows={12} onFocus={ev => ev.currentTarget.select()} aria-label="متن برای کپی" />}
        <div className="kpis" style={{ marginBottom: 0 }}>
          <div className="kpi"><span>قیمت تمام‌شده هر کیلو</span><b>{money(e.costPerKg)}</b></div>
          <div className="kpi"><span>قیمت فروش هر کیلو</span><b>{money(e.salePerKg)}</b></div>
          <div className="kpi"><span>قیمت هر متر</span><b>{money(e.perMeter)}</b></div>
          <div className="kpi" style={{ ['--k' as string]: 'var(--accent)' }}><span>قیمت شاخه ({faNum(e.lengthM)} متری)</span><b>{money(e.perStick)}</b></div>
        </div>
      </div>

      <div className="card">
        <h2>بررسی خودکار <Tag kind={errors > 0 ? 'err' : bad.length > 0 ? 'warn' : 'ok'}>{errors > 0 ? `${toFa(errors)} خطا` : bad.length > 0 ? `${toFa(bad.length)} هشدار` : 'همه چیز درست است'}</Tag></h2>
        <ul className="checks">
          {e.checks.map(c => (
            <li key={c.title} className={`check-row ${c.level}`}>
              <span className="check-ico" aria-hidden="true">{ICON[c.level]}</span>
              <div><b>{c.title}</b><div className="muted">{c.detail}</div></div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>قدم‌های محاسبه</h2>
        <ol className="steps calc-steps">
          <Step n={1} title="اجزای فرمول"
            what="هر محصول از دو فرمول ساخته می‌شود: فرمول پایه و فرمول رنگ. این دو را کنار هم می‌گذاریم."
            result={<>وزن این پارت <N>{kg(e.totalKg)}</N> کیلو است</>}>
            <div className="tablewrap"><table>
              <thead><tr><th>جزء</th><th className="n">کیلو</th></tr></thead>
              <tbody>{e.items.map((i, k) => <tr key={k}><td>{i.label}</td><td className="n">{kg(i.kg)}</td></tr>)}</tbody>
            </table></div>
          </Step>

          <Step n={2} title="تبدیل به مواد خام و هزینه‌ی هر ماده"
            what="جزءهایی که خودشان از چند ماده ساخته شده‌اند (مثل PRP) را به ماده‌های خامشان باز می‌کنیم. بعد وزن هر ماده را در قیمت یک کیلوی آن ضرب می‌کنیم."
            calc={sub.length > 0 ? sub.map(i => <div key={i.label}>{i.label}: <N>{kg(i.kg)}</N> کیلو از <N>{kg(i.recipeTotalKg!)}</N> کیلویِ فرمولش را برمی‌داریم، یعنی <N>{toFa((i.kg / i.recipeTotalKg!).toFixed(3)).replace('.', '٫')}</N> از هر ماده‌ی آن فرمول</div>) : undefined}
            result={<>پول کل مواد این پارت: <N>{money(e.materialCost)}</N> تومان</>}
            note={e.missingPrices.length > 0 ? <span className="over">بدون قیمت (در هزینه نیامده): {e.missingPrices.join('، ')}</span> : undefined}>
            <div className="tablewrap"><table>
              <thead><tr><th>ماده‌ی خام</th><th className="n">کیلو</th><th className="n">قیمت هر کیلو</th><th className="n">هزینه</th></tr></thead>
              <tbody>
                {e.rows.map(r => (
                  <tr key={r.materialId}>
                    <td>{r.name}</td><td className="n">{kg(r.kg)}</td>
                    <td className="n">{r.pricePerKg == null ? <Tag kind="err">بدون قیمت</Tag> : money(r.pricePerKg)}</td>
                    <td className="n">{r.cost == null ? '—' : money(r.cost)}</td>
                  </tr>
                ))}
                <tr><td><b>جمع</b></td><td className="n"><b>{kg(e.totalKg)}</b></td><td /><td className="n"><b>{money(e.materialCost)}</b></td></tr>
              </tbody>
            </table></div>
          </Step>

          <Step n={3} title="هزینه‌ی مواد برای هر کیلو"
            what="پول کل مواد را بر وزن پارت تقسیم می‌کنیم تا معلوم شود مواد یک کیلو چقدر خرج دارد."
            calc={<N>{money(e.materialCost)} ÷ {kg(e.totalKg)}</N>}
            result={<>مواد هر کیلو: <N>{money(e.materialPerKg)}</N> تومان</>} />

          <Step n={4} title="سهم ضایعات"
            what="در تولید کمی از مواد ضایع می‌شود. این ضرر را روی محصول سالم می‌اندازیم. برای همین قیمت را بر «۱ منهای درصد ضایعات» تقسیم می‌کنیم."
            calc={<N>{money(e.materialPerKg)} ÷ (۱ − {pct(e.wastePct)}٪)</N>}
            result={<>مواد هر کیلو با ضایعات: <N>{money(e.afterWastePerKg)}</N> تومان (<N>{money(e.wasteExtraPerKg)}</N> بیشتر از قبل)</>} />

          <Step n={5} title="سربار کارخانه"
            what="هزینه‌های ثابت کارخانه در ماه (برق، حقوق، اجاره و مانند آن) را بین همه‌ی کیلوهایی که همان ماه تولید شده پخش می‌کنیم."
            calc={<N>{money(e.monthlyCostTotal)} ÷ {money(e.monthlyProductionKg)} کیلو</N>}
            result={<>سهم هر کیلو از هزینه‌های کارخانه: <N>{money(e.overheadPerKg)}</N> تومان</>}
            note={e.overheadPerKg === 0 ? <span className="over">سربار صفر است، چون هزینه‌ی ماهانه یا کیلوی تولید وارد نشده.</span> : undefined} />

          <Step n={6} title="کرایه، انبارداری و باسکول"
            what="هزینه‌هایی که برای هر پارت یک بار پرداخت می‌شود (کرایه، انبارداری، باسکول) را بر وزن پارت تقسیم می‌کنیم."
            calc={<N>{money(e.perBatchCostTotal)} ÷ {kg(e.batchKg)} کیلو</N>}
            result={<>سهم هر کیلو از این هزینه‌ها: <N>{money(e.extrasPerKg)}</N> تومان</>} />

          <Step n={7} title="قیمت تمام‌شده‌ی هر کیلو"
            what="سه عدد قبلی را جمع می‌کنیم. این همان پولی است که کارخانه برای ساختن یک کیلو خرج می‌کند."
            calc={<N>{money(e.afterWastePerKg)} + {money(e.overheadPerKg)} + {money(e.extrasPerKg)}</N>}
            result={<>قیمت تمام‌شده‌ی هر کیلو: <N>{money(e.costPerKg)}</N> تومان</>} />

          <Step n={8} title="سود و قیمت فروش هر کیلو"
            what="درصد سود را روی قیمت تمام‌شده اضافه می‌کنیم."
            calc={<N>{money(e.costPerKg)} × (۱ + {pct(e.marginPct)}٪)</N>}
            result={<>قیمت فروش هر کیلو: <N>{money(e.salePerKg)}</N> تومان (<N>{money(e.profitPerKg)}</N> از آن سود است)</>} />

          <Step n={9} title="قیمت هر شاخه و هر متر"
            what={<>قیمت یک کیلو را در وزن یک شاخه ضرب می‌کنیم (وزن را از گرم به کیلو برمی‌گردانیم). این قیمت شاخه است. قیمت هر متر برابر قیمت شاخه تقسیم بر طول شاخه است (این محصول <N>{faNum(e.lengthM)}</N> متری است). آخر هم گرد می‌کنیم.</>}
            calc={e.weightG == null ? undefined : (
              <>
                <div><N>{money(e.salePerKg)} × {kg(e.weightG / 1000)} کیلو = {money(e.perStickRaw)}</N></div>
                <div><N>{money(e.perStickRaw)} ÷ {faNum(e.lengthM)} متر = {money(e.perMeterRaw)}</N></div>
              </>
            )}
            result={e.weightG == null
              ? <span className="over">وزن محصول وارد نشده؛ پس قیمت شاخه و متر حساب نمی‌شود.</span>
              : <>هر شاخه {faNum(e.lengthM)} متری: <N>{money(e.perStick)}</N> تومان · هر متر: <N>{money(e.perMeter)}</N> تومان (گرد شده به مضرب <N>{money(e.roundStep)}</N>)</>}
            note="شاخه و متر هر کدام جدا از عدد دقیق گرد می‌شوند. برای همین ممکن است قیمت متر × طول شاخه، یک گامِ گرد کردن (مثلاً ۱۰۰ تومان) با قیمت شاخه فرق کند. این خطا نیست." />

          <Step n={10} title="قیمت هر متر مربع"
            what="هر متر از این محصول فقط به اندازه‌ی عرضش سطح را می‌پوشاند. پس عرض را به متر درمی‌آوریم (میلی‌متر ÷ ۱۰۰۰) و قیمت هر متر را بر آن تقسیم می‌کنیم."
            calc={e.widthM == null || e.perMeterRaw == null ? undefined : <N>{money(e.perMeterRaw)} ÷ {kg(e.widthM)} متر = {money(e.perSqmRaw)}</N>}
            result={e.perSqm == null
              ? <span className="over">برای قیمت متر مربع، هم وزن و هم عرض محصول لازم است.</span>
              : <>هر متر مربع: <N>{money(e.perSqm)}</N> تومان (برای عرض <N>{toFa(String(e.product.widthMm))}</N> میلی‌متر)</>}
            note={<>
              عرض از تب «محصولات» می‌آید؛ اگر عرض پوششی واقعی فرق دارد همان‌جا عوضش کنید.
              برای محصولات توخالی یا مکعبی (مثل Off، IMP و Coffin) قیمت متر مربع با سطح پوشش یکی نیست.
            </>} />
        </ol>
      </div>
    </>
  )
}
