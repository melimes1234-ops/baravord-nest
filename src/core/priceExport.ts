import { colorSwatch } from './colors'
import { priceProduct, stickLength, type ProductPrice } from './costing'
import { isoToJalali } from './format'
import type { Catalog, Id, Product, Tariff } from './types'

/** The whole price list (every product, every colour) for one tariff and payment method, ready to be written as PDF, Excel or JSON. */
export interface PriceExport {
  generatedAt: string
  jalaliDate: string
  tariff: Tariff
  payment: 'cash' | 'cheque'
  payPct: number
  roundTo: number
  /** Cost parts left out of the prices ("بدون سود" ...). Empty = complete prices. */
  notIncluded: string[]
  colors: { id: Id; name: string; hex: string }[]
  rows: { product: Product; lengthM: number; byColor: Record<string, ProductPrice> }[]
}

export const NO_COLOR = 'none'

/**
 * `view` is the catalog exactly as the price list shows it (parts that are switched off are already zero in it),
 * so the file always matches the screen.
 */
export function buildPriceExport(view: Catalog, tariff: Tariff, payPct: number, notIncluded: string[], todayIso: string): PriceExport {
  const colors = Object.values(view.colors).map(c => ({ id: c.id, name: c.name, hex: colorSwatch(c, view) }))
  const rows = Object.values(view.products).map(product => {
    const byColor: Record<string, ProductPrice> = {}
    if (product.colorable) for (const c of colors) byColor[c.id] = priceProduct(product, c.id, tariff, view, payPct)
    else byColor[NO_COLOR] = priceProduct(product, null, tariff, view, payPct)
    return { product, lengthM: stickLength(product), byColor }
  })
  const j = isoToJalali(todayIso)
  return {
    generatedAt: todayIso,
    jalaliDate: `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`,
    tariff,
    payment: payPct > 0 ? 'cheque' : 'cash',
    payPct,
    roundTo: view.config.roundTo,
    notIncluded,
    colors,
    rows,
  }
}

export type PriceMetric = 'perStick' | 'perMeter' | 'perSqm' | 'perKg'
export const METRIC_LABEL: Record<PriceMetric, string> = {
  perStick: 'قیمت هر شاخه',
  perMeter: 'قیمت هر متر',
  perSqm: 'قیمت هر متر مربع',
  perKg: 'قیمت هر کیلو',
}

export function metricValue(p: ProductPrice | undefined, metric: PriceMetric): number | null {
  if (!p) return null
  if (metric === 'perKg') return Math.round(p.salePerKg)
  return p[metric]
}

/** The JSON for importing the list into another site. Prices are whole Toman (null = cannot be priced, e.g. no weight). */
export function priceExportJson(x: PriceExport): string {
  const out = {
    app: 'wpc-nest',
    kind: 'price-list',
    version: 1,
    currency: 'IRT',
    note: 'Prices are in Toman. perKg / perMeter / perStick / perSqm are sale prices; null means it cannot be priced (no weight or width).',
    generatedAt: x.generatedAt,
    jalaliDate: x.jalaliDate,
    tariff: { id: x.tariff.id, name: x.tariff.name, marginPct: x.tariff.marginPct },
    payment: x.payment,
    paymentSurchargePct: x.payPct,
    roundTo: x.roundTo,
    complete: x.notIncluded.length === 0,
    notIncluded: x.notIncluded,
    colors: x.colors,
    products: x.rows.map(({ product: p, lengthM, byColor }) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      widthMm: p.widthMm ?? null,
      thicknessMm: p.thicknessMm ?? null,
      stickLengthM: lengthM,
      stickWeightG: p.weightPer3mG,
      colorable: p.colorable,
      prices: Object.fromEntries(
        Object.entries(byColor).map(([colorId, pr]) => [
          colorId,
          { perKg: metricValue(pr, 'perKg'), perMeter: pr.perMeter, perStick: pr.perStick, perSqm: pr.perSqm },
        ]),
      ),
    })),
  }
  return JSON.stringify(out, null, 1)
}
