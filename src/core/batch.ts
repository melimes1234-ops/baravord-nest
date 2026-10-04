import { costFlat, currentPrices, type CostResult } from './costing'
import { flatten, sumKg, type Flat } from './flatten'
import type { Catalog, Id, ItemRef, RecipeItem } from './types'

export interface BatchItem {
  ref: ItemRef
  /** Quantity from the standard formula. 0 for items added only in this batch. */
  stdQty: number
  /** Quantity really used; editable per batch. */
  actualQty: number
}

export interface Batch {
  id: Id
  /** ISO date. */
  date: string
  productId: Id
  colorId: Id | null
  items: BatchItem[]
  /** Material prices frozen when the batch was created. */
  frozenPrices: Record<Id, number | null>
  note?: string
  changes: BatchChange[]
}

export interface BatchChange {
  at: string
  by: string
  what: string
  reason?: string
}

const same = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.id === b.id

/** Copies a standard formula, optionally scaled to a different total weight. */
export function createBatch(
  args: { id: Id; date: string; productId: Id; colorId: Id | null; items: RecipeItem[]; totalKg?: number },
  catalog: Catalog,
): Batch {
  const total = sumKg(args.items)
  const k = args.totalKg && total > 0 ? args.totalKg / total : 1
  return {
    id: args.id,
    date: args.date,
    productId: args.productId,
    colorId: args.colorId,
    items: args.items.map(i => ({ ref: i.ref, stdQty: i.qtyKg * k, actualQty: i.qtyKg * k })),
    frozenPrices: currentPrices(catalog),
    changes: [],
  }
}

function log(b: Batch, by: string, what: string, reason?: string): Batch {
  return { ...b, changes: [...b.changes, { at: new Date().toISOString(), by, what, reason }] }
}

export function setActualQty(b: Batch, ref: ItemRef, qty: number, by: string, reason?: string): Batch {
  if (qty < 0) throw new Error('مقدار نمی‌تواند منفی باشد')
  const items = b.items.map(i => (same(i.ref, ref) ? { ...i, actualQty: qty } : i))
  return log({ ...b, items }, by, `${ref.id}: ${qty} کیلو`, reason)
}

export function addBatchItem(b: Batch, ref: ItemRef, qty: number, by: string, reason?: string): Batch {
  if (b.items.some(i => same(i.ref, ref))) return setActualQty(b, ref, qty, by, reason)
  return log({ ...b, items: [...b.items, { ref, stdQty: 0, actualQty: qty }] }, by, `افزودن ${ref.id}: ${qty} کیلو`, reason)
}

export function removeBatchItem(b: Batch, ref: ItemRef, by: string, reason?: string): Batch {
  // A removed standard item stays with actual 0 so the variance report shows it.
  const items = b.items.flatMap(i => {
    if (!same(i.ref, ref)) return [i]
    return i.stdQty > 0 ? [{ ...i, actualQty: 0 }] : []
  })
  return log({ ...b, items }, by, `حذف ${ref.id}`, reason)
}

export function replaceBatchItem(b: Batch, from: ItemRef, to: ItemRef, by: string, reason?: string): Batch {
  const src = b.items.find(i => same(i.ref, from))
  if (!src) throw new Error('جزء مورد نظر در پارت نیست')
  return addBatchItem(removeBatchItem(b, from, by, reason), to, src.actualQty, by, reason)
}

export const actualItems = (b: Batch): RecipeItem[] =>
  b.items.map(i => ({ ref: i.ref, qtyKg: i.actualQty }))
export const standardItems = (b: Batch): RecipeItem[] =>
  b.items.map(i => ({ ref: i.ref, qtyKg: i.stdQty }))

export function batchActualFlat(b: Batch, catalog: Catalog): Flat {
  return flatten(actualItems(b), catalog)
}

export interface VarianceLine {
  materialId: Id
  stdKg: number
  actualKg: number
  diffKg: number
  /** vs standard, percent. null when the standard quantity is 0. */
  diffPct: number | null
  diffCost: number
  tolerancePct: number
  exceeded: boolean
}

export interface BatchReport {
  actual: CostResult
  standard: CostResult
  lines: VarianceLine[]
  extraCost: number
  exceeded: VarianceLine[]
}

/** Compares the real batch with the standard formula, on frozen prices. */
export function batchReport(b: Batch, catalog: Catalog): BatchReport {
  const stdFlat = flatten(standardItems(b), catalog)
  const actFlat = flatten(actualItems(b), catalog)
  const actual = costFlat(actFlat, b.frozenPrices, catalog.config)
  const standard = costFlat(stdFlat, b.frozenPrices, catalog.config)
  const ids = new Set([...Object.keys(stdFlat), ...Object.keys(actFlat)])
  const lines: VarianceLine[] = [...ids].map(id => {
    const stdKg = stdFlat[id] ?? 0
    const actualKg = actFlat[id] ?? 0
    const diffKg = actualKg - stdKg
    const diffPct = stdKg > 0 ? (diffKg / stdKg) * 100 : null
    const tol = catalog.config.toleranceByMaterial[id] ?? catalog.config.defaultTolerancePct
    const exceeded = diffPct == null ? actualKg > 0 : Math.abs(diffPct) > tol + 1e-9
    return {
      materialId: id,
      stdKg,
      actualKg,
      diffKg,
      diffPct,
      diffCost: diffKg * (b.frozenPrices[id] ?? 0),
      tolerancePct: tol,
      exceeded,
    }
  })
  lines.sort((a, z) => Math.abs(z.diffCost) - Math.abs(a.diffCost))
  return {
    actual,
    standard,
    lines,
    extraCost: actual.materialCost - standard.materialCost,
    exceeded: lines.filter(l => l.exceeded),
  }
}
