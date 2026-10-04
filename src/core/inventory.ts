import { batchActualFlat, type Batch } from './batch'
import type { Flat } from './flatten'
import type { Catalog, Id } from './types'

export type MovementType = 'in' | 'out' | 'waste_in' | 'adjust'

export interface Movement {
  id: Id
  date: string
  materialId: Id
  /** positive = into the store, negative = out. */
  kg: number
  type: MovementType
  /** Purchase price per kg, only for purchases. */
  pricePerKg?: number
  ref?: string
  note?: string
}

export interface Stock {
  qtyKg: number
  /** Weighted-average purchase price. null until a priced purchase exists. */
  avgPrice: number | null
}

/** Replays movements in date order using the moving-average method. */
export function stockLevels(movements: Movement[]): Record<Id, Stock> {
  const out: Record<Id, Stock> = {}
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date))
  for (const m of sorted) {
    const s = (out[m.materialId] ??= { qtyKg: 0, avgPrice: null })
    if (m.kg > 0 && m.pricePerKg != null) {
      const base = s.avgPrice == null ? 0 : Math.max(s.qtyKg, 0) * s.avgPrice
      const held = Math.max(s.qtyKg, 0)
      s.avgPrice = (base + m.kg * m.pricePerKg) / (held + m.kg)
    }
    s.qtyKg += m.kg
  }
  return out
}

export interface Shortage {
  materialId: Id
  neededKg: number
  availableKg: number
  missingKg: number
}

export function checkAvailability(required: Flat, stock: Record<Id, Stock>): Shortage[] {
  const res: Shortage[] = []
  for (const [id, need] of Object.entries(required)) {
    const have = stock[id]?.qtyKg ?? 0
    if (need > have + 1e-9) {
      res.push({ materialId: id, neededKg: need, availableKg: have, missingKg: need - have })
    }
  }
  return res
}

/** Out-movements for a batch, from its actual (not standard) formula. */
export function consumptionMovements(b: Batch, catalog: Catalog): Movement[] {
  return Object.entries(batchActualFlat(b, catalog))
    .filter(([, q]) => q > 0)
    .map(([materialId, q]) => ({
      id: `${b.id}:${materialId}`,
      date: b.date,
      materialId,
      kg: -q,
      type: 'out' as const,
      ref: b.id,
    }))
}

/** Returns the new movement list, or throws if the stock cannot cover the batch. */
export function consumeBatch(b: Batch, catalog: Catalog, movements: Movement[]): Movement[] {
  const shortages = checkAvailability(batchActualFlat(b, catalog), stockLevels(movements))
  if (shortages.length) {
    const names = shortages.map(s => catalog.materials[s.materialId]?.name ?? s.materialId)
    throw new Error(`موجودی کافی نیست: ${names.join('، ')}`)
  }
  return [...movements, ...consumptionMovements(b, catalog)]
}
