import { seedCatalog } from './seed'
import type { Catalog } from './types'

/**
 * Brings a catalog saved by an older version up to date: removes what was taken out of the system (cabinet sheet, TOPS boards),
 * puts the printed-list codes and name on the products it renamed, and adds the two products that were still missing.
 * Returns the changed copy, or null when nothing had to change.
 */
export function migrateCatalog(c: Catalog): Catalog | null {
  const next = structuredClone(c)
  let changed = false
  const mark = () => { changed = true }

  // removed from the system
  if (next.products.cabinet) { delete next.products.cabinet; mark() }
  if (next.recipes.cabinet) { delete next.recipes.cabinet; mark() }
  for (const p of Object.values(next.products)) if (p.baseRecipeId === 'tops') { delete next.products[p.id]; mark() }
  if (next.recipes.tops) { delete next.recipes.tops; mark() }
  if (next.recipes.prpft) { delete next.recipes.prpft; mark() }
  if (next.tariffs.length > 1 && next.tariffs.some(t => t.id === 'tops')) { next.tariffs = next.tariffs.filter(t => t.id !== 'tops'); mark() }

  // codes and names as printed on the price list (only when still the old ones: a name or code the user chose is left alone)
  const shine = next.products.shine
  if (shine && shine.code === 'FD21') { shine.code = 'FC21'; mark() }
  // the website calls Shine FD21 while the printed list says FC21: keep both
  if (shine && shine.code === 'FC21' && shine.siteCode === undefined) { shine.siteCode = 'FD21'; mark() }
  const tOnce = next.products['t-once']
  if (tOnce && tOnce.code === 'FD142') { tOnce.code = 'FD142T'; mark() }
  const tFame = next.products['t-fame']
  if (tFame && tFame.name === 'T-Fame') { tFame.name = 'Fame-T'; mark() }

  // the two products of the printed list that were missing
  const seed = seedCatalog()
  for (const id of ['export', 'romance']) {
    if (!next.products[id] && next.recipes[seed.products[id].baseRecipeId]) { next.products[id] = seed.products[id]; mark() }
  }
  return changed ? next : null
}
