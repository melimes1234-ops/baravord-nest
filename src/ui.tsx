import { useState } from 'react'
import { formatKg, formatToman, parseNum, toFa } from './core'

/** Number field that accepts Persian/Latin digits and commits on blur. */
export function NumInput(props: {
  value: number | null
  onChange: (v: number | null) => void
  money?: boolean
  decimals?: number
  placeholder?: string
}) {
  const { value, onChange, money, decimals = 3, placeholder } = props
  const [text, setText] = useState<string | null>(null)
  const shown = value == null ? '' : money ? formatToman(value) : formatKg(value, decimals)
  return (
    <input
      className="num"
      inputMode="decimal"
      placeholder={placeholder ?? '—'}
      value={text ?? shown}
      onFocus={e => {
        setText(value == null ? '' : toFa(String(Number(value.toFixed(decimals)))))
        e.currentTarget.select()
      }}
      onChange={e => setText(e.target.value)}
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
