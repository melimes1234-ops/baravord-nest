import { priceProduct, roundTo, stickLength, widthMeters } from './costing'
import { isoToJalali } from './format'
import { seedCatalog } from './seed'
import type { Accessory, AccessoryGroup, Catalog, Id, Product, ProductGroup, Tariff } from './types'

/** The printed price list (the factory's «NEST – SUMMER 1405» sheet): one price per product, no colour written on it. */
export interface OfficialRow {
  id: Id
  name: string
  code: string
  size: string
  /** The number printed next to the drawing: metres of this profile per m2. */
  cover: string | null
  description: string
  perMeter: number | null
  perSqm: number | null
}

export const GROUP_LABEL: Record<ProductGroup | 'other', { en: string; fa: string }> = {
  cladding: { en: 'CLADDING', fa: 'نماپوش' },
  decking: { en: 'DECKING', fa: 'کفپوش' },
  vivards: { en: 'VIVARDS', fa: 'تخته پوشش' },
  trim: { en: 'TRIM', fa: 'تمام کننده' },
  other: { en: 'OTHER', fa: 'سایر' },
}
export const GROUP_ORDER: (ProductGroup | 'other')[] = ['cladding', 'decking', 'vivards', 'trim', 'other']

export const ACCESSORY_GROUP_LABEL: Record<AccessoryGroup, { en: string; fa: string }> = {
  clips: { en: 'ACCESSORIES', fa: 'کلیپس' },
  finishers: { en: 'FINISHERS', fa: '' },
  screws: { en: 'SCREW', fa: 'پیچ' },
  tiles: { en: 'TILES', fa: '' },
}
export const ACCESSORY_GROUP_ORDER: AccessoryGroup[] = ['clips', 'finishers', 'screws', 'tiles']

export interface OfficialList {
  title: string
  jalaliDate: string
  groups: { group: ProductGroup | 'other'; rows: OfficialRow[] }[]
  notes: string[]
  accessories: { group: AccessoryGroup; rows: Accessory[] }[]
  /** Cost parts left out of the prices; the printed list says so when it is not empty. */
  notIncluded: string[]
}

const stripUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const trim4 = (n: number) => String(Math.round(n * 10000) / 10000)

export function productSize(p: Product): string {
  if (p.sizeText) return p.sizeText
  if (p.widthMm == null || p.thicknessMm == null) return '—'
  return `${p.widthMm} × ${p.thicknessMm}`
}

/**
 * `view` is the catalog exactly as the price list shows it (parts switched off are zero in it, products carry their own profit),
 * so the printed list always agrees with the screen. The printed price of a profile is the one of the list's colour.
 */
export function buildOfficialList(view: Catalog, tariff: Tariff, payPct: number, notIncluded: string[], todayIso: string): OfficialList {
  // A catalog saved before the printed list existed has no list settings or product details yet: the starting ones fill the gaps.
  const seed = seedCatalog()
  const s = view.priceList ?? seed.priceList
  const fill = (p: Product): Product => {
    const d = seed.products[p.id]
    return d ? { group: d.group, description: d.description, coverPerM2: d.coverPerM2, showSqm: d.showSqm, sizeText: d.sizeText, ...stripUndefined(p) } : p
  }
  const step = s?.roundTo ?? 1000
  const sqmStep = s?.sqmRoundTo ?? 10_000
  const colorIds = Object.keys(view.colors)
  const colorId = s && view.colors[s.colorId] ? s.colorId : colorIds[0] ?? null

  const rowOf = (p: Product): OfficialRow => {
    const price = priceProduct(p, p.colorable ? colorId : null, tariff, view, payPct)
    const w = p.weightPer3mG
    // from the unrounded sale price, so the rounding to thousands happens once
    const raw = w == null ? null : (price.salePerKg * w) / (1000 * stickLength(p))
    const perMeter = raw == null ? null : roundTo(raw, step)
    const wm = widthMeters(p)
    const perSqm = p.showSqm && perMeter != null && wm != null ? roundTo(perMeter / wm, sqmStep) : null
    const cover = p.group === 'trim' || p.coverPerM2 === 0 ? null : p.coverPerM2 != null ? trim4(p.coverPerM2) : p.widthMm ? trim4(1000 / p.widthMm) : null
    return { id: p.id, name: p.name.toUpperCase(), code: p.code, size: productSize(p), cover, description: p.description ?? '', perMeter, perSqm }
  }

  const groups = GROUP_ORDER.map(group => ({
    group,
    rows: Object.values(view.products).map(fill).filter(p => (p.group ?? 'other') === group).map(rowOf),
  })).filter(g => g.rows.length > 0)

  const accessories = ACCESSORY_GROUP_ORDER.map(group => ({ group, rows: (s?.accessories ?? []).filter(a => a.group === group) })).filter(g => g.rows.length > 0)
  const j = isoToJalali(todayIso)
  return {
    title: s?.title ?? '',
    jalaliDate: `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`,
    groups,
    notes: s?.notes ?? [],
    accessories,
    notIncluded,
  }
}
