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
): Flat {
  for (const item of items) {
    if (item.ref.kind === 'material') {
      out[item.ref.id] = (out[item.ref.id] ?? 0) + item.qtyKg * scale
      continue
    }
    const id = item.ref.id
    if (stack.includes(id)) throw new Error(`چرخه در فرمول‌ها: ${[...stack, id].join(' ← ')}`)
    const recipe = catalog.recipes[id]
    if (!recipe) throw new Error(`فرمول پیدا نشد: ${id}`)
    const total = sumKg(recipe.items)
    if (total <= 0) continue
    flatten(recipe.items, catalog, [...stack, id], (scale * item.qtyKg) / total, out)
  }
  return out
}

export function addFlat(a: Flat, b: Flat): Flat {
  const out: Flat = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

export function totalKg(flat: Flat): number {
  return Object.values(flat).reduce((s, v) => s + v, 0)
}
