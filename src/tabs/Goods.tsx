import { useMemo, useState } from 'react'
import {
  REASON_LABEL, colorSwatch, fmtLen, formatKg, goodsSentence, goodsStock, lengthChoices, stickKg, toFa, toJalaliDate, todayIso,
  type GoodsMove, type GoodsReason, type Id,
} from '../core'
import type { AppState, Update } from '../store'
import { DateField } from '../DateField'
import { DEMO } from '../demo'
import { InfoTip, NumInput, Swatch, Tag } from '../ui'

type Mode = 'in' | 'out'

interface Draft {
  productId: Id | ''
  colorId: Id | null
  lengthM: number | null
  sticks: number | null
  batchId: string
  scrapKg: number | null
  scrapReturned: boolean
  reason: GoodsReason
  party: string
  date: string
  note: string
}

const blank = (): Draft => ({
  productId: '', colorId: null, lengthM: null, sticks: null, batchId: '', scrapKg: null, scrapReturned: true,
  reason: 'sale', party: '', date: todayIso(), note: '',
})

interface Step {
  title: string
  help: string
  ok: boolean
  body: React.ReactNode
}

function Wizard({ steps, onCancel, onDone, doneLabel }: { steps: Step[]; onCancel: () => void; onDone: () => void; doneLabel: string }) {
  const [i, setI] = useState(0)
  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  return (
    <div className="wiz">
      <ol className="wiz-dots" aria-label="مرحله‌ها">
        {steps.map((s, k) => (
          <li key={s.title} className={k === i ? 'on' : k < i ? 'done' : ''}>
            <button type="button" disabled={k > i} onClick={() => setI(k)} title={s.title}>{toFa(k + 1)}</button>
          </li>
        ))}
      </ol>
      <h3 className="wiz-title">{step.title}</h3>
      <p className="muted help">{step.help}</p>
      <div className="wiz-body">{step.body}</div>
      <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
        <button className="btn ghost" onClick={i === 0 ? onCancel : () => setI(i - 1)}>{i === 0 ? 'انصراف' : 'قبلی'}</button>
        {last ? (
          <button className="btn" disabled={!step.ok} onClick={onDone}>{doneLabel}</button>
        ) : (
          <button className="btn" disabled={!step.ok} onClick={() => setI(i + 1)}>بعدی</button>
        )}
        {i > 0 && <button className="btn ghost" onClick={onCancel}>انصراف</button>}
      </div>
    </div>
  )
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pick" aria-pressed={on} onClick={onClick}>{children}</button>
}

export function Goods({ state, update, readOnly, canDelete }: { state: AppState; update: Update; readOnly?: boolean; canDelete?: boolean }) {
  const { catalog, goods, batches } = state
  const [mode, setMode] = useState<Mode | null>(null)
  const [d, setD] = useState<Draft>(blank)
  const [filter, setFilter] = useState<'all' | GoodsMove['type']>('all')
  const [done, setDone] = useState('')
  const [sure, setSure] = useState('')
  const stock = useMemo(() => goodsStock(goods), [goods])
  const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }))

  const nameOf = (id: Id | '' | undefined) => (id ? catalog.products[id]?.name ?? id : '')
  const colorName = (id: Id | null) => (id ? catalog.colors[id]?.name ?? id : 'بدون رنگ')
  const product = d.productId ? catalog.products[d.productId] : undefined
  const productList = Object.values(catalog.products)
  const colorList = Object.values(catalog.colors)

  const open = (m: Mode) => { setMode(m); setD(blank()); setDone('') }
  const close = () => setMode(null)

  const save = () => {
    if (!mode) return
    const stamp = Date.now().toString(36)
    update(s => {
      if (mode === 'in') {
        s.goods.push({ id: `G${stamp}`, date: d.date, type: 'in', productId: d.productId, colorId: product?.colorable ? d.colorId : null, lengthM: d.lengthM!, sticks: d.sticks!, batchId: d.batchId || undefined, note: d.note.trim() || undefined })
        if (d.scrapKg && d.scrapKg > 0) {
          s.goods.push({ id: `G${stamp}s`, date: d.date, type: 'scrap', productId: d.productId, kg: d.scrapKg, returned: d.scrapReturned, batchId: d.batchId || undefined })
          if (d.scrapReturned && s.catalog.materials.waste) {
            s.movements.push({ id: `M${stamp}w`, date: d.date, materialId: 'waste', kg: d.scrapKg, type: 'waste_in', note: `ضایعات برگشتی از ساخت ${nameOf(d.productId)}` })
          }
        }
      } else {
        s.goods.push({ id: `G${stamp}`, date: d.date, type: 'out', productId: d.productId, colorId: d.colorId, lengthM: d.lengthM!, sticks: d.sticks!, reason: d.reason, party: d.party.trim() || undefined, note: d.note.trim() || undefined })
      }
    })
    const what = `${toFa(d.sticks ?? 0)} شاخه ${fmtLen(d.lengthM ?? 0)} متری ${nameOf(d.productId)}`
    setDone(mode === 'in' ? `ثبت شد: ${what} به موجودی اضافه شد.` : `ثبت شد: ${what} از موجودی کم شد.`)
    close()
  }

  const remove = (id: string) => {
    if (sure !== id) return setSure(id)
    setSure('')
    update(s => {
      const g = s.goods.find(x => x.id === id)
      s.goods = s.goods.filter(x => x.id !== id)
      // the demo has no server to take returned waste out of the materials store again
      if (DEMO && g?.type === 'scrap' && g.returned && g.kg) s.movements.push({ id: `M${Date.now().toString(36)}d`, date: g.date, materialId: 'waste', kg: -g.kg, type: 'adjust', note: 'حذف ضایعات برگشتیِ ثبت‌شده' })
    })
  }

  // ---- the two step-by-step flows ----
  const selected = stock.find(r => r.productId === d.productId && r.colorId === d.colorId && r.lengthM === d.lengthM)
  const have = selected?.sticks ?? 0
  const w = product ? stickKg(product, d.lengthM ?? 0) : null
  const totalKgText = (n: number | null) => (w != null && n ? ` (حدود ${formatKg(w * n)} کیلو)` : '')
  const recentBatches = batches.slice(0, 15)

  const inSteps: Step[] = [
    {
      title: 'کدام محصول ساخته شد؟',
      help: 'روی اسم محصول بزنید. اگر این کار نتیجه‌ی یکی از پارت‌هایی است که در برنامه ثبت کرده‌اید، پارت را انتخاب کنید تا محصول و رنگ خودش پر شود.',
      ok: !!d.productId,
      body: (
        <>
          {recentBatches.length > 0 && (
            <label style={{ maxWidth: 360, marginBottom: 12 }}>از روی پارت (اختیاری)
              <select value={d.batchId} onChange={e => {
                const b = batches.find(x => x.id === e.target.value)
                set(b ? { batchId: b.id, productId: b.productId, colorId: b.colorId } : { batchId: '' })
              }}>
                <option value="">— انتخاب نکنم —</option>
                {recentBatches.map(b => <option key={b.id} value={b.id}>{toJalaliDate(b.date)} · {nameOf(b.productId)}{b.colorId ? ` · ${colorName(b.colorId)}` : ''}</option>)}
              </select>
            </label>
          )}
          <div className="picks">
            {productList.map(p => <Choice key={p.id} on={d.productId === p.id} onClick={() => set({ productId: p.id, colorId: p.colorable ? d.colorId : null })}>{p.name}<small>{p.code}</small></Choice>)}
          </div>
        </>
      ),
    },
    ...(product?.colorable ? [{
      title: 'چه رنگی؟',
      help: 'رنگ همین محصول را انتخاب کنید.',
      ok: !!d.colorId,
      body: (
        <div className="picks">
          {colorList.map(c => <Choice key={c.id} on={d.colorId === c.id} onClick={() => set({ colorId: c.id })}><Swatch hex={colorSwatch(c, catalog)} /> {c.name}</Choice>)}
        </div>
      ),
    }] : []),
    {
      title: 'طول هر شاخه چند متر است؟',
      help: 'اگر شاخه‌ها را بریده‌اید، طول بریده‌شده را بزنید (مثلاً ۱ متری). اگر عدد دیگری است در کادر بنویسید.',
      ok: !!d.lengthM && d.lengthM > 0,
      body: (
        <>
          <div className="picks">
            {lengthChoices(product).map(m => <Choice key={m} on={d.lengthM === m} onClick={() => set({ lengthM: m })}>{fmtLen(m)} متری</Choice>)}
          </div>
          <label style={{ maxWidth: 220, marginTop: 12 }}>طول دیگر<NumInput live unit="متر" value={d.lengthM} decimals={2} onChange={v => set({ lengthM: v })} /></label>
        </>
      ),
    },
    {
      title: 'چند شاخه ساخته شد؟',
      help: 'فقط شاخه‌های سالم را بشمارید. شاخه‌ی خراب را حساب نکنید؛ ضایعاتش را در مرحله‌ی بعد می‌نویسید.',
      ok: !!d.sticks && d.sticks > 0 && Number.isInteger(d.sticks),
      body: (
        <>
          <label style={{ maxWidth: 220 }}>تعداد شاخه<NumInput live unit="شاخه" decimals={0} value={d.sticks} onChange={v => set({ sticks: v == null ? null : Math.round(v) })} /></label>
          {d.sticks != null && d.sticks > 0 && d.lengthM ? <p className="muted">یعنی {toFa(d.sticks)} × {fmtLen(d.lengthM)} = {toFa(formatKg(d.sticks * d.lengthM))} متر{totalKgText(d.sticks)}.</p> : null}
        </>
      ),
    },
    {
      title: 'ضایعات این کار (اختیاری)',
      help: 'اگر هنگام ساخت چیزی خراب یا دورریز شد، وزنش را بنویسید. اگر ضایعاتی نبود، خالی بگذارید و بروید مرحله‌ی بعد.',
      ok: true,
      body: (
        <>
          <label style={{ maxWidth: 220 }}>وزن ضایعات<NumInput live unit="کیلو" value={d.scrapKg} onChange={v => set({ scrapKg: v })} /></label>
          {d.scrapKg != null && d.scrapKg > 0 && (
            <div className="picks" style={{ marginTop: 12 }}>
              <Choice on={d.scrapReturned} onClick={() => set({ scrapReturned: true })}>برمی‌گردد به تولید<small>به انبار مواد (ضایعات) اضافه می‌شود</small></Choice>
              <Choice on={!d.scrapReturned} onClick={() => set({ scrapReturned: false })}>دور ریخته می‌شود<small>فقط ثبت می‌شود</small></Choice>
            </div>
          )}
        </>
      ),
    },
    dateStep(d, set),
    {
      title: 'یک بار مرور کنید',
      help: 'اگر درست است «ثبت» را بزنید. برای اصلاح هر مورد روی شماره‌ی مرحله‌ی بالا بزنید.',
      ok: true,
      body: <Summary lines={[
        `محصول: ${nameOf(d.productId)}${product?.colorable ? ` · رنگ ${colorName(d.colorId)}` : ''}`,
        `${toFa(d.sticks ?? 0)} شاخه ${fmtLen(d.lengthM ?? 0)} متری${totalKgText(d.sticks)}`,
        d.scrapKg ? `ضایعات: ${formatKg(d.scrapKg)} کیلو، ${d.scrapReturned ? 'به انبار مواد برمی‌گردد' : 'دور ریخته می‌شود'}` : 'ضایعات: ندارد',
        `تاریخ: ${toJalaliDate(d.date)}`,
      ]} />,
    },
  ]

  const outSteps: Step[] = [
    {
      title: 'کدام محصول از انبار بیرون رفت؟',
      help: 'این‌ها محصولاتی است که الان در انبار داریم. روی همان که بیرون می‌رود بزنید.',
      ok: !!selected,
      body: stock.length === 0 ? <div className="alert">الان هیچ محصولی در انبار ثبت نشده است. اول باید «محصول ساخته شد» را ثبت کنید.</div> : (
        <div className="picks">
          {stock.map(r => (
            <Choice key={r.key} on={d.productId === r.productId && d.colorId === r.colorId && d.lengthM === r.lengthM} onClick={() => set({ productId: r.productId, colorId: r.colorId, lengthM: r.lengthM, sticks: null })}>
              {nameOf(r.productId)}{r.colorId ? <> · <Swatch hex={colorSwatch(catalog.colors[r.colorId], catalog)} /> {colorName(r.colorId)}</> : null}
              <small>{fmtLen(r.lengthM)} متری · {toFa(r.sticks)} شاخه موجود{r.sticks < 0 ? ' (منفی!)' : ''}</small>
            </Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'چند شاخه؟',
      help: `الان ${toFa(have)} شاخه از این محصول داریم. بیشتر از این را نمی‌شود بیرون برد.`,
      ok: !!d.sticks && d.sticks > 0 && d.sticks <= have && Number.isInteger(d.sticks),
      body: (
        <>
          <div className="row">
            <label style={{ maxWidth: 220 }}>تعداد شاخه<NumInput live unit="شاخه" decimals={0} value={d.sticks} onChange={v => set({ sticks: v == null ? null : Math.round(v) })} /></label>
            <button className="btn ghost" onClick={() => set({ sticks: have })}>همه‌اش ({toFa(have)})</button>
          </div>
          {d.sticks != null && d.sticks > have && <div className="alert err">از موجودی بیشتر است؛ فقط {toFa(have)} شاخه داریم.</div>}
          {d.sticks != null && d.sticks > 0 && d.sticks <= have && <p className="muted">بعد از این، {toFa(have - d.sticks)} شاخه می‌ماند{totalKgText(d.sticks)}.</p>}
        </>
      ),
    },
    {
      title: 'برای چه کاری و به چه کسی؟',
      help: 'دلیل خروج را انتخاب کنید و نام خریدار (یا گیرنده) را بنویسید. لازم نیست قیمتی ثبت شود.',
      ok: true,
      body: (
        <>
          <div className="picks">
            {(Object.keys(REASON_LABEL) as GoodsReason[]).map(r => <Choice key={r} on={d.reason === r} onClick={() => set({ reason: r })}>{REASON_LABEL[r]}</Choice>)}
          </div>
          <label style={{ maxWidth: 360, marginTop: 12 }}>نام خریدار یا گیرنده<input value={d.party} maxLength={100} onChange={e => set({ party: e.target.value })} /></label>
        </>
      ),
    },
    dateStep(d, set),
    {
      title: 'یک بار مرور کنید',
      help: 'اگر درست است «ثبت» را بزنید. بعد از ثبت، موجودی همان لحظه کم می‌شود.',
      ok: true,
      body: <Summary lines={[
        `${toFa(d.sticks ?? 0)} شاخه ${fmtLen(d.lengthM ?? 0)} متری ${nameOf(d.productId)}${d.colorId ? ` · رنگ ${colorName(d.colorId)}` : ''}${totalKgText(d.sticks)}`,
        `${REASON_LABEL[d.reason]} · خریدار: ${d.party.trim() || 'نام نوشته نشده'}`,
        `تاریخ: ${toJalaliDate(d.date)}`,
      ]} />,
    },
  ]

  // ---- tables ----
  const rows = [...goods].filter(g => filter === 'all' || g.type === filter).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150)
  const totalSticks = stock.reduce((s, r) => s + r.sticks, 0)
  const totalMeters = stock.reduce((s, r) => s + r.sticks * r.lengthM, 0)
  const scrapKg = goods.filter(g => g.type === 'scrap').reduce((s, g) => s + (g.kg ?? 0), 0)
  const scrapBack = goods.filter(g => g.type === 'scrap' && g.returned).reduce((s, g) => s + (g.kg ?? 0), 0)

  return (
    <>
      <div className="card">
        <h2>محصول ساخته‌شده <InfoTip>
          <p><b>چه چیزی ثبت می‌شود؟</b> هر وقت چند شاخه محصول ساخته شد، آن را «ساخته شد» می‌زنید و به موجودی اضافه می‌شود. هر وقت بیرون رفت (فروش، نمونه…)، «خارج شد» می‌زنید و کم می‌شود.</p>
          <p><b>طول شاخه</b>: هر شاخه می‌تواند ۱، ۲، ۳ متری یا هر طول دیگر باشد. موجودی برای هر طول جدا حساب می‌شود.</p>
          <p><b>ضایعات</b>: دورریز هر کار را می‌نویسید. اگر برگردانده شود، همان لحظه به انبار مواد اضافه می‌شود.</p>
        </InfoTip></h2>
        <p className="muted help">اینجا شاخه‌های ساخته‌شده و فروخته‌شده را ثبت می‌کنید تا همیشه بدانید چه چیزی در انبار داریم. هر ثبت چند مرحله‌ی کوتاه دارد و در هر مرحله توضیح می‌بینید.</p>
        {done && <div className="alert ok" onClick={() => setDone('')}>{done}</div>}
        {!readOnly && !mode && (
          <div className="row" style={{ marginBottom: 0 }}>
            <button className="btn big" onClick={() => open('in')}>＋ محصول ساخته شد</button>
            <button className="btn big ghost" onClick={() => open('out')}>− محصول از انبار خارج شد</button>
          </div>
        )}
        {mode && (
          <Wizard
            key={mode}
            steps={mode === 'in' ? inSteps : outSteps}
            onCancel={close}
            onDone={save}
            doneLabel={mode === 'in' ? 'ثبت: به موجودی اضافه شود' : 'ثبت: از موجودی کم شود'}
          />
        )}
      </div>

      <div className="row">
        <div className="kpi"><span>شاخه‌ی موجود</span><b>{toFa(totalSticks)}</b></div>
        <div className="kpi"><span>متراژ موجود</span><b>{toFa(formatKg(totalMeters))} متر</b></div>
        <div className="kpi"><span>کل ضایعات ثبت‌شده</span><b>{formatKg(scrapKg)} کیلو</b></div>
        <div className="kpi"><span>ضایعات برگشته به تولید</span><b>{formatKg(scrapBack)} کیلو</b></div>
      </div>

      <div className="card">
        <h2>موجودی محصول در انبار</h2>
        {stock.length === 0 ? <p className="muted">هنوز محصولی ثبت نشده است.</p> : (
          <div className="tablewrap scroll-box">
            <table>
              <thead className="sticky-head"><tr><th>محصول</th><th>رنگ</th><th className="n">طول شاخه</th><th className="n">تعداد شاخه</th><th className="n">متراژ</th><th className="n">وزن تقریبی (کیلو)</th></tr></thead>
              <tbody>
                {stock.map(r => {
                  const kg = stickKg(catalog.products[r.productId], r.lengthM)
                  return (
                    <tr key={r.key}>
                      <td>{nameOf(r.productId)}</td>
                      <td>{r.colorId ? <><Swatch hex={colorSwatch(catalog.colors[r.colorId], catalog)} /> {colorName(r.colorId)}</> : '—'}</td>
                      <td className="n">{fmtLen(r.lengthM)} متر</td>
                      <td className="n">{r.sticks < 0 ? <Tag kind="err">{toFa(r.sticks)}</Tag> : toFa(r.sticks)}</td>
                      <td className="n">{toFa(formatKg(r.sticks * r.lengthM))}</td>
                      <td className="n">{kg == null ? '—' : formatKg(kg * r.sticks)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>تاریخچه</h2>
        {canDelete && <p className="muted help">اگر چیزی را آزمایشی یا اشتباه ثبت کرده‌اند، با «حذف» از لیست برمی‌دارید. موجودی خودش درست می‌شود. فقط ادمین حذف می‌کند.</p>}
        <div className="chips" style={{ marginBottom: 10 }}>
          {([['all', 'همه'], ['in', 'ساخته شد'], ['out', 'خارج شد'], ['scrap', 'ضایعات']] as const).map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <div className="tablewrap scroll-box">
          <table>
            <thead className="sticky-head"><tr><th>تاریخ</th><th>شرح</th>{canDelete && <th />}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} className="muted">موردی نیست.</td></tr>}
              {rows.map(g => <tr key={g.id}><td>{toJalaliDate(g.date)}</td><td>{goodsSentence(g, catalog)}{g.note ? ` — ${g.note}` : ''}</td>{canDelete && <td><button className="btn danger" onClick={() => remove(g.id)} onBlur={() => setSure('')}>{sure === g.id ? 'مطمئنید؟ دوباره بزنید' : 'حذف'}</button></td>}</tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function dateStep(d: Draft, set: (p: Partial<Draft>) => void): Step {
  return {
    title: 'تاریخ و توضیح',
    help: 'تاریخ پیش‌فرض امروز است. اگر مربوط به روز دیگری است عوضش کنید. توضیح اختیاری است.',
    ok: !!d.date,
    body: (
      <div className="row">
        <div className="lbl"><span>تاریخ</span><DateField value={d.date} onChange={v => set({ date: v })} /></div>
        <label style={{ minWidth: 260, flex: 1 }}>توضیح (اختیاری)<input value={d.note} maxLength={200} onChange={e => set({ note: e.target.value })} /></label>
      </div>
    ),
  }
}

function Summary({ lines }: { lines: string[] }) {
  return <ul className="summary">{lines.map(l => <li key={l}>{l}</li>)}</ul>
}
