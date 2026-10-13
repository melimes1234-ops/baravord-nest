import { flatten, totalKg, type Flat } from './flatten'
import type { Catalog, Config, Id, Product, RecipeItem, Tariff } from './types'

export interface CostResult {
  totalKg: number
  materialCost: number
  /** material cost per kg of output, before waste. */
  materialPerKg: number
  overheadPerKg: number
  extrasPerKg: number
  /** Final cost per kg (materials/(1-waste) + overhead + extras). */
  costPerKg: number
  /** Materials with no price; cost is incomplete while this is not empty. */
  missingPrices: Id[]
  warnings: string[]
}

export function overheadPerKg(config: Config): { value: number; warning?: string } {
  const total = config.monthlyCosts.reduce((s, c) => s + c.amount, 0)
  if (total === 0) return { value: 0 }
  if (config.monthlyProductionKg <= 0) {
    return { value: 0, warning: 'کیلوی تولید این ماه نوشته نشده؛ هزینه‌های ثابت کارخانه حساب نشد' }
  }
  return { value: total / config.monthlyProductionKg }
}

export function extrasPerKg(config: Config): number {
  const total = config.perBatchCosts.reduce((s, c) => s + c.amount, 0)
  return config.batchKg > 0 ? total / config.batchKg : 0
}

/** Cost of an already flattened set of materials. `prices` can be a frozen snapshot. */
export function costFlat(
  flat: Flat,
  prices: Record<Id, number | null>,
  config: Config,
): CostResult {
  const kg = totalKg(flat)
  const missingPrices: Id[] = []
  let materialCost = 0
  for (const [id, q] of Object.entries(flat)) {
    const p = prices[id]
    if (p == null) missingPrices.push(id)
    else materialCost += q * p
  }
  const warnings: string[] = []
  const wasteFactor = 1 - config.wastePct / 100
  if (wasteFactor <= 0) throw new Error('درصد دورریز باید کمتر از ۱۰۰ باشد')
  const materialPerKg = kg > 0 ? materialCost / kg : 0
  const oh = overheadPerKg(config)
  if (oh.warning) warnings.push(oh.warning)
  const extras = extrasPerKg(config)
  return {
    totalKg: kg,
    materialCost,
    materialPerKg,
    overheadPerKg: oh.value,
    extrasPerKg: extras,
    costPerKg: materialPerKg / wasteFactor + oh.value + extras,
    missingPrices,
    warnings,
  }
}

export function currentPrices(catalog: Pick<Catalog, 'materials'>): Record<Id, number | null> {
  return Object.fromEntries(Object.values(catalog.materials).map(m => [m.id, m.pricePerKg]))
}

export function costItems(items: RecipeItem[], catalog: Catalog): CostResult {
  return costFlat(flatten(items, catalog), currentPrices(catalog), catalog.config)
}

/** Cost per kg of a recipe on its own, without overhead (used for PRP etc.). */
export function recipeMaterialPerKg(recipeId: Id, catalog: Catalog): number {
  const r = catalog.recipes[recipeId]
  const flat = flatten(r.items, catalog)
  return costFlat(flat, currentPrices(catalog), {
    ...catalog.config,
    monthlyCosts: [],
    perBatchCosts: [],
    wastePct: 0,
  }).materialPerKg
}

export function roundTo(value: number, step: number): number {
  return step > 1 ? Math.round(value / step) * step : Math.round(value)
}

export interface ProductPrice {
  cost: CostResult
  costPerKg: number
  salePerKg: number
  /** price of one stick (its own length, 3 m unless set), null without weight */
  perStick: number | null
  perMeter: number | null
  /** Price of 1 m2 of surface: price per metre / (width in metres). null without weight or width. */
  perSqm: number | null
}

/**
 * Length of one stick in metres: the product's own length, or 3 m when none is set.
 */
export function stickLength(product: Product): number {
  const l = product.stickLengthM
  if (l != null && l > 0) return l
  return 3
}

/** Width in metres used for the area price, or null when the product has no width. */
export function widthMeters(product: Product): number | null {
  return product.widthMm != null && product.widthMm > 0 ? product.widthMm / 1000 : null
}

/** Items that make up one batch of this product in this colour. */
export function productItems(product: Product, colorId: Id | null, catalog: Catalog): RecipeItem[] {
  const base = catalog.recipes[product.baseRecipeId]
  if (!base) throw new Error(`فرمول پایه محصول ${product.name} پیدا نشد`)
  const items: RecipeItem[] = [...base.items]
  if (product.colorable && colorId) {
    const color = catalog.colors[colorId]
    if (!color) throw new Error(`رنگ پیدا نشد: ${colorId}`)
    items.push(...color.items)
  }
  return items
}

export function priceProduct(
  product: Product,
  colorId: Id | null,
  tariff: Tariff,
  catalog: Catalog,
): ProductPrice {
  const cost = costItems(productItems(product, colorId, catalog), catalog)
  const step = catalog.config.roundTo
  const salePerKg = cost.costPerKg * (1 + tariff.marginPct / 100)
  const w = product.weightPer3mG
  const perStick = w == null ? null : roundTo((salePerKg * w) / 1000, step)
  const wm = widthMeters(product)
  return {
    cost,
    costPerKg: cost.costPerKg,
    salePerKg,
    perStick,
    perMeter: perStick == null ? null : roundTo((salePerKg * w!) / (1000 * stickLength(product)), step),
    perSqm: w == null || wm == null ? null : roundTo((salePerKg * w) / (1000 * stickLength(product)) / wm, step),
  }
}
