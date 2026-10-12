import { useMemo, useState, type ReactNode } from 'react'
import { calcCsv, explainPrice, faNum, formatKg, formatToman, toFa, type Catalog, type Check, type Explain } from '../core'
import { DEMO } from '../demo'
import { Bill, InfoTip, Kpi, Tag } from '../ui'
import { kpiTip } from './KpiTips'

const money = (n: number | null) => formatToman(n)
const kg = (n: number) => formatKg(n, 3)
const t = (n: number | null) => `${money(n)} تومان`

function Step(props: { n: number; title: string; what: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <li className="calc-step">
      <span className="step-num" aria-hidden="true">{toFa(props.n)}</span>
      <div className="step-body">
        <b>{props.title}</b>
        <p className="calc-what">{props.what}</p>
        {props.children}
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
  L.push(`۲) با دورریز ${e.wastePct}٪ = ${money(e.materialPerKg)} ÷ (۱ − ${e.wastePct / 100}) = ${money(e.afterWastePerKg)}`)
  L.push(`۳) هزینه‌های ثابت کارخانه برای هر کیلو = ${money(e.monthlyCostTotal)} ÷ ${money(e.monthlyProductionKg)} = ${money(e.overheadPerKg)}`)
  L.push(`۴) کرایه و انبارداری برای هر کیلو = ${money(e.perBatchCostTotal)} ÷ ${kg(e.batchKg)} = ${money(e.extrasPerKg)}`)
  L.push(`۵) خرج ساخت یک کیلو (قیمت تمام‌شده) = ${money(e.costPerKg)}`)
  L.push(`۶) قیمت فروش هر کیلو = ${money(e.costPerKg)} × (۱ + ${e.marginPct / 100}) = ${money(e.salePerKg)}`)
  L.push(`۷) هر متر = ${money(e.perMeter)} / شاخه ${e.lengthM} متری = ${money(e.perStick)} (وزن ${e.weightG ?? '—'} گرم)`)
  L.push(`۸) هر متر مربع = ${money(e.perMeterRaw)} ÷ ${e.widthM ?? '—'} متر = ${money(e.perSqm)}`)
  const bad = e.checks.filter(c => !c.ok)
  if (bad.length) { L.push('', 'هشدارها:'); for (const c of bad) L.push(`  - ${c.title}: ${c.detail}`) }
  return L.join('\n')
}

const ICON: Record<Check['level'], string> = { ok: '✓', warn: '!', error: '✕' }

export function Calc({ catalog, go }: { catalog: Catalog; go?: (tab: string) => void }) {
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
        <h2>محاسبات <InfoTip><p>اینجا می‌بینید قیمت هر محصول مرحله‌به‌مرحله چطور درمی‌آید.</p><p>اگر عددی به نظرتان درست نبود، دکمه‌ی «کپی خلاصه‌ی محاسبه» را بزنید و برای ما بفرستید.</p></InfoTip></h2>
        <p style={{ margin: '0 0 12px' }}>
          قیمت هر محصول در ۱۰ قدم ساخته می‌شود. محصول، رنگ و تعرفه را انتخاب کنید و از بالا به پایین بخوانید.
          هر قدم می‌گوید چه کار می‌کنیم و عددهای واقعی را مثل یک صورت‌حساب نشان می‌دهد.
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
          <Kpi label="قیمت تمام‌شده هر کیلو" tip={kpiTip('cost', e)}>{money(e.costPerKg)}</Kpi>
          <Kpi label="قیمت فروش هر کیلو" tip={kpiTip('sale', e)}>{money(e.salePerKg)}</Kpi>
          <Kpi label="قیمت هر متر" tip={kpiTip('meter', e)}>{money(e.perMeter)}</Kpi>
          <Kpi label="قیمت هر متر مربع" tip={kpiTip('sqm', e)}>{money(e.perSqm)}</Kpi>
          <Kpi label={`قیمت شاخه (${faNum(e.lengthM)} متری)`} tip={kpiTip('stick', e)} accent="var(--accent)">{money(e.perStick)}</Kpi>
        </div>
      </div>

      <div className="card">
        <h2>بررسی خودکار <Tag kind={errors > 0 ? 'err' : bad.length > 0 ? 'warn' : 'ok'}>{errors > 0 ? `${toFa(errors)} خطا` : bad.length > 0 ? `${toFa(bad.length)} هشدار` : 'همه چیز درست است'}</Tag></h2>
        <ul className="checks">
          {e.checks.map(c => (
            <li key={c.title} className={`check-row ${c.level}`}>
              <span className="check-ico" aria-hidden="true">{ICON[c.level]}</span>
              <div><b>{c.title}</b><div className="muted">{c.detail}</div>{!c.ok && c.tab && go && <button className="btn ghost link" onClick={() => go(c.tab!)}>بروید به «{c.tab}» ←</button>}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>قدم‌ها</h2>
        <ol className="steps calc-steps">
          <Step n={1} title="از چه چیزهایی ساخته می‌شود؟"
            what="هر محصول از دو فرمول ساخته می‌شود: فرمول خودش و فرمول رنگ. این دو را کنار هم می‌گذاریم.">
            <div className="tablewrap"><table>
              <thead><tr><th>ماده</th><th className="n">کیلو</th></tr></thead>
              <tbody>
                {e.items.map((i, k) => <tr key={k}><td>{i.label}</td><td className="n">{kg(i.kg)}</td></tr>)}
                <tr><td><b>جمع (وزن این پارت)</b></td><td className="n"><b>{kg(e.totalKg)}</b></td></tr>
              </tbody>
            </table></div>
          </Step>

          <Step n={2} title="هر ماده چقدر خرج دارد؟"
            what={sub.length > 0
              ? 'بعضی چیزها خودشان از چند ماده ساخته شده‌اند (مثل PRP). آن‌ها را به ماده‌های اصلی‌شان باز می‌کنیم. بعد برای هر ماده می‌بینیم چند کیلو لازم است و کیلویی چند تومان است.'
              : 'برای هر ماده می‌بینیم چند کیلو لازم است و کیلویی چند تومان است.'}
            note={e.missingPrices.length > 0 ? <span className="bad">قیمت این مواد نوشته نشده و در حساب نیامده: {e.missingPrices.join('، ')}</span> : undefined}>
            {sub.map(i => (
              <p key={i.label} className="calc-aside">
                {i.label}: در این پارت {kg(i.kg)} کیلو داریم. این ماده خودش در پارت‌های {kg(i.recipeTotalKg!)} کیلویی ساخته می‌شود،
                پس از هر ماده‌ی آن حدود {toFa((i.kg / i.recipeTotalKg!).toFixed(2)).replace('.', '٫')} برابر وزنش را برمی‌داریم.
              </p>
            ))}
            <div className="tablewrap"><table>
              <thead><tr><th>ماده</th><th className="n">چند کیلو</th><th className="n">قیمت یک کیلو</th><th className="n">خرج</th></tr></thead>
              <tbody>
                {e.rows.map(r => (
                  <tr key={r.materialId}>
                    <td>{r.name}</td><td className="n">{kg(r.kg)}</td>
                    <td className="n">{r.pricePerKg == null ? <Tag kind="err">نوشته نشده</Tag> : money(r.pricePerKg)}</td>
                    <td className="n">{r.cost == null ? '—' : money(r.cost)}</td>
                  </tr>
                ))}
                <tr><td><b>جمع</b></td><td className="n"><b>{kg(e.totalKg)}</b></td><td /><td className="n"><b>{money(e.materialCost)}</b></td></tr>
              </tbody>
            </table></div>
          </Step>

          <Step n={3} title="مواد یک کیلو چقدر خرج دارد؟"
            what="پول همه‌ی مواد را بین وزن پارت پخش می‌کنیم تا معلوم شود مواد یک کیلو چند تومان می‌شود.">
            <Bill
              rows={[{ label: 'پول همه‌ی مواد', value: t(e.materialCost) }, { label: 'وزن پارت', value: `${kg(e.totalKg)} کیلو` }]}
              total={{ label: 'مواد یک کیلو', value: t(e.materialPerKg) }} />
          </Step>

          <Step n={4} title="دورریز مواد (ضایعات)"
            what={`در تولید کمی از مواد دورریز می‌شود (الان ${toFa(e.wastePct)}٪). پول این دورریز را روی محصولِ سالم می‌گذاریم.`}>
            <Bill
              rows={[{ label: 'مواد یک کیلو', value: t(e.materialPerKg) }, { label: 'اضافه برای دورریز', value: t(e.wasteExtraPerKg) }]}
              total={{ label: 'مواد یک کیلو، با دورریز', value: t(e.afterWastePerKg) }} />
          </Step>

          <Step n={5} title="هزینه‌های ثابت کارخانه"
            what="برق، حقوق، اجاره و مانند آن هر ماه پرداخت می‌شود، چه چیزی بسازیم چه نسازیم. آن را بین همه‌ی کیلوهایی که همان ماه ساخته‌ایم پخش می‌کنیم."
            note={e.overheadPerKg === 0 ? <span className="bad">این هنوز صفر است، چون هزینه‌های ماهانه یا کیلوی تولید ماه را ننوشته‌اید.</span> : undefined}>
            <Bill
              rows={[{ label: 'هزینه‌های ثابت یک ماه', value: t(e.monthlyCostTotal) }, { label: 'کیلوی ساخته‌شده در ماه', value: `${money(e.monthlyProductionKg)} کیلو` }]}
              total={{ label: 'سهم هر کیلو', value: t(e.overheadPerKg) }} />
          </Step>

          <Step n={6} title="کرایه و انبارداری"
            what="هزینه‌هایی که برای هر پارت یک بار پرداخت می‌شود (کرایه، انبارداری، باسکول) را بین وزن پارت پخش می‌کنیم.">
            <Bill
              rows={[{ label: 'هزینه‌ی یک پارت', value: t(e.perBatchCostTotal) }, { label: 'وزن یک پارت', value: `${kg(e.batchKg)} کیلو` }]}
              total={{ label: 'سهم هر کیلو', value: t(e.extrasPerKg) }} />
          </Step>

          <Step n={7} title="خرج ساخت یک کیلو (قیمت تمام‌شده)"
            what="سه عدد قبلی را جمع می‌کنیم. این همان پولی است که کارخانه برای ساختن یک کیلو خرج می‌کند.">
            <Bill
              rows={[
                { label: 'مواد (با دورریز)', value: t(e.afterWastePerKg) },
                { label: 'هزینه‌های ثابت کارخانه', value: t(e.overheadPerKg) },
                { label: 'کرایه و انبارداری', value: t(e.extrasPerKg) },
              ]}
              total={{ label: 'خرج ساخت یک کیلو', value: t(e.costPerKg) }} />
          </Step>

          <Step n={8} title="سود و قیمت فروش یک کیلو"
            what="سود را روی خرج ساخت می‌گذاریم.">
            <Bill
              rows={[{ label: 'خرج ساخت یک کیلو', value: t(e.costPerKg) }, { label: `سود (${toFa(e.marginPct)}٪ از آن)`, value: t(e.profitPerKg) }]}
              total={{ label: 'قیمت فروش یک کیلو', value: t(e.salePerKg) }} />
          </Step>

          <Step n={9} title="قیمت یک شاخه و یک متر"
            what={`قیمت یک شاخه از روی وزنش درمی‌آید: هر کیلو چند تومان است و شاخه چند کیلو وزن دارد. بعد قیمت شاخه را بین متر‌هایش (${faNum(e.lengthM)} متر) تقسیم می‌کنیم تا قیمت یک متر دربیاید.`}
            note={e.weightG != null ? `هر دو عدد را به نزدیک‌ترین ${money(e.roundStep)} تومان رسانده‌ایم. چون هر کدام جدا گرد می‌شوند، ممکن است قیمت متر ضرب‌در طول شاخه، چند ده تومان با قیمت شاخه فرق کند. این خطا نیست.` : undefined}>
            {e.weightG == null || e.perStickRaw == null ? (
              <p className="bad">وزن این محصول را هنوز ننوشته‌اید، پس قیمت شاخه و متر معلوم نمی‌شود. در تب «محصولات» وزنش را بنویسید.</p>
            ) : (
              <Bill
                rows={[
                  { label: 'قیمت یک کیلو', value: t(e.salePerKg) },
                  { label: 'وزن یک شاخه', value: `${kg(e.weightG / 1000)} کیلو` },
                  { label: 'قیمت یک شاخه', value: t(e.perStick) },
                  { label: 'طول شاخه', value: `${faNum(e.lengthM)} متر` },
                ]}
                total={{ label: 'قیمت یک متر', value: t(e.perMeter) }} />
            )}
          </Step>

          <Step n={10} title="قیمت یک متر مربع"
            what="برای پوشاندن یک متر مربع، چند متر از این محصول لازم است؟ هرچه محصول باریک‌تر باشد، متر بیشتری می‌خواهد. پس قیمت یک متر را در همین تعداد متر حساب می‌کنیم."
            note="برای محصولات توخالی یا مکعبی (مثل Off، IMP و Coffin) قیمت متر مربع با سطح پوشش یکی نیست.">
            {e.widthM == null || e.perMeterRaw == null ? (
              <p className="bad">برای این قیمت، هم وزن و هم عرض محصول لازم است. عرض و وزن را در تب «محصولات» بنویسید.</p>
            ) : (
              <Bill
                rows={[
                  { label: 'عرض محصول', value: `${kg(e.widthM)} متر` },
                  { label: 'متر لازم برای یک متر مربع', value: `${faNum(Math.round((1 / e.widthM) * 100) / 100)} متر` },
                  { label: 'قیمت یک متر', value: t(e.perMeterRaw) },
                ]}
                total={{ label: 'قیمت یک متر مربع', value: t(e.perSqm) }} />
            )}
          </Step>
        </ol>
      </div>
    </>
  )
}
