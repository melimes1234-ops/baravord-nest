import { Fragment, useMemo, useState } from 'react'
import { flatten, formatKg, formatToman, priceProduct, productItems, toFa, type Catalog } from '../core'
import { Tag } from '../ui'

export function PriceList({ catalog }: { catalog: Catalog }) {
  const colors = Object.values(catalog.colors)
  const [tariffId, setTariffId] = useState(catalog.tariffs[0]?.id)
  const [colorId, setColorId] = useState<string>(colors[0]?.id ?? '')
  const [open, setOpen] = useState<string | null>(null)
  const tariff = catalog.tariffs.find(t => t.id === tariffId) ?? catalog.tariffs[0]

  const rows = useMemo(
    () =>
      Object.values(catalog.products).map(p => {
        const col = p.colorable ? colorId || null : null
        return { p, price: priceProduct(p, col, tariff, catalog), col }
      }),
    [catalog, colorId, tariff],
  )
  if (!tariff) return <div className="card">ابتدا یک تعرفه تعریف کنید.</div>

  return (
    <>
      <div className="card">
        <div className="row">
          <label>
            تعرفه
            <select value={tariffId} onChange={e => setTariffId(e.target.value)}>
              {catalog.tariffs.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({toFa(t.marginPct)}٪ سود)</option>
              ))}
            </select>
          </label>
          <label>
            رنگ
            <select value={colorId} onChange={e => setColorId(e.target.value)}>
              {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn ghost" onClick={() => window.print()}>چاپ</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>محصول</th><th>کد</th><th className="n">وزن ۳ متر (گرم)</th>
                <th className="n">قیمت هر کیلو</th><th className="n">قیمت هر متر</th><th className="n">قیمت شاخه ۳ متری</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, price, col }) => (
                <Fragment key={p.id}>
                  <tr className="click" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td>{p.name}</td>
                    <td>{p.code}</td>
                    <td className="n">{p.weightPer3mG == null ? '—' : formatToman(p.weightPer3mG)}</td>
                    <td className="n">{formatToman(price.salePerKg)}</td>
                    <td className="n">{formatToman(price.perMeter)}</td>
                    <td className="n">{formatToman(price.perStick)}</td>
                    <td>
                      {price.cost.missingPrices.length > 0 && <Tag kind="err">قیمت ناقص</Tag>}{' '}
                      {p.weightPer3mG == null && <Tag>بدون وزن</Tag>}
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr>
                      <td colSpan={7}><Breakdown catalog={catalog} productId={p.id} colorId={col} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">روی هر ردیف بزنید تا اجزای قیمت را ببینید. قیمت‌ها به تومان و گرد‌شده به مضرب {toFa(catalog.config.roundTo)} هستند.</p>
      </div>
    </>
  )
}

function Breakdown({ catalog, productId, colorId }: { catalog: Catalog; productId: string; colorId: string | null }) {
  const p = catalog.products[productId]
  const items = productItems(p, colorId, catalog)
  const flat = flatten(items, catalog)
  const price = priceProduct(p, colorId, catalog.tariffs[0], catalog)
  const c = price.cost
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <table style={{ maxWidth: 460 }}>
        <thead><tr><th>ماده</th><th className="n">کیلو</th><th className="n">قیمت کیلو</th><th className="n">هزینه</th></tr></thead>
        <tbody>
          {Object.entries(flat).map(([id, q]) => {
            const m = catalog.materials[id]
            return (
              <tr key={id}>
                <td>{m?.name ?? id}</td>
                <td className="n">{formatKg(q)}</td>
                <td className="n">{formatToman(m?.pricePerKg)}</td>
                <td className="n">{m?.pricePerKg == null ? '—' : formatToman(q * m.pricePerKg)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <table style={{ maxWidth: 360 }}>
        <tbody>
          <tr><td>وزن پارت</td><td className="n">{formatKg(c.totalKg)} کیلو</td></tr>
          <tr><td>مواد هر کیلو</td><td className="n">{formatToman(c.materialPerKg)}</td></tr>
          <tr><td>ضایعات ({toFa(catalog.config.wastePct)}٪)</td><td className="n">{formatToman(c.materialPerKg / (1 - catalog.config.wastePct / 100) - c.materialPerKg)}</td></tr>
          <tr><td>سربار هر کیلو</td><td className="n">{formatToman(c.overheadPerKg)}</td></tr>
          <tr><td>کرایه و انبارداری هر کیلو</td><td className="n">{formatToman(c.extrasPerKg)}</td></tr>
          <tr><td><b>قیمت تمام‌شده هر کیلو</b></td><td className="n"><b>{formatToman(c.costPerKg)}</b></td></tr>
        </tbody>
      </table>
    </div>
  )
}
