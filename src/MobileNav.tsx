import { useEffect, type ReactNode } from 'react'
import { toFa } from './core'

interface Props<T extends string> {
  tabs: readonly T[]
  current: T
  tabKey: Record<T, string>
  onSelect: (t: T) => void
  issueCount: number
}

/** The tabs a person reaches for most, in the order they are shown at the bottom of a phone screen. */
const FAVOURITES = ['لیست قیمت', 'پارت تولید', 'محصول ساخته‌شده', 'انبار', 'شروع کار']

const label = (t: string, issues: number) => (t === 'هشدارها' && issues > 0 ? `${t} (${toFa(issues)})` : t)

/** Phone layout: four main sections always one thumb away, everything else under «بیشتر». */
export function BottomBar<T extends string>({ tabs, current, tabKey, onSelect, issueCount, onMore }: Props<T> & { onMore: () => void }) {
  const main = FAVOURITES.filter((t): t is T => (tabs as readonly string[]).includes(t)).slice(0, 4)
  const inMain = main.includes(current)
  return (
    <nav className="bottombar print-hide" aria-label="منوی اصلی">
      {main.map(t => (
        <button key={t} className={t === current ? 'on' : ''} style={{ ['--tab' as string]: `var(--c-${tabKey[t]})` }} onClick={() => onSelect(t)}>
          <i aria-hidden="true" />
          <span>{t}</span>
        </button>
      ))}
      <button className={inMain ? '' : 'on'} style={{ ['--tab' as string]: inMain ? 'var(--brand)' : `var(--c-${tabKey[current]})` }} onClick={onMore}>
        <i aria-hidden="true" />
        <span>{inMain ? 'بیشتر' : current}</span>
        {inMain && issueCount > 0 && <b className="badge">{toFa(issueCount)}</b>}
      </button>
    </nav>
  )
}

/** Slide-in menu with every section the person may open, plus the account actions. */
export function Drawer<T extends string>({ open, onClose, tabs, current, tabKey, onSelect, issueCount, who, children }: Props<T> & { open: boolean; onClose: () => void; who: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="drawer print-hide" role="dialog" aria-modal="true" aria-label="منو">
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer-panel">
        <div className="drawer-head">
          <b>{who}</b>
          <button className="btn ghost" onClick={onClose} aria-label="بستن منو">✕</button>
        </div>
        <ul className="drawer-list">
          {tabs.map(t => (
            <li key={t}>
              <button className={t === current ? 'on' : ''} style={{ ['--tab' as string]: `var(--c-${tabKey[t]})` }} onClick={() => { onSelect(t); onClose() }}>
                <i aria-hidden="true" />
                {label(t, issueCount)}
              </button>
            </li>
          ))}
        </ul>
        <div className="drawer-actions">{children}</div>
      </aside>
    </div>
  )
}
