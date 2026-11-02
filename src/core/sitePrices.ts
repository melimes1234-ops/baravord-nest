import { buildOfficialList, productSize } from './officialList'
import type { Catalog, Id, Tariff } from './types'

/**
 * The prices handed to the company website: exactly the numbers of the printed list (one price per profile, whatever the colour,
 * cash payment, rounded the same way). Nothing about cost, profit, formulas or stock is in it.
 */
export interface SitePriceRow {
  id: Id
  name: string
  /** The code the website knows the product by: the «code on the site» if one was written, else the printed code. */
  code: string
  printedCode: string
  size: string
  group: string
  widthMm: number | null
  thicknessMm: number | null
  /** Price of one metre of length, as printed. null = cannot be priced yet (no weight). */
  perMeter: number | null
  /** Price of one square metre, as printed (only for products whose printed list shows it). */
  perSqm: number | null
}

export interface SitePrices {
  app: 'wpc-nest'
  kind: 'site-prices'
  version: 1
  currency: 'IRT'
  generatedAt: string
  jalaliDate: string
  title: string
  tariff: { id: Id; name: string }
  payment: 'cash'
  products: SitePriceRow[]
}

/** The tariff used for the website when none is chosen: the one called «اصلی», else the first. */
export const defaultSiteTariff = (c: Catalog): Tariff | undefined => c.tariffs.find(t => t.name.includes('اصلی')) ?? c.tariffs[0]

export function buildSitePrices(catalog: Catalog, tariff: Tariff, todayIso: string): SitePrices {
  const list = buildOfficialList(catalog, tariff, 0, [], todayIso)
  const products: SitePriceRow[] = []
  for (const g of list.groups) {
    for (const r of g.rows) {
      const p = catalog.products[r.id]
      products.push({
        id: r.id,
        name: p?.name ?? r.name,
        code: (p?.siteCode?.trim() || r.code).trim(),
        printedCode: r.code.trim(),
        size: p ? productSize(p) : r.size,
        group: g.group,
        widthMm: p?.widthMm ?? null,
        thicknessMm: p?.thicknessMm ?? null,
        perMeter: r.perMeter,
        perSqm: r.perSqm,
      })
    }
  }
  return {
    app: 'wpc-nest',
    kind: 'site-prices',
    version: 1,
    currency: 'IRT',
    generatedAt: todayIso,
    jalaliDate: list.jalaliDate,
    title: list.title,
    tariff: { id: tariff.id, name: tariff.name },
    payment: 'cash',
    products,
  }
}
