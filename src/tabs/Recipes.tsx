import { useMemo, useState } from 'react'
import {
  colorSwatch, formatKg, formatToman, formulaCost, normalizeTo, priceProduct, recipeUsage, setItemPercent, toFa,
  withReplacement, type Catalog, type Id, type RecipeItem,
} from '../core'
import type { Update } from '../store'
import { InfoTip, LockIcon, NumInput, Swatch, Tag, TextInput } from '../ui'

type Kind = 'recipe' | 'color'
type Unit = 'kg' | 'g' | 'pct'
interface Entry {
  kind: Kind
  id: Id
  name: string
  items: RecipeItem[]
  custom: boolean
  copiedFrom?: Id
  /** recipe that other formulas use (like PRP) */
  semi: boolean
}

const key = (e: { kind: Kind; id: Id }) => `${e.kind}:${e.id}`
const fa = (n: number, d = 1) => toFa(n.toFixed(d)).replace('.', '٫')
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fa(Math.abs(n))}٪`
const PALETTE = ['#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a', '#00838f', '#c62828', '#9e9d24', '#4527a0', '#ad1457', '#558b2f', '#37474f', '#d84315']
const colorOf = (id: string) => PALETTE[[...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % PALETTE.length]

function dependsOn(catalog: Catalog, rid: Id, target: Id, seen = new Set<Id>()): boolean {
  if (rid === target) return true
  if (seen.has(rid)) return false
  seen.add(rid)
  return (catalog.recipes[rid]?.items ?? []).some(i => i.ref.kind === 'recipe' && dependsOn(catalog, i.ref.id, target, seen))
}

function entries(catalog: Catalog): Entry[] {
  const used = new Set(Object.values(catalog.recipes).flatMap(r => r.items.filter(i => i.ref.kind === 'recipe').map(i => i.ref.id)))
  const rs = Object.values(catalog.recipes).map<Entry>(r => ({
    kind: 'recipe', id: r.id, name: r.name, items: r.items, custom: !!r.custom, copiedFrom: r.copiedFrom,
    semi: r.kind ? r.kind === 'semi' : used.has(r.id),
  }))
  const cs = Object.values(catalog.colors).map<Entry>(c => ({
    kind: 'color', id: c.id, name: c.name, items: c.items, custom: !!c.custom, copiedFrom: c.copiedFrom, semi: false,
  }))
  return [...rs, ...cs]
}

const LOCK_TEXT = (
  <>
    <p><b>چرا قفل است؟</b> فرمول‌های استاندارد پایه‌ی قیمت همه‌ی محصولات‌اند. یک تغییر کوچک در آن‌ها قیمت کل لیست را عوض می‌کند، پس فعلاً فقط قابل مشاهده‌اند.</p>
    <p><b>برای آزمایش و بررسی:</b> دکمه‌ی «فرمول جدید» یا «کپی برای آزمایش» را بزنید. فرمول جدید را آزاد ویرایش کنید (کیلو، گرم یا درصد)، هزینه‌اش را همان لحظه ببینید و با «آزمایش اثر روی قیمت» بسنجید که اگر جای فرمول استاندارد بنشیند قیمت‌ها چه می‌شوند.</p>
    <p>فرمول جدید روی قیمت‌های فعلی اثری ندارد، مگر اینکه آن را عملاً به یک محصول بدهید (تب «محصولات»).</p>
  </>
)

export function Recipes({ catalog, update }: { catalog: Catalog; update: Update }) {
  const all = useMemo(() => entries(catalog), [catalog])
  const [sel, setSel] = useState(key(all[0]))
  const [unit, setUnit] = useState<Unit>('kg')
  const [creating, setCreating] = useState(false)
  const cur = all.find(e => key(e) === sel) ?? all[0]

  const group = (title: string, list: Entry[]) =>
    list.length > 0 && (
      <optgroup label={title}>
        {list.map(e => <option key={key(e)} value={key(e)}>{e.name}{e.custom ? ' (آزمایشی)' : ''}</option>)}
      </optgroup>
    )

  return (
    <>
      <div className="card">
        <div className="row">
          <label>
            فرمول
            <select value={key(cur)} onChange={e => { setSel(e.target.value); setCreating(false) }}>
              {group('فرمول‌های استاندارد (قفل)', all.filter(e => e.kind === 'recipe' && !e.custom))}
              {group('رنگ‌های استاندارد (قفل)', all.filter(e => e.kind === 'color' && !e.custom))}
              {group('فرمول‌های جدید (آزمایشی)', all.filter(e => e.custom))}
            </select>
          </label>
          <button className="btn" style={{ marginTop: 18 }} onClick={() => setCreating(c => !c)}>+ فرمول جدید</button>
          <InfoTip>
            <p><b>فرمول جدید</b> راه فعلی برای آزمایش و بررسی است. می‌توانید از صفر شروع کنید یا از روی یک فرمول موجود کپی بگیرید و تغییر بدهید.</p>
            <p>فرمول‌های استاندارد قفل‌اند تا اشتباهی قیمت همه‌ی محصولات عوض نشود.</p>
          </InfoTip>
        </div>
        {creating && (
          <NewFormula
            all={all}
            update={update}
            onCreated={k => { setSel(k); setCreating(false) }}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
      <FormulaView key={key(cur)} catalog={catalog} update={update} entry={cur} all={all} unit={unit} setUnit={setUnit} onOpen={k => setSel(k)} />
      {cur.custom && <FormulaTest catalog={catalog} entry={cur} all={all} />}
    </>
  )
}

function NewFormula(props: { all: Entry[]; update: Update; onCreated: (k: string) => void; onCancel: () => void }) {
  const { all, update, onCreated, onCancel } = props
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState<'semi' | 'base' | 'color'>('base')
  const [err, setErr] = useState('')
  const src = all.find(e => key(e) === source)
  const kindShown = src ? (src.kind === 'color' ? 'رنگ' : src.semi ? 'نیمه‌ساخته' : 'پایه محصول') : null

  const create = () => {
    const n = name.trim()
    if (!n) return setErr('برای فرمول جدید یک نام بنویسید')
    if (all.some(e => e.kind === (src ? src.kind : type === 'color' ? 'color' : 'recipe') && e.name.toLowerCase() === n.toLowerCase())) return setErr('فرمولی با این نام قبلاً هست')
    const id = `f-${Date.now().toString(36)}`
    const isColor = src ? src.kind === 'color' : type === 'color'
    const items = src ? src.items.map(i => ({ ref: { ...i.ref }, qtyKg: i.qtyKg })) : []
    const copiedFrom = src ? (src.custom ? src.copiedFrom ?? src.id : src.id) : undefined
    update(s => {
      if (isColor) s.catalog.colors[id] = { id, name: n, items, custom: true, ...(copiedFrom ? { copiedFrom } : {}) }
      else s.catalog.recipes[id] = { id, name: n, items, custom: true, kind: src ? (src.semi ? 'semi' : 'base') : (type === 'semi' ? 'semi' : 'base'), ...(copiedFrom ? { copiedFrom } : {}) }
    })
    onCreated(`${isColor ? 'color' : 'recipe'}:${id}`)
  }
  return (
    <div className="note" style={{ marginTop: 6 }}>
      <b>فرمول جدید</b>
      <div className="row" style={{ marginTop: 10 }}>
        <label>نام<input value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً PRP آزمایشی ۱" /></label>
        <label>شروع از
          <select value={source} onChange={e => setSource(e.target.value)}>
            <option value="">فرمول خالی</option>
            {all.map(e => <option key={key(e)} value={key(e)}>کپی از: {e.name}</option>)}
          </select>
        </label>
        {src ? (
          <label>نوع<span className="tag info" style={{ alignSelf: 'flex-start', marginTop: 6 }}>{kindShown}</span></label>
        ) : (
          <label>نوع
            <select value={type} onChange={e => setType(e.target.value as 'semi' | 'base' | 'color')}>
              <option value="base">پایه محصول</option>
              <option value="semi">نیمه‌ساخته (مثل PRP)</option>
              <option value="color">رنگ</option>
            </select>
          </label>
        )}
        <button className="btn" style={{ marginTop: 18 }} onClick={create}>ساخت</button>
        <button className="btn ghost" style={{ marginTop: 18 }} onClick={onCancel}>انصراف</button>
      </div>
      {err && <div className="alert err">{err}</div>}
      <p className="muted" style={{ margin: 0 }}>
        نیمه‌ساخته را می‌توان داخل فرمول‌های دیگر مصرف کرد. پایه محصول فرمول خود یک محصول است. رنگ روی هر ۱۰۰ کیلو اضافه می‌شود.
      </p>
    </div>
  )
}

function FormulaView(props: {
  catalog: Catalog; update: Update; entry: Entry; all: Entry[]; unit: Unit; setUnit: (u: Unit) => void; onOpen: (k: string) => void
}) {
  const { catalog, update, entry, all, unit, setUnit, onOpen } = props
  const locked = !entry.custom
  const fc = formulaCost(entry.items, catalog)
  const total = fc.totalKg
  const [confirmDel, setConfirmDel] = useState(false)
  const [msg, setMsg] = useState('')
  const usage = entry.kind === 'recipe' ? recipeUsage(entry.id, catalog) : null
  const source = entry.copiedFrom ? all.find(e => e.kind === entry.kind && e.id === entry.copiedFrom) : undefined
  const sourceCost = source ? formulaCost(source.items, catalog) : null

  const edit = (fn: (items: RecipeItem[]) => RecipeItem[] | void) => {
    if (locked) return
    update(s => {
      const obj = entry.kind === 'recipe' ? s.catalog.recipes[entry.id] : s.catalog.colors[entry.id]
      const out = fn(obj.items)
      if (out) obj.items = out
    })
  }
  const nameOf = (i: RecipeItem) =>
    i.ref.kind === 'material' ? catalog.materials[i.ref.id]?.name ?? i.ref.id : `${catalog.recipes[i.ref.id]?.name ?? i.ref.id} (نیمه‌ساخته)`

  const shown = (i: RecipeItem) => (unit === 'g' ? i.qtyKg * 1000 : unit === 'pct' ? (total > 0 ? (i.qtyKg / total) * 100 : 0) : i.qtyKg)
  const setShown = (idx: number, v: number) => {
    if (v < 0) return
    edit(items => {
      if (unit === 'pct') return setItemPercent(items, idx, v) ?? undefined
      items[idx].qtyKg = Math.round((unit === 'g' ? v / 1000 : v) * 1e6) / 1e6
    })
  }
  const step = unit === 'kg' ? 1 : unit === 'g' ? 10 : 0.5
  const round = (v: number) => Math.round(v * 100) / 100
  const unitLabel = unit === 'kg' ? 'کیلو' : unit === 'g' ? 'گرم' : 'درصد'

  const addOptions = [
    ...Object.values(catalog.materials).map(m => ({ k: `material:${m.id}`, label: m.name })),
    ...(entry.kind === 'recipe'
      ? Object.values(catalog.recipes).filter(r => !dependsOn(catalog, r.id, entry.id)).map(r => ({ k: `recipe:${r.id}`, label: `${r.name} (نیمه‌ساخته)` }))
      : []),
  ].filter(o => !entry.items.some(i => `${i.ref.kind}:${i.ref.id}` === o.k))

  const duplicate = () => {
    const id = `f-${Date.now().toString(36)}`
    const copiedFrom = entry.custom ? entry.copiedFrom ?? entry.id : entry.id
    const items = entry.items.map(i => ({ ref: { ...i.ref }, qtyKg: i.qtyKg }))
    update(s => {
      if (entry.kind === 'color') s.catalog.colors[id] = { id, name: `${entry.name} (کپی)`, items, custom: true, copiedFrom, ...(catalog.colors[entry.id].hex ? { hex: catalog.colors[entry.id].hex } : {}) }
      else s.catalog.recipes[id] = { id, name: `${entry.name} (کپی)`, items, custom: true, kind: entry.semi ? 'semi' : 'base', copiedFrom }
    })
    onOpen(`${entry.kind}:${id}`)
  }

  const remove = () => {
    if (usage && (usage.products.length > 0 || usage.recipes.length > 0)) {
      setMsg(`این فرمول در جای دیگری استفاده شده (${[...usage.products.map(p => p.name), ...usage.recipes.map(r => r.name)].join('، ')}). اول آن‌ها را عوض کنید.`)
      setConfirmDel(false)
      return
    }
    update(s => { if (entry.kind === 'recipe') delete s.catalog.recipes[entry.id]; else delete s.catalog.colors[entry.id] })
  }

  const parts = fc.rows.map(r => ({ id: r.item.ref.id, label: nameOf(r.item), kg: r.item.qtyKg, cost: r.cost ?? 0 }))
  const costTotal = parts.reduce((s, p) => s + p.cost, 0) || 1

  return (
    <div className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {entry.name}
        {locked && <><LockIcon /><InfoTip>{LOCK_TEXT}</InfoTip></>}
        {entry.custom && <Tag kind="info">آزمایشی</Tag>}
      </h2>

      {locked && (
        <div className="locked-banner">
          <LockIcon />
          <span>ویرایش این فرمول فعلاً قفل است.</span>
          <InfoTip>{LOCK_TEXT}</InfoTip>
          <button className="btn" onClick={duplicate}>کپی برای آزمایش</button>
        </div>
      )}

      {entry.kind === 'color' && (
        <div className="row">
          <Swatch hex={colorSwatch(catalog.colors[entry.id], catalog)} large />
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            رنگ نمایشی
            <input type="color" value={colorSwatch(catalog.colors[entry.id], catalog)} onChange={e => update(s => { s.catalog.colors[entry.id].hex = e.target.value })} />
          </label>
          {catalog.colors[entry.id].hex && (
            <button className="btn ghost" onClick={() => update(s => { delete s.catalog.colors[entry.id].hex })}>برگشت به رنگ خودکار</button>
          )}
          <span className="muted">رنگ نمایشی فقط برای دیدن در برنامه است و روی قیمت اثر ندارد.</span>
        </div>
      )}

      <div className="row">
        <div className="seg" role="group" aria-label="واحد">
          {(['kg', 'g', 'pct'] as const).map(u => (
            <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === 'kg' ? 'کیلو' : u === 'g' ? 'گرم' : 'درصد'}</button>
          ))}
        </div>
        {!locked && (
          <>
            <button className="btn ghost" onClick={() => edit(items => normalizeTo(items, 100))} disabled={total <= 0}>نرمال روی ۱۰۰ کیلو</button>
            <button className="btn ghost" onClick={duplicate}>کپی</button>
            {confirmDel ? (
              <>
                <button className="btn danger" onClick={remove}>حذف فرمول</button>
                <button className="btn ghost" onClick={() => setConfirmDel(false)}>نه</button>
              </>
            ) : (
              <button className="btn danger" onClick={() => setConfirmDel(true)}>حذف فرمول</button>
            )}
          </>
        )}
        {!locked && <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>نام<TextInput required value={entry.name} onChange={v => update(s => { if (entry.kind === 'recipe') s.catalog.recipes[entry.id].name = v; else s.catalog.colors[entry.id].name = v })} /></label>}
      </div>
      {msg && <div className="alert err" onClick={() => setMsg('')}>{msg}</div>}

      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>جزء</th><th className="n">مقدار ({unitLabel})</th><th className="n">سهم از وزن</th><th>سهم از هزینه</th><th className="n">هزینه</th>{!locked && <th />}</tr>
          </thead>
          <tbody>
            {entry.items.map((it, idx) => {
              const r = fc.rows[idx]
              const share = total > 0 ? (it.qtyKg / total) * 100 : 0
              const cshare = r.cost == null ? 0 : (r.cost / costTotal) * 100
              return (
                <tr key={`${it.ref.kind}:${it.ref.id}`}>
                  <td><span className="minibar" style={{ width: 10, height: 10, background: colorOf(it.ref.id), borderRadius: 3, marginInlineEnd: 8 }} />{nameOf(it)}</td>
                  <td className="n" style={{ whiteSpace: 'nowrap' }}>
                    <NumInput value={round(shown(it))} decimals={2} readOnly={locked} onChange={v => setShown(idx, v ?? 0)} />
                    {!locked && (
                      <span className="stepper">
                        <button aria-label="کم کن" onClick={() => setShown(idx, Math.max(0, round(shown(it) - step)))}>−</button>
                        <button aria-label="زیاد کن" onClick={() => setShown(idx, round(shown(it) + step))}>+</button>
                      </span>
                    )}
                  </td>
                  <td className="n">{fa(share, 1)}٪</td>
                  <td>
                    <span className="minibar" style={{ width: `${Math.max(2, cshare)}px`, maxWidth: 120, background: colorOf(it.ref.id) }} /> {fa(cshare, 0)}٪
                  </td>
                  <td className="n">{r.cost == null ? <Tag kind="err">بدون قیمت</Tag> : formatToman(r.cost)}</td>
                  {!locked && <td><button className="btn danger" onClick={() => edit(items => { items.splice(idx, 1) })}>حذف</button></td>}
                </tr>
              )
            })}
            {entry.items.length === 0 && <tr><td colSpan={6} className="muted">این فرمول هنوز جزئی ندارد. از پایین یک ماده اضافه کنید.</td></tr>}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="row" style={{ marginTop: 12 }}>
          <select id="add-item" defaultValue="" aria-label="افزودن جزء">
            <option value="" disabled>افزودن ماده یا نیمه‌ساخته…</option>
            {addOptions.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
          </select>
          <button className="btn" onClick={() => {
            const el = document.getElementById('add-item') as HTMLSelectElement
            if (!el.value) return
            const [kind, id] = el.value.split(':') as ['material' | 'recipe', string]
            edit(items => { items.push({ ref: { kind, id }, qtyKg: 0 }) })
            el.value = ''
          }}>افزودن</button>
        </div>
      )}

      {fc.rows.length > 0 && total > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <span className="field-label">ترکیب وزنی</span>
            <div className="bar" role="img" aria-label="سهم وزنی هر جزء">
              {parts.map(p => <i key={p.id} style={{ width: `${(p.kg / total) * 100}%`, background: colorOf(p.id) }} title={`${p.label}: ${formatKg(p.kg)} کیلو`} />)}
            </div>
            <div className="legend">{parts.map(p => <span key={p.id}><em style={{ background: colorOf(p.id) }} />{p.label}</span>)}</div>
          </div>
          <div>
            <span className="field-label">کدام ماده بیشترین هزینه را می‌برد؟</span>
            <div className="bar" role="img" aria-label="سهم هزینه‌ی هر جزء">
              {parts.map(p => <i key={p.id} style={{ width: `${(p.cost / costTotal) * 100}%`, background: colorOf(p.id) }} title={`${p.label}: ${formatToman(p.cost)}`} />)}
            </div>
          </div>
        </div>
      )}

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi"><span>وزن کل</span><b>{formatKg(total)} کیلو</b></div>
        <div className="kpi"><span>هزینه مواد هر کیلو</span><b>{formatToman(fc.perKg)}{fc.incomplete && ' *'}</b></div>
        <div className="kpi"><span>هزینه کل این فرمول</span><b>{formatToman(fc.totalCost)}{fc.incomplete && ' *'}</b></div>
        {source && sourceCost && sourceCost.perKg > 0 && (
          <div className="kpi">
            <span>نسبت به «{source.name}»</span>
            <b className={fc.perKg > sourceCost.perKg ? 'over' : ''}>
              {fc.perKg >= sourceCost.perKg ? '▲' : '▼'} {fa(Math.abs((fc.perKg / sourceCost.perKg - 1) * 100), 1)}٪
            </b>
          </div>
        )}
      </div>
      {fc.incomplete && <p className="muted">* قیمت بعضی مواد وارد نشده و در هزینه نیامده است.</p>}
      {usage && (usage.products.length > 0 || usage.recipes.length > 0) && (
        <p className="muted">
          این فرمول استفاده شده در: {usage.products.length > 0 && `${toFa(usage.products.length)} محصول`}
          {usage.products.length > 0 && usage.recipes.length > 0 && ' و '}
          {usage.recipes.length > 0 && usage.recipes.map(r => r.name).join('، ')}
        </p>
      )}
    </div>
  )
}

/** "What if this were the real formula?" Prices are computed on a copy, nothing is changed. */
function FormulaTest({ catalog, entry, all }: { catalog: Catalog; entry: Entry; all: Entry[] }) {
  const targets = all.filter(e => e.kind === entry.kind && e.id !== entry.id)
  const [targetId, setTargetId] = useState<string>(entry.copiedFrom && targets.some(t => t.id === entry.copiedFrom) ? entry.copiedFrom : targets.find(t => !t.custom)?.id ?? '')
  const colorables = Object.values(catalog.products).filter(p => p.colorable && p.weightPer3mG != null)
  const [productId, setProductId] = useState(colorables.find(p => p.id === 'flex')?.id ?? colorables[0]?.id ?? '')
  const colorChoices = Object.values(catalog.colors).filter(c => !c.custom)
  const [colorId, setColorId] = useState(colorChoices[0]?.id ?? '')
  const tariff = catalog.tariffs[0]

  const result = useMemo(() => {
    if (!targetId || !tariff) return null
    const alt = withReplacement(catalog, entry.kind, targetId, entry.items)
    const col = entry.kind === 'color' ? targetId : colorId
    const diffs = Object.values(catalog.products).flatMap(p => {
      const c = p.colorable ? col || null : null
      const a = priceProduct(p, c, tariff, catalog).salePerKg
      const b = priceProduct(p, c, tariff, alt).salePerKg
      return a > 0 && Math.abs(b - a) > 1e-6 ? [(b / a - 1) * 100] : []
    })
    const p = catalog.products[productId]
    const now = p ? priceProduct(p, p.colorable ? col || null : null, tariff, catalog) : null
    const next = p ? priceProduct(p, p.colorable ? col || null : null, tariff, alt) : null
    return { diffs, now, next, p }
  }, [catalog, entry, targetId, productId, colorId, tariff])

  if (targets.length === 0) return null
  const pct = (a: number | null, b: number | null) => (a && b ? ((b / a - 1) * 100) : null)
  const d = result?.now && result.next ? pct(result.now.perStick, result.next.perStick) : null

  return (
    <div className="card">
      <h2>آزمایش اثر روی قیمت <InfoTip><p>این بخش فقط محاسبه می‌کند و هیچ چیزی را تغییر نمی‌دهد. نشان می‌دهد اگر این فرمول جای فرمول انتخاب‌شده می‌نشست، قیمت‌ها چه می‌شد.</p><p>برای استفاده‌ی واقعی، در تب «محصولات» فرمول پایه‌ی یک محصول را روی فرمول جدید بگذارید (فقط برای همان محصول).</p></InfoTip></h2>
      <div className="row">
        <label>جایگزین کدام فرمول شود؟
          <select value={targetId} onChange={e => setTargetId(e.target.value)}>
            {targets.map(t => <option key={t.id} value={t.id}>{t.name}{t.custom ? ' (آزمایشی)' : ''}</option>)}
          </select>
        </label>
        <label>محصول نمونه
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            {colorables.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {entry.kind !== 'color' && (
          <label>رنگ نمونه
            <select value={colorId} onChange={e => setColorId(e.target.value)}>
              {colorChoices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {result && result.now && result.next && (
        <>
          <div className="kpis">
            <div className="kpi"><span>قیمت شاخه {result.p.name} (فعلی)</span><b>{formatToman(result.now.perStick)}</b></div>
            <div className="kpi" style={{ ['--k' as string]: 'var(--accent)' }}><span>با فرمول آزمایشی</span><b>{formatToman(result.next.perStick)}</b></div>
            <div className="kpi">
              <span>تغییر</span>
              <b className={d != null && d > 0 ? 'over' : ''}>{d == null ? '—' : `${d >= 0 ? '▲' : '▼'} ${fa(Math.abs(d), 1)}٪`}</b>
            </div>
          </div>
          <p className="muted">
            {result.diffs.length === 0
              ? 'با این جایگزینی قیمت هیچ محصولی تغییر نمی‌کند.'
              : `قیمت ${toFa(result.diffs.length)} محصول تغییر می‌کند (قیمت هر کیلو: ${Math.min(...result.diffs).toFixed(1) === Math.max(...result.diffs).toFixed(1) ? signed(result.diffs[0]) : `از ${signed(Math.min(...result.diffs))} تا ${signed(Math.max(...result.diffs))}`}).`}
            {' '}مقایسه با تعرفه «{tariff.name}» انجام شده است.
          </p>
        </>
      )}
    </div>
  )
}
