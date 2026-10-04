import { toGregorian, toJalaali } from 'jalaali-js'

const FA = '۰۱۲۳۴۵۶۷۸۹'
const AR = '٠١٢٣٤٥٦٧٨٩'

export const toFa = (s: string | number): string => String(s).replace(/\d/g, d => FA[+d])

export const fromFa = (s: string): string =>
  s
    .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
    .replace(/٬|,/g, '')
    .replace(/٫/g, '.')

/** Parses a number typed with Persian or Latin digits and separators. */
export function parseNum(s: string): number | null {
  const t = fromFa(s).trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const formatToman = (n: number | null | undefined): string =>
  n == null ? '—' : toFa(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'))

export const formatKg = (n: number, digits = 3): string =>
  toFa(String(Number(n.toFixed(digits)))).replace('.', '٫')

/** Rial typed by the user -> Toman. */
export const rialToToman = (rial: number): number => rial / 10

export function toJalaliDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const j = toJalaali(y, m, d)
  return toFa(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`)
}

/** '1405/07/12' (Persian or Latin digits) -> ISO date, null when invalid. */
export function fromJalaliDate(s: string): string | null {
  const m = fromFa(s).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!m) return null
  const [jy, jm, jd] = [+m[1], +m[2], +m[3]]
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  const g = toGregorian(jy, jm, jd)
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}
