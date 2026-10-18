import { priceProduct, productItems, roundTo, stickLength, widthMeters } from './costing'
import { flatten, stageExtra, sumKg } from './flatten'
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
  /** Tab where the user fixes it (shown as a link). */
  tab?: string
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
  /** Part of overheadPerKg that is monthly costs / monthly kg. */
  monthlyPerKg: number
  /** Part of overheadPerKg that comes from the making steps. */
  stagePerKg: number
  /** Extra percent on the sale price (cheque payment). */
  payPct: number
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

export function explainPrice(product: Product, colorId: Id | null, tariff: Tariff, catalog: Catalog, payPct = 0): Explain {
  const cfg = catalog.config
  const used = productItems(product, colorId, catalog)
  const items: ExplainItem[] = used.map(i =>
    i.ref.kind === 'material'
      ? { label: catalog.materials[i.ref.id]?.name ?? i.ref.id, kg: i.qtyKg }
      : { label: `${catalog.recipes[i.ref.id]?.name ?? i.ref.id} (ماده‌ی ترکیبی)`, kg: i.qtyKg, recipeTotalKg: sumKg(catalog.recipes[i.ref.id]?.items ?? []) },
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
  const monthlyPerKg = monthlyCostTotal > 0 && cfg.monthlyProductionKg > 0 ? monthlyCostTotal / cfg.monthlyProductionKg : 0
  // overhead of the making steps (PRP, profile ...): each step's own cost for every kg of it
  const stagePerKg = totalKg > 0 ? stageExtra(used, catalog, product.baseRecipeId) / totalKg : 0
  const overheadPerKg = monthlyPerKg + stagePerKg
  const perBatchCostTotal = cfg.perBatchCosts.reduce((s, c) => s + c.amount, 0)
  const extrasPerKg = cfg.batchKg > 0 ? perBatchCostTotal / cfg.batchKg : 0
  const costPerKg = afterWastePerKg + overheadPerKg + extrasPerKg
  const salePerKg = costPerKg * (1 + tariff.marginPct / 100) * (1 + payPct / 100)
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
      ? { ok: true, level: 'ok', title: 'همه‌ی مواد قیمت دارند', detail: `${rows.length} ماده در این پارت هست و برای همه‌شان قیمت نوشته شده.` }
      : { ok: false, level: 'error', title: 'قیمت بعضی مواد نوشته نشده', detail: `${missingPrices.join('، ')}. قیمتشان را در تب «مواد» بنویسید. تا آن موقع قیمت محصول کمتر از واقعی درمی‌آید.`, tab: 'مواد' },
    zeroPriced.length === 0
      ? { ok: true, level: 'ok', title: 'قیمت صفر مشکوکی نیست', detail: 'فقط دورریز مواد می‌تواند رایگان باشد.' }
      : { ok: false, level: 'warn', title: 'قیمت یک ماده صفر است', detail: `${zeroPriced.join('، ')} قیمت صفر دارد. اگر عمدی نیست، درستش کنید.`, tab: 'مواد' },
    w == null
      ? { ok: false, level: 'error', title: 'وزن شاخه را ننوشته‌اید', detail: 'بدون وزن، قیمت شاخه و متر معلوم نمی‌شود. وزن را در تب «محصولات» بنویسید.', tab: 'محصولات' }
      : { ok: true, level: 'ok', title: 'وزن شاخه نوشته شده', detail: `هر شاخه ${lengthM} متری ${w} گرم وزن دارد.` },
    widthM != null
      ? { ok: true, level: 'ok', title: 'عرض محصول نوشته شده', detail: `${product.widthMm} میلی‌متر. قیمت متر مربع از روی همین حساب می‌شود.` }
      : { ok: false, level: 'warn', title: 'عرض محصول را ننوشته‌اید', detail: 'بدون عرض، قیمت متر مربع معلوم نمی‌شود. عرض را در تب «محصولات» بنویسید.', tab: 'محصولات' },
    monthlyCostTotal > 0 || stagePerKg > 0
      ? { ok: true, level: 'ok', title: 'هزینه‌های ثابت کارخانه نوشته شده', detail: stagePerKg > 0 && monthlyCostTotal <= 0 ? 'هزینه‌ی هر مرحله‌ی ساخت (سربار PRP، پروفایل …) در حساب هست.' : 'مبلغ هزینه‌های ماهانه (برق، حقوق و …) وارد شده است.' }
      : { ok: false, level: 'warn', title: 'هزینه‌های ثابت کارخانه نوشته نشده', detail: 'سربار هر مرحله‌ی ساخت یا هزینه‌های ماهانه (برق، حقوق، اجاره) هنوز وارد نشده و در قیمت نیست. در تب «هزینه‌ها» بنویسید.', tab: 'هزینه‌ها' },
    monthlyCostTotal <= 0 || cfg.monthlyProductionKg > 0
      ? { ok: true, level: 'ok', title: 'کیلوی تولید ماهانه نوشته شده', detail: monthlyCostTotal <= 0 ? 'هزینه‌ی ماهانه‌ای ننوشته‌اید، پس به کیلوی ماه نیازی نیست.' : `در ماه ${cfg.monthlyProductionKg} کیلو ساخته می‌شود و هزینه‌های ثابت بین همین کیلوها پخش می‌شود.` }
      : { ok: false, level: 'warn', title: 'کیلوی تولید ماهانه نوشته نشده', detail: 'هزینه‌ی ماهانه نوشته‌اید ولی برنامه باید بداند در یک ماه چند کیلو می‌سازید تا آن را بین کیلوها پخش کند؛ تا آن موقع هزینه‌های ماهانه در قیمت نمی‌آید. در تب «هزینه‌ها»، کادر «چند کیلو در این ماه ساخته‌اید؟» را پر کنید.', tab: 'هزینه‌ها' },
    totalKg >= 85 && totalKg <= 125
      ? { ok: true, level: 'ok', title: 'وزن پارت معقول است', detail: `جمع فرمول (خود محصول و رنگ) ${totalKg.toFixed(2)} کیلو می‌شود. لازم نیست دقیقاً ۱۰۰ باشد؛ قیمت هر کیلو از همین جمع حساب می‌شود.` }
      : { ok: false, level: 'warn', title: 'وزن پارت با ۱۰۰ کیلو فرق زیادی دارد', detail: `فرمول‌ها معمولاً روی حدود ۱۰۰ کیلو نوشته می‌شوند. الان ${totalKg.toFixed(2)} کیلو می‌شود؛ احتمالاً یکی از مقدارها اشتباه است.` },
    cfg.wastePct >= 0 && cfg.wastePct <= 30
      ? { ok: true, level: 'ok', title: 'درصد دورریز معقول است', detail: `${cfg.wastePct}٪ از مواد دورریز می‌شود.` }
      : { ok: false, level: 'warn', title: 'درصد دورریز زیاد است', detail: `${cfg.wastePct}٪ خیلی زیاد است. مطمئن هستید؟` },
    tariff.marginPct >= 0
      ? { ok: true, level: 'ok', title: 'سود منفی نیست', detail: `سود این تعرفه ${tariff.marginPct}٪ است.` }
      : { ok: false, level: 'error', title: 'سود منفی است', detail: 'یعنی با ضرر می‌فروشید.' },
    engineMatches
      ? { ok: true, level: 'ok', title: 'یک بار دیگر هم حساب کردیم و جواب یکی شد', detail: 'محاسبه را جدا از لیست قیمت تکرار کردیم و همان جواب درآمد.' }
      : { ok: false, level: 'error', title: 'عدد این صفحه با لیست قیمت فرق دارد', detail: 'این یعنی اشکال از خود برنامه است. لطفاً خبر بدهید.' },
  ]

  return {
    product, colorId, colorName: colorId ? catalog.colors[colorId]?.name ?? null : null, tariff, items, rows, totalKg, materialCost, materialPerKg,
    wastePct: cfg.wastePct, afterWastePerKg, wasteExtraPerKg: afterWastePerKg - materialPerKg, monthlyCostTotal, monthlyProductionKg: cfg.monthlyProductionKg,
    overheadPerKg, monthlyPerKg, stagePerKg, payPct, perBatchCostTotal, batchKg: cfg.batchKg, extrasPerKg, costPerKg, marginPct: tariff.marginPct, profitPerKg: salePerKg - costPerKg, salePerKg,
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
