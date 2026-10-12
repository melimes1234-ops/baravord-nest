import { priceProduct, productItems, roundTo, stickLength, widthMeters } from './costing'
import { flatten, sumKg } from './flatten'
import type { Catalog, Id, Product, Tariff } from './types'

export interface ExplainItem {
  label: string
  kg: number
  /** For a sub-recipe: its own total weight, so the expansion factor kg/total can be shown. */
  recipeTotalKg?: number
}

export interface ExplainRow {
  materialId: Id
  name: string
  kg: number
  pricePerKg: number | null
  cost: number | null
}

export interface Check {
  ok: boolean
  /** A failed check is a warning unless it makes the price wrong. */
  level: 'ok' | 'warn' | 'error'
  title: string
  detail: string
}

/** Every number behind one price, recomputed here independently of the pricing engine. */
export interface Explain {
  product: Product
  colorId: Id | null
  colorName: string | null
  tariff: Tariff
  items: ExplainItem[]
  rows: ExplainRow[]
  totalKg: number
  materialCost: number
  materialPerKg: number
  wastePct: number
  afterWastePerKg: number
  wasteExtraPerKg: number
  monthlyCostTotal: number
  monthlyProductionKg: number
  overheadPerKg: number
  perBatchCostTotal: number
  batchKg: number
  extrasPerKg: number
  costPerKg: number
  marginPct: number
  profitPerKg: number
  salePerKg: number
  weightG: number | null
  /** length of one stick in metres */
  lengthM: number
  roundStep: number
  perMeterRaw: number | null
  perStickRaw: number | null
  perMeter: number | null
  perStick: number | null
  widthM: number | null
  perSqmRaw: number | null
  perSqm: number | null
  missingPrices: string[]
  checks: Check[]
}

export function explainPrice(product: Product, colorId: Id | null, tariff: Tariff, catalog: Catalog): Explain {
  const cfg = catalog.config
  const used = productItems(product, colorId, catalog)
  const items: ExplainItem[] = used.map(i =>
    i.ref.kind === 'material'
      ? { label: catalog.materials[i.ref.id]?.name ?? i.ref.id, kg: i.qtyKg }
      : { label: `${catalog.recipes[i.ref.id]?.name ?? i.ref.id} (نیمه‌ساخته)`, kg: i.qtyKg, recipeTotalKg: sumKg(catalog.recipes[i.ref.id]?.items ?? []) },
  )
  const flat = flatten(used, catalog)
  const rows: ExplainRow[] = Object.entries(flat)
    .map(([id, kg]) => {
      const price = catalog.materials[id]?.pricePerKg ?? null
      return { materialId: id, name: catalog.materials[id]?.name ?? id, kg, pricePerKg: price, cost: price == null ? null : kg * price }
    })
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))

  const totalKg = rows.reduce((s, r) => s + r.kg, 0)
  const materialCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0)
  const materialPerKg = totalKg > 0 ? materialCost / totalKg : 0
  const wasteFactor = 1 - cfg.wastePct / 100
  const afterWastePerKg = materialPerKg / wasteFactor
  const monthlyCostTotal = cfg.monthlyCosts.reduce((s, c) => s + c.amount, 0)
  const overheadPerKg = monthlyCostTotal > 0 && cfg.monthlyProductionKg > 0 ? monthlyCostTotal / cfg.monthlyProductionKg : 0
  const perBatchCostTotal = cfg.perBatchCosts.reduce((s, c) => s + c.amount, 0)
  const extrasPerKg = cfg.batchKg > 0 ? perBatchCostTotal / cfg.batchKg : 0
  const costPerKg = afterWastePerKg + overheadPerKg + extrasPerKg
  const salePerKg = costPerKg * (1 + tariff.marginPct / 100)
  const w = product.weightPer3mG
  const perStickRaw = w == null ? null : (salePerKg * w) / 1000
  const lengthM = stickLength(product)
  const perMeterRaw = w == null ? null : (salePerKg * w) / (1000 * lengthM)
  const perStick = perStickRaw == null ? null : roundTo(perStickRaw, cfg.roundTo)
  const perMeter = perMeterRaw == null ? null : roundTo(perMeterRaw, cfg.roundTo)
  const widthM = widthMeters(product)
  const perSqmRaw = perMeterRaw == null || widthM == null ? null : perMeterRaw / widthM
  const perSqm = perSqmRaw == null ? null : roundTo(perSqmRaw, cfg.roundTo)
  const missingPrices = rows.filter(r => r.pricePerKg == null).map(r => r.name)

  const engine = priceProduct(product, colorId, tariff, catalog)
  const engineMatches =
    Math.abs(engine.salePerKg - salePerKg) < 1e-6 * Math.max(1, salePerKg) && engine.perStick === perStick && engine.perMeter === perMeter && engine.perSqm === perSqm
  const zeroPriced = rows.filter(r => r.pricePerKg === 0 && r.materialId !== 'waste').map(r => r.name)

  const checks: Check[] = [
    missingPrices.length === 0
      ? { ok: true, level: 'ok', title: 'همه‌ی مواد قیمت دارند', detail: `${rows.length} ماده‌ی خام در این پارت استفاده می‌شود.` }
      : { ok: false, level: 'error', title: 'قیمت بعضی مواد وارد نشده', detail: `${missingPrices.join('، ')}. تا قیمتشان را وارد نکنید، هزینه‌شان صفر حساب می‌شود و قیمت محصول کمتر از واقعی درمی‌آید.` },
    zeroPriced.length === 0
      ? { ok: true, level: 'ok', title: 'قیمت صفر مشکوک نیست', detail: 'فقط ضایعات می‌تواند رایگان باشد.' }
      : { ok: false, level: 'warn', title: 'ماده‌ای با قیمت صفر', detail: `${zeroPriced.join('، ')} قیمت صفر دارد. اگر عمدی نیست، اصلاح کنید.` },
    w == null
      ? { ok: false, level: 'error', title: 'وزن شاخه وارد نشده', detail: 'بدون وزن، قیمت هر متر و هر شاخه حساب نمی‌شود.' }
      : { ok: true, level: 'ok', title: 'وزن محصول وارد شده', detail: `${w} گرم برای شاخه ${lengthM} متری (${(w / lengthM).toFixed(0)} گرم برای هر متر).` },
    widthM != null
      ? { ok: true, level: 'ok', title: 'عرض محصول وارد شده', detail: `${product.widthMm} میلی‌متر. قیمت متر مربع از روی همین عرض حساب می‌شود.` }
      : { ok: false, level: 'warn', title: 'عرض محصول وارد نشده', detail: 'بدون عرض، قیمت هر متر مربع حساب نمی‌شود. عرض را در تب «محصولات» بنویسید.' },
    monthlyCostTotal > 0 && cfg.monthlyProductionKg > 0
      ? { ok: true, level: 'ok', title: 'سربار کارخانه وارد شده', detail: 'هزینه‌ی ماهانه و کیلوی تولید وارد شده است.' }
      : { ok: false, level: 'warn', title: 'سربار صفر است', detail: 'هزینه‌های ماهانه یا کیلوی تولید ماه را وارد نکرده‌اید، پس برق، حقوق و مانند آن در قیمت نیامده است.' },
    totalKg >= 95 && totalKg <= 105
      ? { ok: true, level: 'ok', title: 'وزن پارت نزدیک ۱۰۰ کیلو است', detail: `مجموع فرمول (پایه + رنگ) ${totalKg.toFixed(2)} کیلو است.` }
      : { ok: false, level: 'warn', title: 'وزن پارت از ۱۰۰ کیلو دور است', detail: `مجموع فرمول ${totalKg.toFixed(2)} کیلو است. فرمول‌ها باید برای ۱۰۰ کیلو باشند؛ احتمالاً یکی از مقدارها اشتباه است.` },
    cfg.wastePct >= 0 && cfg.wastePct <= 30
      ? { ok: true, level: 'ok', title: 'درصد ضایعات منطقی است', detail: `${cfg.wastePct}٪` }
      : { ok: false, level: 'warn', title: 'درصد ضایعات غیرعادی است', detail: `${cfg.wastePct}٪ خیلی زیاد است.` },
    tariff.marginPct >= 0
      ? { ok: true, level: 'ok', title: 'درصد سود منفی نیست', detail: `${tariff.marginPct}٪` }
      : { ok: false, level: 'error', title: 'درصد سود منفی است', detail: 'قیمت فروش کمتر از تمام‌شده می‌شود.' },
    engineMatches
      ? { ok: true, level: 'ok', title: 'محاسبه‌ی مستقل با موتور قیمت یکی است', detail: 'همین قدم‌ها را یک بار دیگر جدا از لیست قیمت حساب کردیم و جواب یکی شد.' }
      : { ok: false, level: 'error', title: 'اختلاف با لیست قیمت', detail: 'عدد این صفحه با لیست قیمت فرق دارد. این یعنی اشکال از خود برنامه است. لطفاً خبر بدهید.' },
  ]

  return {
    product, colorId, colorName: colorId ? catalog.colors[colorId]?.name ?? null : null, tariff, items, rows, totalKg, materialCost, materialPerKg,
    wastePct: cfg.wastePct, afterWastePerKg, wasteExtraPerKg: afterWastePerKg - materialPerKg, monthlyCostTotal, monthlyProductionKg: cfg.monthlyProductionKg,
    overheadPerKg, perBatchCostTotal, batchKg: cfg.batchKg, extrasPerKg, costPerKg, marginPct: tariff.marginPct, profitPerKg: salePerKg - costPerKg, salePerKg,
    weightG: w, lengthM, roundStep: cfg.roundTo, perMeterRaw, perStickRaw, perMeter, perStick, widthM, perSqmRaw, perSqm, missingPrices, checks,
  }
}

/** One CSV row per product with every intermediate number, to review in Excel. Plain digits, UTF-8 with BOM. */
export function calcCsv(catalog: Catalog, colorId: Id | null, tariff: Tariff): string {
  const head = [
    'محصول', 'کد', 'طول شاخه (متر)', 'وزن شاخه (گرم)', 'وزن پارت (کیلو)', 'هزینه مواد هر کیلو', 'ضایعات هر کیلو', 'سربار هر کیلو', 'کرایه و انبارداری هر کیلو',
    'قیمت تمام‌شده هر کیلو', 'درصد سود', 'قیمت فروش هر کیلو', 'قیمت هر متر', 'قیمت هر متر مربع', 'قیمت شاخه', 'مواد بدون قیمت',
  ]
  const n = (v: number | null) => (v == null ? '' : String(Math.round(v * 100) / 100))
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = Object.values(catalog.products).map(p => {
    const e = explainPrice(p, p.colorable ? colorId : null, tariff, catalog)
    return [
      p.name, p.code, String(e.lengthM), p.weightPer3mG == null ? '' : String(p.weightPer3mG), n(e.totalKg), n(e.materialPerKg), n(e.wasteExtraPerKg), n(e.overheadPerKg), n(e.extrasPerKg),
      n(e.costPerKg), String(e.marginPct), n(e.salePerKg), n(e.perMeter), n(e.perSqm), n(e.perStick), e.missingPrices.join(' | '),
    ].map(esc).join(',')
  })
  return '﻿' + [head.map(esc).join(','), ...lines].join('\r\n')
}
