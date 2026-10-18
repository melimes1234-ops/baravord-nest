import type { Catalog, Id, RecipeItem } from './types'

/** Material id -> kg. */
export type Flat = Record<Id, number>

export function sumKg(items: RecipeItem[]): number {
  return items.reduce((s, i) => s + i.qtyKg, 0)
}

/**
 * Expands recipe items down to raw materials. A sub-recipe item of q kg
 * contributes q/total(sub-recipe) of each of the sub-recipe's items.
 */
export function flatten(
  items: RecipeItem[],
  catalog: Pick<Catalog, 'recipes' | 'materials'>,
  stack: Id[] = [],
  scale = 1,
  out: Flat = {},
  stage?: { total: number },
): Flat {
  for (const item of items) {
    if (item.ref.kind === 'material') {
      out[item.ref.id] = (out[item.ref.id] ?? 0) + item.qtyKg * scale
      continue
    }
    const id = item.ref.id
    if (stack.includes(id)) throw new Error(`فرمول‌ها به هم گره خورده‌اند (هر کدام به دیگری وابسته است): ${[...stack, id].join(' ← ')}`)
    const recipe = catalog.recipes[id]
    if (!recipe) throw new Error(`این فرمول پیدا نشد: ${id}`)
    const total = sumKg(recipe.items)
    if (total <= 0) continue
    // the stage's own cost for every kg of it that goes into the mix
    if (stage && recipe.overheadPerKg) stage.total += item.qtyKg * scale * recipe.overheadPerKg
    flatten(recipe.items, catalog, [...stack, id], (scale * item.qtyKg) / total, out, stage)
  }
  return out
}

/**
 * Total stage overhead (Toman) of making `items`: every sub-recipe used contributes (kg used x its overheadPerKg),
 * and the recipe the items belong to (`ownRecipeId`, e.g. a product's base formula) adds its own per kg of the whole mix.
 */
export function stageExtra(items: RecipeItem[], catalog: Pick<Catalog, 'recipes' | 'materials'>, ownRecipeId?: Id): number {
  const stage = { total: 0 }
  flatten(items, catalog, [], 1, {}, stage)
  const own = ownRecipeId ? catalog.recipes[ownRecipeId]?.overheadPerKg ?? 0 : 0
  return stage.total + own * sumKg(items)
}

export function addFlat(a: Flat, b: Flat): Flat {
  const out: Flat = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

export function totalKg(flat: Flat): number {
  return Object.values(flat).reduce((s, v) => s + v, 0)
}
