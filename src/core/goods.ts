import { stickLength } from './costing'
import { formatKg, toFa } from './format'
import type { Catalog, Id, Product } from './types'

/** in = a finished product came out of production; out = it left the warehouse; scrap = waste from a batch. */
export type GoodsType = 'in' | 'out' | 'scrap'
export type GoodsReason = 'sale' | 'sample' | 'other'

export interface GoodsMove {
  id: Id
  date: string
  type: GoodsType
  /** in / out: which product, colour and stick length. For scrap only productId is optional context. */
  productId?: Id
  colorId?: Id | null
  lengthM?: number
  /** Whole sticks (in / out). */
  sticks?: number
  /** Scrap weight in kg. */
  kg?: number
  /** Scrap that was put back into the materials store. */
  returned?: boolean
  reason?: GoodsReason
  /** Customer name for out. */
  party?: string
  batchId?: Id
  note?: string
}

export interface GoodsRow {
  key: string
  productId: Id
  colorId: Id | null
  lengthM: number
  sticks: number
}

export const REASON_LABEL: Record<GoodsReason, string> = { sale: 'فروش', sample: 'نمونه', other: 'مورد دیگر' }

export const goodsKey = (productId: Id, colorId: Id | null | undefined, lengthM: number) => `${productId}|${colorId ?? ''}|${lengthM}`

/** Sticks on hand per product + colour + length (zero rows are left out). */
export function goodsStock(moves: GoodsMove[]): GoodsRow[] {
  const map = new Map<string, GoodsRow>()
  for (const m of moves) {
    if ((m.type !== 'in' && m.type !== 'out') || !m.productId || !m.lengthM || !m.sticks) continue
    const key = goodsKey(m.productId, m.colorId, m.lengthM)
    const row = map.get(key) ?? { key, productId: m.productId, colorId: m.colorId ?? null, lengthM: m.lengthM, sticks: 0 }
    row.sticks += m.type === 'in' ? m.sticks : -m.sticks
    map.set(key, row)
  }
  return [...map.values()].filter(r => r.sticks !== 0).sort((a, b) => a.productId.localeCompare(b.productId) || (a.colorId ?? '').localeCompare(b.colorId ?? '') || a.lengthM - b.lengthM)
}

export const sticksOnHand = (moves: GoodsMove[], productId: Id, colorId: Id | null, lengthM: number): number =>
  goodsStock(moves).find(r => r.key === goodsKey(productId, colorId, lengthM))?.sticks ?? 0

/** Weight in kg of one stick of the given length (proportional to the product's own stick). null when its weight is unknown. */
export function stickKg(p: Product | undefined, lengthM: number): number | null {
  if (!p || p.weightPer3mG == null) return null
  return (p.weightPer3mG / 1000) * (lengthM / stickLength(p))
}

/** Lengths offered for a product: its own stick length, plus the common 1, 2, 3 m cuts. */
export function lengthChoices(p: Product | undefined): number[] {
  const own = p ? stickLength(p) : 3
  return [...new Set([1, 2, 3, own])].sort((a, b) => a - b)
}

export const fmtLen = (m: number) => toFa(String(m).replace('.', '٫').replace(/٫0+$/, ''))

/** One plain sentence for a record, used by the history table and the change log. */
export function goodsSentence(m: GoodsMove, catalog?: Catalog): string {
  const product = (m.productId && catalog?.products[m.productId]?.name) || 'محصول'
  const color = m.colorId ? catalog?.colors[m.colorId]?.name : undefined
  const what = `${toFa(m.sticks ?? 0)} شاخه ${fmtLen(m.lengthM ?? 0)} متری ${product}${color ? ` رنگ ${color}` : ''}`
  if (m.type === 'in') return `ساخته شد: ${what}`
  if (m.type === 'out') {
    const why = REASON_LABEL[m.reason ?? 'sale']
    return `خارج شد (${why}${m.party ? ` به ${m.party}` : ''}): ${what}`
  }
  return `ضایعات ${formatKg(m.kg ?? 0)} کیلو${m.returned ? ' (به انبار مواد برگشت)' : ' (دور ریخته شد)'}`
}
