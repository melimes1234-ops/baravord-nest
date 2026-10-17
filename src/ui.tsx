import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatKg, formatToman, fromFa, parseNum, toFa } from './core'

const SIG = /[0-9۰-۹٠-٩.٫]/

/** Groups the integer part in threes as you type: 2050000 -> ۲٬۰۵۰٬۰۰۰. Keeps one decimal point. */
function groupLive(raw: string, allowNegative: boolean): string {
  let s = fromFa(raw).replace(/[^\d.-]/g, '')
  const neg = allowNegative && s.startsWith('-')
  s = s.replace(/-/g, '')
  const dot = s.indexOf('.')
  const int = dot === -1 ? s : s.slice(0, dot)
  const frac = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, '')
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return toFa((neg ? '-' : '') + grouped + (frac !== null ? '.' + frac : '')).replace(/,/g, '٬').replace('.', '٫')
}

/**
 * Number field that accepts Persian/Latin digits and commits on blur.
 * With `money` the digits are grouped in threes while typing (the caret stays where it was).
 * `unit` is shown inside the field (تومان, کیلو, گرم, ٪ ...).
 */
export function NumInput(props: {
  value: number | null
  onChange: (v: number | null) => void
  money?: boolean
  decimals?: number
  placeholder?: string
  readOnly?: boolean
  unit?: string
  /** Also report every keystroke (not only on leaving the field), for step-by-step forms. */
  live?: boolean
}) {
  const { value, onChange, money, decimals = 3, placeholder, readOnly, unit, live } = props
  const [text, setText] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  // After React rewrites the text, put the caret back after the same digit the user just typed.
  useLayoutEffect(() => {
    if (caret.current != null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })
  const shown = value == null ? '' : money ? formatToman(value) : formatKg(value, decimals)
  const input = (
    <input
      ref={ref}
      className="num"
      inputMode="decimal"
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      placeholder={placeholder ?? '—'}
      value={text ?? shown}
      onFocus={e => {
        const el = e.currentTarget
        const plain = value == null ? '' : String(Number(value.toFixed(decimals)))
        setText(money ? groupLive(plain, true) : toFa(plain))
        setTimeout(() => el.select(), 0)
      }}
      onChange={e => {
        const raw = e.currentTarget.value
        if (live) onChange(parseNum(raw))
        if (!money) return setText(raw)
        const pos = e.currentTarget.selectionStart ?? raw.length
        const typed = [...raw.slice(0, pos)].filter(ch => SIG.test(ch)).length
        const next = groupLive(raw, false)
        let seen = 0
        let idx = 0
        while (idx < next.length && seen < typed) {
          if (SIG.test(next[idx])) seen++
          idx++
        }
        caret.current = idx
        if (live) onChange(parseNum(next))
        setText(next)
      }}
      onBlur={() => {
        if (text != null) {
          const n = parseNum(text)
          if (n == null && text.trim() !== '') {
            // not a number: ignore the edit
          } else onChange(n)
        }
        setText(null)
      }}
    />
  )
  return unit ? (
    <span className="unit-wrap">
      {input}
      <span className="unit" aria-hidden="true">{unit}</span>
    </span>
  ) : (
    input
  )
}

export const Tag = ({ kind = 'warn', children }: { kind?: 'warn' | 'err' | 'ok' | 'info'; children: React.ReactNode }) => (
  <span className={`tag ${kind === 'warn' ? '' : kind}`}>{children}</span>
)

export function Swatch({ hex, large }: { hex: string; large?: boolean }) {
  return <span className={`swatch${large ? ' lg' : ''}`} style={{ background: hex }} aria-hidden="true" />
}

/** "▲ ۵٪ بیشتر" / "▼ ۱۰٪ کمتر" compared with the standard; red when beyond the allowed tolerance. */
export function DeltaBadge({ pct, tol }: { pct: number | null; tol: number }) {
  if (pct == null) return <Tag kind="info">خارج از فرمول</Tag>
  const r = Math.round(pct * 10) / 10
  if (Math.abs(r) < 0.05) return <Tag kind="ok">طبق فرمول</Tag>
  const up = r > 0
  const over = Math.abs(pct) > tol
  return (
    <span className={`delta ${up ? 'up' : 'down'}${over ? ' over' : ''}`}>
      {up ? '▲' : '▼'} {toFa(Math.abs(r))}٪ {up ? 'بیشتر' : 'کمتر'}
    </span>
  )
}

/** Text field that saves on blur, so a half-typed (or emptied) value is never sent to the server. */
export function TextInput(props: {
  value: string
  onChange: (v: string) => void
  /** Reject an empty value and keep the old one. */
  required?: boolean
  width?: number
  ltr?: boolean
  placeholder?: string
}) {
  const { value, onChange, required, width, ltr, placeholder } = props
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      value={text ?? value}
      placeholder={placeholder}
      style={{ width, direction: ltr ? 'ltr' : undefined }}
      onFocus={() => setText(value)}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        if (text != null && text !== value && !(required && text.trim() === '')) onChange(text.trim())
        setText(null)
      }}
    />
  )
}

/** A small "!" button whose explanation opens on hover, focus or tap. */
export function InfoTip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const lastPointer = useRef('')
  return (
    <span className="tip" onPointerEnter={e => e.pointerType === 'mouse' && setOpen(true)} onPointerLeave={e => e.pointerType === 'mouse' && setOpen(false)}>
      <button
        type="button"
        className="tip-btn"
        aria-label="توضیح"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={e => { lastPointer.current = e.pointerType }}
        // a mouse click only confirms what hovering already did; a finger or the keyboard toggles
        onClick={() => setOpen(o => (lastPointer.current === 'mouse' ? true : !o))}
        onBlur={() => setOpen(false)}
        onKeyDown={e => { lastPointer.current = ''; if (e.key === 'Escape') setOpen(false) }}
      >
        !
      </button>
      {open && <span role="tooltip" id={id} className="tip-pop">{children}</span>}
    </span>
  )
}

export function LockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="lock" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="قفل" role="img">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/** A figure card. Hover, focus or tap shows what it is and how it was calculated. */
export function Kpi(props: { label: string; children: ReactNode; tip?: ReactNode; accent?: string }) {
  const { label, children, tip, accent } = props
  return (
    <div className={`kpi${tip ? ' has-tip' : ''}`} tabIndex={tip ? 0 : undefined} style={accent ? ({ ['--k' as string]: accent } as React.CSSProperties) : undefined}>
      <span>{label}</span>
      <b>{children}</b>
      {tip && <span className="kpi-pop" role="tooltip">{tip}</span>}
    </div>
  )
}

/** "۹٬۴۷۶ تومان": the number stays left-to-right, the unit is read after it in Persian order. */
function BillValue({ v }: { v: ReactNode }) {
  if (typeof v === 'string') {
    const m = v.match(/^([-−\d۰-۹٬٫.,]+)\s+(\S.*)$/)
    if (m) return <><bdi dir="ltr">{m[1]}</bdi> {m[2]}</>
  }
  return <bdi dir="ltr">{v}</bdi>
}

/**
 * A tiny bill: a one-sentence explanation, labelled numbers, and a highlighted total.
 * Used instead of formulas so nobody has to read maths.
 */
export function Bill(props: {
  intro?: ReactNode
  rows: { label: string; value: ReactNode }[]
  total?: { label: string; value: ReactNode }
  note?: ReactNode
}) {
  const { intro, rows, total, note } = props
  return (
    <div className="bill">
      {intro && <p className="bill-intro">{intro}</p>}
      <dl className="bill-rows">
        {rows.map(r => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd><BillValue v={r.value} /></dd>
          </div>
        ))}
      </dl>
      {total && (
        <div className="bill-total">
          <span>{total.label}</span>
          <b><BillValue v={total.value} /></b>
        </div>
      )}
      {note && <p className="bill-note">{note}</p>}
    </div>
  )
}
