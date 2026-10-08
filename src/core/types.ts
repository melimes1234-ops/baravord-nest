// All money is in Toman (integers when displayed), all weights are in kg.

export type Id = string

export interface Material {
  id: Id
  name: string
  /** Toman per kg. null = not entered yet (flagged by validation). */
  pricePerKg: number | null
}

export type ItemRef = { kind: 'material'; id: Id } | { kind: 'recipe'; id: Id }

export interface RecipeItem {
  ref: ItemRef
  qtyKg: number
}

export interface Recipe {
  id: Id
  name: string
  items: RecipeItem[]
}

/** Pigment formula, added on top of the base recipe for every 100 kg batch. */
export interface Color {
  id: Id
  name: string
  items: RecipeItem[]
}

export interface Product {
  id: Id
  name: string
  code: string
  widthMm?: number
  thicknessMm?: number
  usages: string[]
  /** Weight of one 3 m stick in grams. null = not entered yet. */
  weightPer3mG: number | null
  baseRecipeId: Id
  /** false for products that are sold without a colour (e.g. cabinet sheet). */
  colorable: boolean
}

export interface Tariff {
  id: Id
  name: string
  /** Profit margin in percent, added on top of cost. */
  marginPct: number
}

export interface CostLine {
  name: string
  amount: number
}

export interface Config {
  /** Monthly fixed costs (electricity, wages, rent, depreciation, ...). */
  monthlyCosts: CostLine[]
  /** kg produced in the same month; overhead per kg = sum(monthlyCosts) / this. */
  monthlyProductionKg: number
  /** Costs paid once per batch (freight, storage, scale ...). */
  perBatchCosts: CostLine[]
  /** Size of the standard batch these per-batch costs refer to. */
  batchKg: number
  /** Production waste in percent of output; applied to material cost. */
  wastePct: number
  /** Round final prices to a multiple of this many Toman. */
  roundTo: number
  /** Default allowed deviation (percent) of a material in a batch. */
  defaultTolerancePct: number
  /** Per-material override of the tolerance. */
  toleranceByMaterial: Record<Id, number>
}

export interface Catalog {
  materials: Record<Id, Material>
  recipes: Record<Id, Recipe>
  colors: Record<Id, Color>
  products: Record<Id, Product>
  tariffs: Tariff[]
  config: Config
}
