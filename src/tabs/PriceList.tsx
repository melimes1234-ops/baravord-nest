import { Fragment, useMemo, useState } from 'react'
import {
  colorSwatch, extrasPerKg, faNum, flatten, stickLength, formatKg, formatToman, overheadPerKg, priceProduct, productItems, toFa,
  type Catalog, type Product, type Tariff,
} from '../core'
import { DEMO } from '../demo'
import { InfoTip, NumInput, Swatch, Tag } from '../ui'

/** 'FD142' -> 'FD'. Products of one series share a colour in the list. */
const seriesOf = (p: Product): string => {
  const m = p.code.match(/^[A-Z]{2}/)?.[0]
  return m === 'FC' || m === 'FD' || m === 'FB' || m === 'FT' ? m : 'other'
}
const seriesTitle = (s: string) => (s === 'other' ? 'سایر محصولات' : `سری ${s}`)

const CUSTOM = 'custom'

const SQM_TIP = (
  <>
    <p><b>قیمت متر مربع</b> = قیمت هر متر ÷ عرض محصول (به متر). مثلاً عرض ۱۴۰ میلی‌متر یعنی تقسیم بر ۰٫۱۴.</p>
    <p>عرض از ستون «عرض» در تب «محصولات» می‌آید. اگر عرض پوششی واقعی فرق دارد (مثلاً به‌خاطر قفل و بست بین تخته‌ها)، همان عدد را آن‌جا عوض کنید.</p>
    <p>برای محصولات توخالی یا مکعبی (مثل Off، IMP و Coffin) قیمت متر مربع با سطح پوشش یکی نیست. برنامه آن را حساب می‌کند ولی خودتان تشخیص بدهید کجا به کار می‌آید.</p>
  </>
)

export function PriceList({ catalog, onEditTariffs }: { catalog: Catalog; onEditTariffs?: () => void }) {
  const colors = Object.values(catalog.colors)
  const [tariffId, setTariffId] = useState(catalog.tariffs[0]?.id)
  const [customPct, setCustomPct] = useState<number | null>(20)
  const [colorId, setColorId] = useState<string>(colors[0]?.id ?? '')
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Which cost parts count in the shown prices. Only changes this view: nothing is saved.
  const [incl, setIncl] = useState({ waste: true, overhead: true, extras: true, profit: true })
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
    !incl.waste && 'ضایعات', !incl.overhead && 'سربار کارخانه', !incl.extras && 'کرایه و انبارداری', !incl.profit && 'سود',
  ].filter(Boolean) as string[]

  const groups = useMemo(() => {
    if (!tariff) return []
    const q = query.trim().toLowerCase()
    const order = ['FC', 'FD', 'FB', 'FT', 'other']
    const by = new Map<string, { p: Product; price: ReturnType<typeof priceProduct> }[]>()
    for (const p of Object.values(catalog.products)) {
      if (q && !`${p.name} ${p.code}`.toLowerCase().includes(q)) continue
      const price = priceProduct(p, p.colorable ? colorId || null : null, tariff, view)
      const s = seriesOf(p)
      by.set(s, [...(by.get(s) ?? []), { p, price }])
    }
    return order.filter(s => by.has(s)).map(s => ({ series: s, rows: by.get(s)! }))
  }, [catalog, view, colorId, tariff, query])

  if (!tariff || !fullTariff) return <div className="card">ابتدا یک تعرفه تعریف کنید.</div>
  const oh = overheadPerKg(catalog.config).value
  const ex = extrasPerKg(catalog.config)

  return (
    <div className="card">
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
        <label className={`part${incl.waste ? ' on' : ''}`}><input type="checkbox" checked={incl.waste} onChange={e => setIncl({ ...incl, waste: e.target.checked })} /> ضایعات <em>{toFa(catalog.config.wastePct)}٪</em></label>
        <label className={`part${incl.overhead ? ' on' : ''}`}><input type="checkbox" checked={incl.overhead} onChange={e => setIncl({ ...incl, overhead: e.target.checked })} /> سربار کارخانه <em>{formatToman(oh)} در هر کیلو</em></label>
        <label className={`part${incl.extras ? ' on' : ''}`}><input type="checkbox" checked={incl.extras} onChange={e => setIncl({ ...incl, extras: e.target.checked })} /> کرایه و انبارداری <em>{formatToman(ex)} در هر کیلو</em></label>
        <label className={`part${incl.profit ? ' on' : ''}`}><input type="checkbox" checked={incl.profit} onChange={e => setIncl({ ...incl, profit: e.target.checked })} /> سود <em>{toFa(fullTariff.marginPct)}٪</em></label>
      </div>
      {!allIn && (
        <div className="alert">
          <b>این قیمت‌ها کامل نیستند.</b> در این نمایش حساب نشده: {excluded.join('، ')}. فقط برای دیدن اثر همین بخش‌هاست و چیزی ذخیره نمی‌شود.{' '}
          <button className="btn ghost" onClick={() => setIncl({ waste: true, overhead: true, extras: true, profit: true })}>همه حساب شود</button>
        </div>
      )}

      <div className="summary">
        {color && <Swatch hex={colorSwatch(color, catalog)} large />}
        <span>قیمت‌ها برای رنگ <b>{color?.name ?? '—'}</b> و تعرفه <b>{fullTariff.name}</b> ({incl.profit ? `${toFa(fullTariff.marginPct)}٪ سود` : 'بدون سود'}){!allIn && <> · <b className="over">ناقص</b></>}</span>
        <span className="muted">صفحه کابینت رنگ ندارد و همیشه یک قیمت دارد.</span>
        <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>قیمت متر مربع چطور حساب می‌شود؟ <InfoTip>{SQM_TIP}</InfoTip></span>
      </div>

      <div className="tablewrap sticky-head">
        <table className="price-table">
          <thead>
            <tr>
              <th>محصول</th><th className="n hide-sm">وزن شاخه</th><th className="n hide-sm">هر کیلو</th>
              <th className="n">هر متر</th><th className="n hide-sm">هر متر مربع</th><th className="n">قیمت شاخه</th><th className="hide-sm status">وضعیت</th>
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
                  const isOpen = open === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`prod ${g.series}${isOpen ? ' open' : ''}${bad ? ' bad' : ''}`}
                        onClick={() => setOpen(isOpen ? null : p.id)}
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
                      {isOpen && (
                        <tr className="panel">
                          <td colSpan={7}>
                            <Breakdown catalog={view} product={p} colorId={p.colorable ? colorId || null : null} tariff={tariff} />
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
      <p className="muted">روی هر محصول بزنید تا ببینید قیمتش از چه چیزهایی ساخته شده. قیمت‌ها به تومان و گرد‌شده به مضرب {toFa(catalog.config.roundTo)} هستند. قیمت متر مربع از عرض محصول حساب می‌شود (قیمت هر متر ÷ عرض به متر). نوار رنگی کنار هر محصول نشان‌دهنده‌ی سری آن است و نوار قرمز یعنی قیمت ناقص.</p>
    </div>
  )
}

function Breakdown({ catalog, product, colorId, tariff }: { catalog: Catalog; product: Product; colorId: string | null; tariff: Tariff }) {
  const flat = flatten(productItems(product, colorId, catalog), catalog)
  const price = priceProduct(product, colorId, tariff, catalog)
  const c = price.cost
  const waste = c.materialPerKg / (1 - catalog.config.wastePct / 100) - c.materialPerKg
  const profit = price.salePerKg - c.costPerKg
  const parts = [
    { key: 'materials', label: 'مواد', v: c.materialPerKg },
    { key: 'waste', label: 'ضایعات', v: waste },
    { key: 'overhead', label: 'سربار', v: c.overheadPerKg },
    { key: 'extras', label: 'کرایه و انبارداری', v: c.extrasPerKg },
    { key: 'profit', label: `سود (${toFa(tariff.marginPct)}٪)`, v: profit },
  ]
  const total = parts.reduce((s, x) => s + x.v, 0) || 1

  return (
    <div className="panel-in">
      <div className="kpis" style={{ marginBottom: 0 }}>
        <div className="kpi" style={{ ['--k' as string]: 'var(--muted)' }}><span>قیمت تمام‌شده هر کیلو</span><b>{formatToman(c.costPerKg)}</b></div>
        <div className="kpi"><span>قیمت فروش هر کیلو</span><b>{formatToman(price.salePerKg)}</b></div>
        <div className="kpi"><span>قیمت هر متر</span><b>{formatToman(price.perMeter)}</b></div>
        <div className="kpi"><span>قیمت هر متر مربع</span><b>{formatToman(price.perSqm)}</b></div>
        <div className="kpi" style={{ ['--k' as string]: 'var(--accent)' }}><span>قیمت شاخه ({faNum(stickLength(product))} متری)</span><b>{formatToman(price.perStick)}</b></div>
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
          <thead><tr><th>ماده (پارت {toFa(Math.round(c.totalKg))} کیلویی)</th><th className="n">کیلو</th><th className="n hide-sm">قیمت/کیلو</th><th className="n">هزینه</th></tr></thead>
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
