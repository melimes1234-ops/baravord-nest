import { useEffect, useRef, useState } from 'react'
import {
  JALALI_MONTHS, JALALI_WEEKDAYS, isoToJalali, jalaliMonthLength, jalaliToIso, jalaliWeekday, toFa, todayIso, toJalaliDate,
} from './core'

const SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** A date field with a Persian (Jalali) calendar. The value is an ISO date ('2026-10-04'); the default is today. */
export function DateField({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const shown = isoToJalali(value || todayIso())
  const [view, setView] = useState({ jy: shown.jy, jm: shown.jm })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const toggle = () => {
    if (!open) setView({ jy: shown.jy, jm: shown.jm })
    setOpen(o => !o)
  }
  const step = (months: number) => {
    const idx = view.jy * 12 + (view.jm - 1) + months
    setView({ jy: Math.floor(idx / 12), jm: (idx % 12) + 1 })
  }

  const today = todayIso()
  const lead = jalaliWeekday(view.jy, view.jm, 1)
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: jalaliMonthLength(view.jy, view.jm) }, (_, i) => i + 1),
  ]
  const weekdayName = JALALI_WEEKDAYS[jalaliWeekday(shown.jy, shown.jm, shown.jd)]

  return (
    <div className="date-wrap" ref={ref}>
      <button type="button" className="date-btn" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={label ?? 'انتخاب تاریخ'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        <span>{toJalaliDate(value || today)}</span>
        <em>{weekdayName}</em>
      </button>
      {open && (
        <div className="cal" role="dialog" aria-label="تقویم">
          <div className="cal-head">
            <button type="button" onClick={() => step(-12)} aria-label="سال قبل">«</button>
            <button type="button" onClick={() => step(-1)} aria-label="ماه قبل">‹</button>
            <b>{JALALI_MONTHS[view.jm - 1]} {toFa(view.jy)}</b>
            <button type="button" onClick={() => step(1)} aria-label="ماه بعد">›</button>
            <button type="button" onClick={() => step(12)} aria-label="سال بعد">»</button>
          </div>
          <div className="cal-grid cal-weekdays">
            {SHORT.map((d, i) => <span key={d} className={i === 6 ? 'fri' : ''} title={JALALI_WEEKDAYS[i]}>{d}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d == null) return <span key={`e${i}`} />
              const iso = jalaliToIso(view.jy, view.jm, d)
              const col = (lead + d - 1) % 7
              return (
                <button
                  key={d}
                  type="button"
                  className={`cal-day${iso === value ? ' sel' : ''}${iso === today ? ' today' : ''}${col === 6 ? ' fri' : ''}`}
                  onClick={() => { onChange(iso); setOpen(false) }}
                  aria-label={`${toFa(d)} ${JALALI_MONTHS[view.jm - 1]} ${toFa(view.jy)}`}
                  aria-pressed={iso === value}
                >
                  {toFa(d)}
                </button>
              )
            })}
          </div>
          <div className="cal-foot">
            <button type="button" className="btn ghost" onClick={() => { onChange(today); setOpen(false) }}>امروز</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>بستن</button>
          </div>
        </div>
      )}
    </div>
  )
}
