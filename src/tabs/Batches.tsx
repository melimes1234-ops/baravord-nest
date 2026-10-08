import { useMemo, useState } from 'react'
import {
  addBatchItem, batchReport, checkAvailability, consumeBatch, createBatch, flatten, formatKg, formatToman,
  productItems, removeBatchItem, setActualQty, stockLevels, toFa, toJalaliDate, batchActualFlat,
  type Batch, type Catalog, type ItemRef,
} from '../core'
import type { AppState, Update } from '../store'
import { DeltaBadge, NumInput, Tag } from '../ui'

const today = () => new Date().toISOString().slice(0, 10)

export function Batches({ state, update }: { state: AppState; update: Update }) {
  const { catalog } = state
  const [productId, setProductId] = useState(Object.keys(catalog.products)[0])
  const [colorId, setColorId] = useState(Object.keys(catalog.colors)[0] ?? '')
  const [totalKg, setTotalKg] = useState<number | null>(null)
  const [draft, setDraft] = useState<Batch | null>(null)
  const [user] = useState('کاربر')
  const [error, setError] = useState('')

  const product = catalog.products[productId]
  const nameOf = (r: ItemRef) => (r.kind === 'material' ? catalog.materials[r.id]?.name : catalog.recipes[r.id]?.name) ?? r.id

  const report = useMemo(() => (draft ? batchReport(draft, catalog) : null), [draft, catalog])
  const shortages = useMemo(
    () => (draft ? checkAvailability(batchActualFlat(draft, catalog), stockLevels(state.movements)) : []),
    [draft, catalog, state.movements],
  )

  const start = () => {
    const items = productItems(product, product.colorable ? colorId : null, catalog)
    flatten(items, catalog) // throws on broken formulas
    setDraft(createBatch({ id: `B${Date.now().toString(36)}`, date: today(), productId, colorId: product.colorable ? colorId : null, items, totalKg: totalKg ?? undefined }, catalog))
    setError('')
  }

  const save = () => {
    if (!draft) return
    try {
      const moves = consumeBatch(draft, catalog, state.movements)
      update(s => { s.movements = moves; s.batches.unshift(draft) })
      setDraft(null)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <div className="card">
        <h2>پارت تولید جدید</h2>
        <div className="row">
          <label>محصول<select value={productId} onChange={e => setProductId(e.target.value)}>{Object.values(catalog.products).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {product.colorable && <label>رنگ<select value={colorId} onChange={e => setColorId(e.target.value)}>{Object.values(catalog.colors).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <label>وزن کل پارت (کیلو، اختیاری)<NumInput value={totalKg} placeholder="طبق فرمول" onChange={setTotalKg} /></label>
          <button className="btn" onClick={start}>شروع پارت</button>
        </div>
      </div>

      {draft && report && (
        <div className="card">
          <h2>{product.name} {draft.colorId ? `— ${catalog.colors[draft.colorId].name}` : ''} — {toJalaliDate(draft.date)}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>جزء</th><th className="n">استاندارد (کیلو)</th><th className="n">واقعی (کیلو)</th><th className="n">تغییر (٪)</th><th>نسبت به فرمول</th><th /></tr></thead>
              <tbody>
                {draft.items.map(it => (
                  <tr key={`${it.ref.kind}:${it.ref.id}`}>
                    <td>{nameOf(it.ref)}{it.stdQty === 0 && <> <Tag>افزوده شده</Tag></>}</td>
                    <td className="n">{formatKg(it.stdQty)}</td>
                    <td className="n"><NumInput value={it.actualQty} onChange={v => setDraft(setActualQty(draft, it.ref, v ?? 0, user))} /></td>
                    <td className="n">
                      {it.stdQty > 0 ? (
                        <NumInput
                          value={Math.round((it.actualQty / it.stdQty - 1) * 10000) / 100}
                          decimals={2}
                          onChange={v => setDraft(setActualQty(draft, it.ref, Math.max(0, it.stdQty * (1 + (v ?? 0) / 100)), user))}
                        />
                      ) : '—'}
                    </td>
                    <td><DeltaBadge pct={it.stdQty > 0 ? (it.actualQty / it.stdQty - 1) * 100 : null} tol={(it.ref.kind === 'material' && catalog.config.toleranceByMaterial[it.ref.id]) || catalog.config.defaultTolerancePct} /></td>
                    <td><button className="btn danger" onClick={() => setDraft(removeBatchItem(draft, it.ref, user))}>حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <select id="batch-add" defaultValue="">
              <option value="" disabled>افزودن ماده به این پارت…</option>
              {Object.values(catalog.materials).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn ghost" onClick={() => {
              const el = document.getElementById('batch-add') as HTMLSelectElement
              if (el.value) { setDraft(addBatchItem(draft, { kind: 'material', id: el.value }, 0, user)); el.value = '' }
            }}>افزودن</button>
          </div>

          <h2 style={{ marginTop: 16 }}>مقایسه با فرمول استاندارد</h2>
          <div className="kpis">
            <div className="kpi"><span className="muted">وزن واقعی</span><b>{formatKg(report.actual.totalKg)} کیلو</b></div>
            <div className="kpi"><span className="muted">قیمت تمام‌شده هر کیلو</span><b>{formatToman(report.actual.costPerKg)}</b></div>
            <div className="kpi"><span className="muted">هزینه کل پارت</span><b>{formatToman(report.actual.costPerKg * report.actual.totalKg)}</b></div>
            <div className="kpi"><span className="muted">هزینه اضافه/کمتر نسبت به استاندارد</span><b className={report.extraCost > 0 ? 'over' : ''}>{formatToman(report.extraCost)}</b></div>
          </div>
          {report.actual.missingPrices.length > 0 && <div className="alert err">قیمت این مواد وارد نشده و در هزینه نیامده: {report.actual.missingPrices.map(id => catalog.materials[id]?.name).join('، ')}</div>}
          {report.exceeded.map(l => (
            <div className="alert" key={l.materialId}>
              انحراف {catalog.materials[l.materialId]?.name}: {l.diffPct == null ? 'ماده خارج از فرمول' : `${toFa(l.diffPct.toFixed(1))}٪`} (حد مجاز {toFa(l.tolerancePct)}٪)، اختلاف هزینه {formatToman(l.diffCost)} تومان
            </div>
          ))}
          {shortages.length > 0 && <div className="alert err">موجودی انبار کافی نیست: {shortages.map(s => `${catalog.materials[s.materialId]?.name} (${formatKg(s.missingKg)} کیلو کمبود)`).join('، ')}</div>}
          {error && <div className="alert err">{error}</div>}
          <div className="row">
            <button className="btn" disabled={shortages.length > 0} onClick={save}>ثبت پارت و کسر از انبار</button>
            <button className="btn ghost" onClick={() => setDraft(null)}>انصراف</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>پارت‌های ثبت‌شده</h2>
        {state.batches.length === 0 ? <p className="muted">هنوز پارتی ثبت نشده.</p> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>تاریخ</th><th>محصول</th><th>رنگ</th><th className="n">وزن</th><th className="n">هزینه کل</th><th className="n">اختلاف با استاندارد</th><th>تغییرات</th></tr></thead>
              <tbody>
                {state.batches.map(b => {
                  const r = batchReport(b, catalog as Catalog)
                  return (
                    <tr key={b.id}>
                      <td>{toJalaliDate(b.date)}</td>
                      <td>{catalog.products[b.productId]?.name}</td>
                      <td>{b.colorId ? catalog.colors[b.colorId]?.name : '—'}</td>
                      <td className="n">{formatKg(r.actual.totalKg)}</td>
                      <td className="n">{formatToman(r.actual.costPerKg * r.actual.totalKg)}</td>
                      <td className={`n ${r.extraCost > 0 ? 'over' : ''}`}>{formatToman(r.extraCost)}</td>
                      <td>{toFa(b.changes.length)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
