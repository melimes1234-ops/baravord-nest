import { PriceGaps } from './PriceGaps'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  colorSwatch, explainPrice, extrasPerKg, faNum, flatten, stickLength, formatKg, formatToman, overheadPerKg, priceProduct, productItems, toFa,
  type Catalog, type Product, type Tariff,
} from '../core'
import { DEMO } from '../demo'
import { InfoTip, Kpi, NumInput, Swatch, Tag, Toman } from '../ui'
import { kpiTip } from './KpiTips'

/** 'FD142' -> 'FD'. Products of one series share a colour in the list. */
const seriesOf = (p: Product): string => {
  const m = p.code.match(/^[A-Z]{2}/)?.[0]
  return m === 'FC' || m === 'FD' || m === 'FB' || m === 'FT' ? m : 'other'
}
const seriesTitle = (s: string) => (s === 'other' ? 'سایر محصولات' : `سری ${s}`)

const CUSTOM = 'custom'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Opens and closes smoothly. Overflow is only released once it is fully open, so tooltips are not cut off. */
function Panel({ closing, onClosed, children }: { closing: boolean; onClosed: () => void; children: ReactNode }) {
  const [on, setOn] = useState(false)
  const [settled, setSettled] = useState(reducedMotion())
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(r)
  }, [])
  useEffect(() => {
    if (closing) setSettled(false)
  }, [closing])
  const show = on && !closing
  return (
    <div
      className={`collapse${show ? ' on' : ''}${settled ? ' settled' : ''}`}
      onTransitionEnd={e => {
        if (e.target !== e.currentTarget || e.propertyName !== 'grid-template-rows') return
        if (closing) onClosed()
        else setSettled(true)
      }}
    >
      <div className="collapse-in">{children}</div>
    </div>
  )
}

const SQM_TIP = (
  <>
    <p><b>قیمت یک متر مربع</b>: برای پوشاندن یک متر مربع چند متر از این محصول لازم است؟ مثلاً اگر عرضش ۱۴ سانتی‌متر است، حدود ۷ متر. قیمت یک متر را در همان تعداد حساب می‌کنیم.</p>
    <p>عرض محصول را از تب «محصولات» برمی‌داریم. اگر عرضِ واقعی پوشش فرق دارد (مثلاً چون تخته‌ها داخل هم می‌روند)، همان‌جا درستش کنید.</p>
    <p>برای محصولات توخالی یا مکعبی (مثل Off، IMP و Coffin) قیمت متر مربع معنی خاصی ندارد.</p>
  </>
)

export function PriceList({ catalog, onEditTariffs, go }: { catalog: Catalog; onEditTariffs?: () => void; go?: (tab: string) => void }) {
  const colors = Object.values(catalog.colors)
  const [tariffId, setTariffId] = useState(catalog.tariffs[0]?.id)
  const [customPct, setCustomPct] = useState<number | null>(20)
  const [colorId, setColorId] = useState<string>(colors[0]?.id ?? '')
  const [open, setOpen] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const toggle = (id: string) => {
    if (open === id && !closing) {
      if (reducedMotion()) setOpen(null)
      else setClosing(true)
      return
    }
    setClosing(false)
    setOpen(id)
    // once it has opened, scroll so the whole panel is visible below the sticky header
    setTimeout(() => document.getElementById(`panel-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), reducedMotion() ? 0 : 300)
  }
  const [query, setQuery] = useState('')
  // Which cost parts count in the shown prices. Only changes this view: nothing is saved.
  const [incl, setIncl] = useState({ waste: true, overhead: true, extras: true, profit: true })
  const [pay, setPay] = useState<'cash' | 'cheque'>('cash')
  const chequePct = catalog.config.chequeSurchargePct ?? 0
  const payPct = pay === 'cheque' ? chequePct : 0
  const allIn = incl.waste && incl.overhead && incl.extras && incl.profit
  const fullTariff: Tariff | undefined =
    tariffId === CUSTOM
      ? { id: CUSTOM, name: 'سود دلخواه', marginPct: Math.max(0, customPct ?? 0) }
      : catalog.tariffs.find(t => t.id === tariffId) ?? catalog.tariffs[0]
  const color = catalog.colors[colorId]
  // The same engine, fed a copy of the settings with the unticked parts switched off.
  const view = useMemo<Catalog>(
    () => ({
      ...catalog,
      // unticking the fixed costs also switches off the cost of each making step
      recipes: incl.overhead ? catalog.recipes : Object.fromEntries(Object.entries(catalog.recipes).map(([id, rc]) => [id, { ...rc, overheadPerKg: 0 }])),
      config: {
        ...catalog.config,
        wastePct: incl.waste ? catalog.config.wastePct : 0,
        monthlyCosts: incl.overhead ? catalog.config.monthlyCosts : [],
        perBatchCosts: incl.extras ? catalog.config.perBatchCosts : [],
      },
    }),
    [catalog, incl.waste, incl.overhead, incl.extras],
  )
  const tariff: Tariff | undefined = fullTariff && (incl.profit ? fullTariff : { ...fullTariff, marginPct: 0 })
  const excluded = [
    !incl.waste && 'دورریز مواد', !incl.overhead && 'هزینه‌های ثابت کارخانه', !incl.extras && 'کرایه و انبارداری', !incl.profit && 'سود',
  ].filter(Boolean) as string[]

  const groups = useMemo(() => {
    if (!tariff) return []
    const q = query.trim().toLowerCase()
    const order = ['FC', 'FD', 'FB', 'FT', 'other']
    const by = new Map<string, { p: Product; price: ReturnType<typeof priceProduct> }[]>()
    for (const p of Object.values(catalog.products)) {
      if (q && !`${p.name} ${p.code}`.toLowerCase().includes(q)) continue
      const price = priceProduct(p, p.colorable ? colorId || null : null, tariff, view, payPct)
      const s = seriesOf(p)
      by.set(s, [...(by.get(s) ?? []), { p, price }])
    }
    return order.filter(s => by.has(s)).map(s => ({ series: s, rows: by.get(s)! }))
  }, [catalog, view, colorId, tariff, query, payPct])

  if (!tariff || !fullTariff) return <div className="card">ابتدا یک تعرفه تعریف کنید.</div>
  const oh = overheadPerKg(catalog.config).value
  const ex = extrasPerKg(catalog.config)

  return (
    <div className="card">
      <PriceGaps catalog={catalog} go={go} />
      <div className="row">
        <div>
          <span className="field-label">تعرفه (درصد سود)</span>
          <div className="seg" role="group" aria-label="تعرفه">
            {catalog.tariffs.map(t => (
              <button key={t.id} aria-pressed={t.id === fullTariff.id} onClick={() => setTariffId(t.id)}>
                {t.name} · {toFa(t.marginPct)}٪
              </button>
            ))}
            <button aria-pressed={fullTariff.id === CUSTOM} onClick={() => setTariffId(CUSTOM)}>سود دلخواه</button>
          </div>
        </div>
        {chequePct > 0 && (
          <div>
            <span className="field-label">روش پرداخت مشتری</span>
            <div className="seg" role="group" aria-label="روش پرداخت">
              <button aria-pressed={pay === 'cash'} onClick={() => setPay('cash')}>نقدی</button>
              <button aria-pressed={pay === 'cheque'} onClick={() => setPay('cheque')}>چک دو ماهه · +{toFa(chequePct)}٪</button>
            </div>
          </div>
        )}
        {fullTariff.id === CUSTOM && (
          <label>
            درصد سود دلخواه
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <NumInput unit="٪" value={customPct} decimals={2} onChange={setCustomPct} placeholder="مثلاً ۲۰" />
            </span>
          </label>
        )}
        {onEditTariffs && <button className="btn ghost print-hide" onClick={onEditTariffs}>ویرایش تعرفه‌ها</button>}
        <label style={{ marginInlineStart: 'auto' }}>
          جستجوی محصول
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="نام یا کد، مثلاً Flex" />
        </label>
        {!DEMO && <button className="btn ghost print-hide" onClick={() => window.print()}>چاپ</button>}
      </div>

      <span className="field-label">رنگ محصول</span>
      <div className="chips" role="group" aria-label="رنگ" style={{ marginBottom: 14 }}>
        {colors.map(c => (
          <button key={c.id} className="chip" aria-pressed={c.id === colorId} onClick={() => setColorId(c.id)}>
            <Swatch hex={colorSwatch(c, catalog)} />
            {c.name}
          </button>
        ))}
      </div>

      <span className="field-label">چه چیزهایی در قیمت حساب شود؟</span>
      <div className="parts" role="group" aria-label="اجزای قیمت">
        <label className="part on locked-part"><input type="checkbox" checked readOnly disabled /> مواد اولیه <em>همیشه</em></label>
        <label className={`part${incl.waste ? ' on' : ''}`}><input type="checkbox" checked={incl.waste} onChange={e => setIncl({ ...incl, waste: e.target.checked })} /> دورریز مواد <em>{toFa(catalog.config.wastePct)}٪</em></label>
        <label className={`part${incl.overhead ? ' on' : ''}`}><input type="checkbox" checked={incl.overhead} onChange={e => setIncl({ ...incl, overhead: e.target.checked })} /> هزینه‌های ثابت کارخانه <em>{formatToman(oh)} برای هر کیلو</em></label>
        <label className={`part${incl.extras ? ' on' : ''}`}><input type="checkbox" checked={incl.extras} onChange={e => setIncl({ ...incl, extras: e.target.checked })} /> کرایه و انبارداری <em>{formatToman(ex)} برای هر کیلو</em></label>
        <label className={`part${incl.profit ? ' on' : ''}`}><input type="checkbox" checked={incl.profit} onChange={e => setIncl({ ...incl, profit: e.target.checked })} /> سود <em>{toFa(fullTariff.marginPct)}٪</em></label>
      </div>
      {!allIn && (
        <div className="alert">
          <b>این قیمت‌ها کامل نیستند.</b> این‌ها در قیمت نیامده‌اند: {excluded.join('، ')}. این فقط برای دیدن اثر همین بخش‌هاست و چیزی ذخیره نمی‌شود.{' '}
          <button className="btn ghost" onClick={() => setIncl({ waste: true, overhead: true, extras: true, profit: true })}>همه حساب شود</button>
        </div>
      )}

      <div className="summary">
        {color && <Swatch hex={colorSwatch(color, catalog)} large />}
        <span>قیمت‌ها برای رنگ <b>{color?.name ?? '—'}</b> و تعرفه <b>{fullTariff.name}</b> ({incl.profit ? `${toFa(fullTariff.marginPct)}٪ سود` : 'بدون سود'}){payPct > 0 && <>، فروش <b>چک دو ماهه</b> (+{toFa(payPct)}٪)</>}{!allIn && <> · <b className="over">ناقص</b></>}</span>
        <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>قیمت متر مربع یعنی چه؟ <InfoTip>{SQM_TIP}</InfoTip></span>
      </div>

      <div className="tablewrap sticky-head">
        <table className="price-table">
          <thead>
            <tr>
              <th>محصول</th><th className="n hide-sm">وزن شاخه</th><th className="n hide-sm">هر کیلو (تومان)</th>
              <th className="n">هر متر (تومان)</th><th className="n hide-sm">هر متر مربع (تومان)</th><th className="n">قیمت شاخه (تومان)</th><th className="hide-sm status">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={7} className="muted">محصولی با این نام پیدا نشد.</td></tr>}
            {groups.map(g => (
              <Fragment key={g.series}>
                <tr className={`group ${g.series}`}>
                  <td colSpan={7}>{seriesTitle(g.series)} · {toFa(g.rows.length)} محصول</td>
                </tr>
                {g.rows.map(({ p, price }) => {
                  const bad = price.cost.missingPrices.length > 0
                  const isOpen = open === p.id && !closing
                  const mounted = open === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`prod ${g.series}${isOpen ? ' open' : ''}${bad ? ' bad' : ''}`}
                        onClick={() => toggle(p.id)}
                        aria-expanded={isOpen}
                      >
                        <td className="prodcell">
                          <span className="chev">{isOpen ? '▾' : '◂'}</span>
                          <span className="name">{p.name}</span>
                          <div className="sub">{p.code}{p.widthMm ? ` · ${p.widthMm}×${p.thicknessMm}` : ''}{stickLength(p) !== 3 ? ` · شاخه ${faNum(stickLength(p))} متری` : ''}</div>
                          <div className="only-sm">
                            {bad && <Tag kind="err">قیمت ناقص</Tag>}{' '}
                            {p.weightPer3mG == null && <Tag>بدون وزن</Tag>}
                          </div>
                        </td>
                        <td className="n dim hide-sm">{p.weightPer3mG == null ? '—' : `${formatKg(p.weightPer3mG / 1000)} kg`}</td>
                        <td className="n dim hide-sm">{formatToman(price.salePerKg)}</td>
                        <td className="n">{formatToman(price.perMeter)}</td>
                        <td className="n dim hide-sm">{formatToman(price.perSqm)}</td>
                        <td className="n price-main">{formatToman(price.perStick)}</td>
                        <td className="hide-sm status">
                          {bad && <Tag kind="err">قیمت ناقص</Tag>}{' '}
                          {p.weightPer3mG == null && <Tag>بدون وزن</Tag>}
                          {!bad && p.weightPer3mG != null && <Tag kind="ok">کامل</Tag>}
                        </td>
                      </tr>
                      {mounted && (
                        <tr className="panel" id={`panel-${p.id}`}>
                          <td colSpan={7}>
                            <Panel closing={closing} onClosed={() => { setOpen(null); setClosing(false) }}>
                              <Breakdown catalog={view} product={p} colorId={p.colorable ? colorId || null : null} tariff={tariff} payPct={payPct} />
                            </Panel>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">روی هر محصول بزنید تا ببینید قیمتش از چه چیزهایی ساخته شده. قیمت‌ها به تومان‌اند و به نزدیک‌ترین {toFa(catalog.config.roundTo)} تومان رسانده شده‌اند. نوار رنگی کنار هر محصول نشان می‌دهد از کدام سری است؛ نوار قرمز یعنی قیمتش ناقص است. برای دیدن اینکه هر عدد چطور درآمده، موس را روی ⓘ کنار آن ببرید.</p>
    </div>
  )
}

function Breakdown({ catalog, product, colorId, tariff, payPct }: { catalog: Catalog; product: Product; colorId: string | null; tariff: Tariff; payPct: number }) {
  const flat = flatten(productItems(product, colorId, catalog), catalog)
  const price = priceProduct(product, colorId, tariff, catalog, payPct)
  const ex = explainPrice(product, colorId, tariff, catalog, payPct)
  const c = price.cost
  const waste = c.materialPerKg / (1 - catalog.config.wastePct / 100) - c.materialPerKg
  const profit = price.salePerKg - c.costPerKg
  const parts = [
    { key: 'materials', label: 'مواد', v: c.materialPerKg },
    { key: 'waste', label: 'دورریز', v: waste },
    { key: 'overhead', label: 'هزینه‌های ثابت', v: c.overheadPerKg },
    { key: 'extras', label: 'کرایه و انبارداری', v: c.extrasPerKg },
    { key: 'profit', label: payPct > 0 ? `سود (${toFa(tariff.marginPct)}٪) و اضافه‌ی چک (${toFa(payPct)}٪)` : `سود (${toFa(tariff.marginPct)}٪)`, v: profit },
  ]
  const total = parts.reduce((s, x) => s + x.v, 0) || 1

  return (
    <div className="panel-in">
      <div className="kpis" style={{ marginBottom: 0 }}>
        <Kpi label="قیمت تمام‌شده هر کیلو" tip={kpiTip('cost', ex)} accent="var(--muted)"><Toman v={c.costPerKg} /></Kpi>
        <Kpi label="قیمت فروش هر کیلو" tip={kpiTip('sale', ex)}><Toman v={price.salePerKg} /></Kpi>
        <Kpi label="قیمت هر متر" tip={kpiTip('meter', ex)}><Toman v={price.perMeter} /></Kpi>
        <Kpi label="قیمت هر متر مربع" tip={kpiTip('sqm', ex)}><Toman v={price.perSqm} /></Kpi>
        <Kpi label={`قیمت شاخه (${faNum(stickLength(product))} متری)`} tip={kpiTip('stick', ex)} accent="var(--accent)"><Toman v={price.perStick} /></Kpi>
      </div>

      <div>
        <span className="field-label">قیمت فروش هر کیلو از چه چیزهایی ساخته شده؟</span>
        <div className="bar" role="img" aria-label="سهم هر بخش از قیمت فروش">
          {parts.map(x => <i key={x.key} className={`seg-${x.key}`} style={{ width: `${(x.v / total) * 100}%` }} title={`${x.label}: ${formatToman(x.v)}`} />)}
        </div>
        <div className="legend">
          {parts.map(x => (
            <span key={x.key}><em className={`seg-${x.key}`} />{x.label}: <b>{formatToman(x.v)}</b> ({toFa(Math.round((x.v / total) * 100))}٪)</span>
          ))}
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>ماده (پارت {toFa(Math.round(c.totalKg))} کیلویی)</th><th className="n">کیلو</th><th className="n hide-sm">قیمت/کیلو (تومان)</th><th className="n">هزینه (تومان)</th></tr></thead>
          <tbody>
            {Object.entries(flat).map(([id, q]) => {
              const m = catalog.materials[id]
              const missing = m?.pricePerKg == null
              return (
                <tr key={id}>
                  <td>{m?.name ?? id}</td>
                  <td className="n">{formatKg(q)}</td>
                  <td className="n hide-sm">{missing ? <Tag kind="err">بدون قیمت</Tag> : formatToman(m.pricePerKg)}</td>
                  <td className="n">{missing ? <Tag kind="err">بدون قیمت</Tag> : formatToman(q * m.pricePerKg!)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
