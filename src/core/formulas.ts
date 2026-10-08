import { costFlat, currentPrices } from './costing'
import { flatten, sumKg } from './flatten'
import type { Catalog, Id, Product, Recipe, RecipeItem } from './types'

/** Price of 1 kg of an item: a material's price, or a sub-recipe's material cost. null = a price is missing. */
export function itemUnitPrice(item: RecipeItem, catalog: Catalog): number | null {
  if (item.ref.kind === 'material') return catalog.materials[item.ref.id]?.pricePerKg ?? null
  const r = catalog.recipes[item.ref.id]
  if (!r) return null
  const flat = flatten(r.items, catalog)
  const c = costFlat(flat, currentPrices(catalog), { ...catalog.config, monthlyCosts: [], perBatchCosts: [], wastePct: 0 })
  return c.missingPrices.length > 0 ? null : c.materialPerKg
}

export interface FormulaItemCost {
  item: RecipeItem
  unitPrice: number | null
  cost: number | null
}

export interface FormulaCost {
  rows: FormulaItemCost[]
  totalKg: number
  /** Sum of the items that have a price. */
  totalCost: number
  /** Material cost of 1 kg of the finished mix. */
  perKg: number
  incomplete: boolean
}

export function formulaCost(items: RecipeItem[], catalog: Catalog): FormulaCost {
  const rows = items.map(item => {
    const unitPrice = itemUnitPrice(item, catalog)
    return { item, unitPrice, cost: unitPrice == null ? null : unitPrice * item.qtyKg }
  })
  const totalKg = sumKg(items)
  const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0)
  return { rows, totalKg, totalCost, perKg: totalKg > 0 ? totalCost / totalKg : 0, incomplete: rows.some(r => r.cost == null) }
}

/** Scales every quantity so the total becomes `targetKg` (default 100). */
export function normalizeTo(items: RecipeItem[], targetKg = 100): RecipeItem[] {
  const total = sumKg(items)
  if (total <= 0) return items
  const k = targetKg / total
  return items.map(i => ({ ...i, qtyKg: Math.round(i.qtyKg * k * 1e6) / 1e6 }))
}

/** Sets one item to `pct` percent of the total, keeping the others fixed. Returns null when impossible. */
export function setItemPercent(items: RecipeItem[], index: number, pct: number): RecipeItem[] | null {
  if (!(pct >= 0 && pct < 100)) return null
  const others = items.reduce((s, x, j) => (j === index ? s : s + x.qtyKg), 0)
  const qty = Math.round(((pct / 100) * others / (1 - pct / 100)) * 1e6) / 1e6
  return items.map((x, j) => (j === index ? { ...x, qtyKg: qty } : x))
}

export interface FormulaUsage {
  products: Product[]
  recipes: Recipe[]
}

/** Where a recipe is used: as a product's base, or as an item inside another recipe. */
export function recipeUsage(id: Id, catalog: Catalog): FormulaUsage {
  return {
    products: Object.values(catalog.products).filter(p => p.baseRecipeId === id),
    recipes: Object.values(catalog.recipes).filter(r => r.id !== id && r.items.some(i => i.ref.kind === 'recipe' && i.ref.id === id)),
  }
}

/** A copy of the catalog in which one formula's items are replaced: "what if this were the real formula?" */
export function withReplacement(catalog: Catalog, kind: 'recipe' | 'color', targetId: Id, items: RecipeItem[]): Catalog {
  const c: Catalog = { ...catalog, recipes: { ...catalog.recipes }, colors: { ...catalog.colors } }
  if (kind === 'recipe') c.recipes[targetId] = { ...c.recipes[targetId], items }
  else c.colors[targetId] = { ...c.colors[targetId], items }
  return c
}
