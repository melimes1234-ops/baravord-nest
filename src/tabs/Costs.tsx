import { formatToman, overheadPerKg, extrasPerKg, toFa, type Catalog, type CostLine } from '../core'
import type { Update } from '../store'
import { NumInput, TextInput } from '../ui'

function Lines({ title, lines, onChange }: { title: string; lines: CostLine[]; onChange: (l: CostLine[]) => void }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="tablewrap">
        <table>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input value={l.name} onChange={e => onChange(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="n"><NumInput money value={l.amount} onChange={v => onChange(lines.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} /></td>
                <td><button className="btn danger" onClick={() => onChange(lines.filter((_, j) => j !== i))}>حذف</button></td>
              </tr>
            ))}
            <tr><td><b>جمع</b></td><td className="n"><b>{formatToman(lines.reduce((s, l) => s + l.amount, 0))}</b></td><td /></tr>
          </tbody>
        </table>
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => onChange([...lines, { name: 'مورد جدید', amount: 0 }])}>افزودن ردیف</button>
    </div>
  )
}

export function Costs({ catalog, update }: { catalog: Catalog; update: Update }) {
  const c = catalog.config
  const oh = overheadPerKg(c)
  return (
    <>
      <Lines title="هزینه‌های ماهانه (برق، حقوق، اجاره، استهلاک ...)" lines={c.monthlyCosts} onChange={l => update(s => { s.catalog.config.monthlyCosts = l })} />
      <div className="card">
        <div className="row">
          <label>کیلوی تولید این ماه<NumInput value={c.monthlyProductionKg} onChange={v => update(s => { s.catalog.config.monthlyProductionKg = v ?? 0 })} /></label>
          <div className="kpi"><span className="muted">سربار هر کیلو</span><b>{formatToman(oh.value)} تومان</b></div>
          <div className="kpi"><span className="muted">سربار هر ۱۰۰ کیلو</span><b>{formatToman(oh.value * 100)} تومان</b></div>
        </div>
        {oh.warning && <div className="alert">{oh.warning}</div>}
      </div>
      <Lines title="هزینه‌های هر پارت (کرایه، انبارداری، باسکول)" lines={c.perBatchCosts} onChange={l => update(s => { s.catalog.config.perBatchCosts = l })} />
      <div className="card">
        <div className="row">
          <label>وزن پارت استاندارد (کیلو)<NumInput value={c.batchKg} onChange={v => update(s => { s.catalog.config.batchKg = v ?? 100 })} /></label>
          <div className="kpi"><span className="muted">کرایه و انبارداری هر کیلو</span><b>{formatToman(extrasPerKg(c))} تومان</b></div>
          <label>درصد ضایعات تولید<NumInput value={c.wastePct} decimals={2} onChange={v => update(s => { s.catalog.config.wastePct = Math.min(Math.max(v ?? 0, 0), 99) })} /></label>
          <label>گرد کردن قیمت به مضرب (تومان)<NumInput money value={c.roundTo} onChange={v => update(s => { s.catalog.config.roundTo = v ?? 1 })} /></label>
          <label>حد مجاز انحراف مواد در پارت (٪)<NumInput value={c.defaultTolerancePct} decimals={2} onChange={v => update(s => { s.catalog.config.defaultTolerancePct = v ?? 5 })} /></label>
        </div>
      </div>
      <div className="card">
        <h2>تعرفه‌ها (درصد سود روی قیمت تمام‌شده)</h2>
        <div className="tablewrap">
          <table>
            <tbody>
              {catalog.tariffs.map((t, i) => (
                <tr key={t.id}>
                  <td><TextInput required value={t.name} onChange={v => update(s => { s.catalog.tariffs[i].name = v })} /></td>
                  <td className="n"><NumInput value={t.marginPct} decimals={2} onChange={v => update(s => { s.catalog.tariffs[i].marginPct = v ?? 0 })} /> {toFa('٪')}</td>
                  <td><button className="btn danger" disabled={catalog.tariffs.length < 2} onClick={() => update(s => { s.catalog.tariffs.splice(i, 1) })}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => update(s => { s.catalog.tariffs.push({ id: `t-${Date.now().toString(36)}`, name: 'تعرفه جدید', marginPct: 20 }) })}>افزودن تعرفه</button>
      </div>
    </>
  )
}
