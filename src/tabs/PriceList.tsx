import { Fragment, useMemo, useState } from 'react'
import {
  colorSwatch, flatten, formatKg, formatToman, priceProduct, productItems, toFa,
  type Catalog, type Product, type Tariff,
} from '../core'
import { DEMO } from '../demo'
import { NumInput, Swatch, Tag } from '../ui'

/** 'FD142' -> 'FD'. Products of one series share a colour in the list. */
const seriesOf = (p: Product): string => {
  const m = p.code.match(/^[A-Z]{2}/)?.[0]
  return m === 'FC' || m === 'FD' || m === 'FB' || m === 'FT' ? m : 'other'
}
const seriesTitle = (s: string) => (s === 'other' ? 'سایر محصولات' : `سری ${s}`)

const CUSTOM = 'custom'

export function PriceList({ catalog, onEditTariffs }: { catalog: Catalog; onEditTariffs?: () => void }) {
  const colors = Object.values(catalog.colors)
  const [tariffId, setTariffId] = useState(catalog.tariffs[0]?.id)
  const [customPct, setCustomPct] = useState<number | null>(20)
  const [colorId, setColorId] = useState<string>(colors[0]?.id ?? '')
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const tariff: Tariff | undefined =
    tariffId === CUSTOM
      ? { id: CUSTOM, name: 'سود دلخواه', marginPct: Math.max(0, customPct ?? 0) }
      : catalog.tariffs.find(t => t.id === tariffId) ?? catalog.tariffs[0]
  const color = catalog.colors[colorId]

  const groups = useMemo(() => {
    if (!tariff) return []
    const q = query.trim().toLowerCase()
    const order = ['FC', 'FD', 'FB', 'FT', 'other']
    const by = new Map<string, { p: Product; price: ReturnType<typeof priceProduct> }[]>()
    for (const p of Object.values(catalog.products)) {
      if (q && !`${p.name} ${p.code}`.toLowerCase().includes(q)) continue
      const price = priceProduct(p, p.colorable ? colorId || null : null, tariff, catalog)
      const s = seriesOf(p)
      by.set(s, [...(by.get(s) ?? []), { p, price }])
    }
    return order.filter(s => by.has(s)).map(s => ({ series: s, rows: by.get(s)! }))
  }, [catalog, colorId, tariff, query])

  if (!tariff) return <div className="card">ابتدا یک تعرفه تعریف کنید.</div>

  return (
    <div className="card">
      <div className="row">
        <div>
          <span className="field-label">تعرفه (درصد سود)</span>
          <div className="seg" role="group" aria-label="تعرفه">
            {catalog.tariffs.map(t => (
              <button key={t.id} aria-pressed={t.id === tariff.id} onClick={() => setTariffId(t.id)}>
                {t.name} · {toFa(t.marginPct)}٪
              </button>
            ))}
            <button aria-pressed={tariff.id === CUSTOM} onClick={() => setTariffId(CUSTOM)}>سود دلخواه</button>
          </div>
        </div>
        {tariff.id === CUSTOM && (
          <label>
            درصد سود دلخواه
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <NumInput value={customPct} decimals={2} onChange={setCustomPct} placeholder="مثلاً ۲۰" />٪
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

      <div className="summary">
        {color && <Swatch hex={colorSwatch(color, catalog)} large />}
        <span>قیمت‌ها برای رنگ <b>{color?.name ?? '—'}</b> و تعرفه <b>{tariff.name}</b> ({toFa(tariff.marginPct)}٪ سود)</span>
        <span className="muted">صفحه کابینت رنگ ندارد و همیشه یک قیمت دارد.</span>
      </div>

      <div className="tablewrap">
        <table className="price-table">
          <thead>
            <tr>
              <th>محصول</th><th className="n hide-sm">وزن ۳ متر</th><th className="n hide-sm">هر کیلو</th>
              <th className="n">هر متر</th><th className="n">شاخه ۳ متری</th><th className="hide-sm status">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={6} className="muted">محصولی با این نام پیدا نشد.</td></tr>}
            {groups.map(g => (
              <Fragment key={g.series}>
                <tr className={`group ${g.series}`}>
                  <td colSpan={6}>{seriesTitle(g.series)} · {toFa(g.rows.length)} محصول</td>
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
                          <div className="sub">{p.code}{p.widthMm ? ` · ${p.widthMm}×${p.thicknessMm}` : ''}</div>
                          <div className="only-sm">
                            {bad && <Tag kind="err">قیمت ناقص</Tag>}{' '}
                            {p.weightPer3mG == null && <Tag>بدون وزن</Tag>}
                          </div>
                        </td>
                        <td className="n dim hide-sm">{p.weightPer3mG == null ? '—' : `${formatKg(p.weightPer3mG / 1000)} kg`}</td>
                        <td className="n dim hide-sm">{formatToman(price.salePerKg)}</td>
                        <td className="n">{formatToman(price.perMeter)}</td>
                        <td className="n price-main">{formatToman(price.perStick)}</td>
                        <td className="hide-sm status">
                          {bad && <Tag kind="err">قیمت ناقص</Tag>}{' '}
                          {p.weightPer3mG == null && <Tag>بدون وزن</Tag>}
                          {!bad && p.weightPer3mG != null && <Tag kind="ok">کامل</Tag>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="panel">
                          <td colSpan={6}>
                            <Breakdown catalog={catalog} product={p} colorId={p.colorable ? colorId || null : null} tariff={tariff} />
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
      <p className="muted">روی هر محصول بزنید تا ببینید قیمتش از چه چیزهایی ساخته شده. قیمت‌ها به تومان و گرد‌شده به مضرب {toFa(catalog.config.roundTo)} هستند. نوار رنگی کنار هر محصول نشان‌دهنده‌ی سری آن است و نوار قرمز یعنی قیمت ناقص.</p>
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
        <div className="kpi" style={{ ['--k' as string]: 'var(--accent)' }}><span>قیمت شاخه ۳ متری</span><b>{formatToman(price.perStick)}</b></div>
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
