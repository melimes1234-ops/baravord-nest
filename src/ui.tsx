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

export const Tag = ({ kind = 'warn', children }: { kind?: 'warn' | 'err' | 'ok'; children: React.ReactNode }) => (
  <span className={`tag ${kind === 'warn' ? '' : kind}`}>{children}</span>
)

export function Swatch({ hex, large }: { hex: string; large?: boolean }) {
  return <span className={`swatch${large ? ' lg' : ''}`} style={{ background: hex }} aria-hidden="true" />
}
