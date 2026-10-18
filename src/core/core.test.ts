import { describe, expect, it } from 'vitest'
import {
  addBatchItem, batchReport, checkAvailability, consumeBatch, createBatch, costItems, flatten,
  stickLength, calcCsv, catalogChanges, todayIso, isoToJalali, jalaliToIso, jalaliMonthLength, jalaliWeekday, colorSwatch, explainPrice, formulaCost, normalizeTo, recipeUsage, setItemPercent, withReplacement, fromJalaliDate, luminance, parseNum, priceProduct, productItems, recipeMaterialPerKg, removeBatchItem,
  replaceBatchItem, itemUnitPrice, seedCatalog, setActualQty, stockLevels, toJalaliDate, validateCatalog,
  type Catalog, type Movement,
} from './index'

const cat = (): Catalog => seedCatalog()

// Workbook numbers, taken as Toman exactly as written (the sheet's «ريال» headers are on the same scale as the Toman prices the factory already used).
const SCRAP_EXTRA = ((2000 * 205_000 + 323 * 182_000) * 0.09 + 3_500_000 + 24_000 * 2323) / 2323
const SCF = (2000 * 205_000 + 323 * 182_000) / 2323 + SCRAP_EXTRA // 245,470.83 per kg (sheet G30)

describe('recipe costing', () => {
  it('PRPF material cost per kg is the weighted sum / total weight', () => {
    const c = cat()
    const scfMat = (2000 * 205_000 + 323 * 182_000) / 2323
    const expected = (56.5 * scfMat + 40 * 50_000 + 1.5 * 675_000 + 0.25 * 2_700_000 + 0.25 * 2_900_000 + 1.5 * 700_000) / 100
    expect(recipeMaterialPerKg('prpf', c)).toBeCloseTo(expected, 6)
  })

  it('flattening a sub-recipe scales its materials by used/total', () => {
    const c = cat()
    const flat = flatten(c.recipes['wpc-profile'].items, c)
    // 33 kg of PRPF (100 kg) holds 33/100 of its 40 kg carbonate and 1.5 kg graft
    expect(flat.carbonate).toBeCloseTo(0.33 * 40, 9)
    expect(flat.wood).toBe(61)
    expect(flat.graft).toBeCloseTo(2 + 0.33 * 1.5, 9)
    // ... and of the scrap: 56.5 kg of SCF per 100 kg, split between SC4 and SCH by their weights
    expect(flat.sc4).toBeCloseTo(0.33 * 56.5 * (2000 / 2323), 9)
  })

  it('detects cycles', () => {
    const c = cat()
    c.recipes.prpf.items.push({ ref: { kind: 'recipe', id: 'wpc-profile' }, qtyKg: 1 })
    expect(() => flatten(c.recipes['wpc-profile'].items, c)).toThrow(/به هم گره خورده/)
  })

  it('changing a material price changes the scrap mix, PRPF and every product using it', () => {
    const c = cat()
    const flex = c.products.flex
    const before = priceProduct(flex, 'n1', c.tariffs[0], c).perStick!
    c.materials.sc4.pricePerKg! *= 1.1
    const after = priceProduct(flex, 'n1', c.tariffs[0], c).perStick!
    expect(after).toBeGreaterThan(before)
  })
})

describe('product pricing', () => {
  it('stick = sale per kg x weight, meter = stick / 3', () => {
    const c = cat()
    c.config.roundTo = 1
    const p = priceProduct(c.products.flex, 'n1', c.tariffs[0], c)
    expect(p.perStick).toBe(Math.round((p.salePerKg * 7500) / 1000))
    expect(p.perMeter).toBe(Math.round((p.salePerKg * 7500) / 3000))
    expect(p.salePerKg).toBeCloseTo(p.costPerKg * 1.3, 9)
  })

  it('overhead is monthly cost / monthly kg, extras are per batch / batch kg, waste scales materials', () => {
    const c = cat()
    c.config.monthlyCosts = [{ name: 'برق', amount: 30_000_000 }, { name: 'حقوق', amount: 70_000_000 }]
    c.config.monthlyProductionKg = 50_000
    c.config.perBatchCosts = [{ name: 'کرایه', amount: 100_000 }]
    c.config.batchKg = 100
    c.config.wastePct = 5
    for (const rc of Object.values(c.recipes)) delete rc.overheadPerKg // only the monthly costs in this test
    const items = productItems(c.products.flex, 'n1', c)
    const r = costItems(items, c)
    expect(r.overheadPerKg).toBeCloseTo(2000, 9)
    expect(r.extrasPerKg).toBeCloseTo(1000, 9)
    expect(r.costPerKg).toBeCloseTo(r.materialPerKg / 0.95 + 3000, 6)
  })

  it('missing prices are reported and price is incomplete', () => {
    const c = cat()
    c.materials.yellow.pricePerKg = null
    const r = costItems(productItems(c.products.flex, 'n3', c), c)
    expect(r.missingPrices).toContain('yellow')
  })

  it('no weight = no stick/meter price', () => {
    const c = cat()
    const p = priceProduct(c.products['t-once'], null, c.tariffs[0], c)
    expect(p.perStick).toBeNull()
    expect(p.perMeter).toBeNull()
  })

  it('uncolourable product ignores colour', () => {
    const c = cat()
    c.products.flex.colorable = false
    expect(productItems(c.products.flex, 'n1', c)).toHaveLength(c.recipes['wpc-profile'].items.length)
  })
})

describe('batch with custom formula', () => {
  const setup = () => {
    const c = cat()
    c.config.defaultTolerancePct = 5
    const items = productItems(c.products.flex, 'n1', c)
    const b = createBatch({ id: 'b1', date: '2026-10-04', productId: 'flex', colorId: 'n1', items }, c)
    return { c, b }
  }

  it('starts identical to the standard formula', () => {
    const { c, b } = setup()
    const rep = batchReport(b, c)
    expect(rep.extraCost).toBeCloseTo(0, 9)
    expect(rep.exceeded).toHaveLength(0)
  })

  it('more wax = extra cost on frozen prices and an alert beyond tolerance', () => {
    const { c, b } = setup()
    const b2 = setActualQty(b, { kind: 'material', id: 'wax' }, 3, 'ali', 'چسبندگی')
    const rep = batchReport(b2, c)
    expect(rep.extraCost).toBeCloseTo(1.5 * 700_000, 6) // 1.5 kg more wax at the workbook price
    expect(rep.exceeded.map(l => l.materialId)).toContain('wax')
    expect(b2.changes.at(-1)).toMatchObject({ by: 'ali', reason: 'چسبندگی' })
  })

  it('small change inside tolerance is not flagged', () => {
    const { c, b } = setup()
    const b2 = setActualQty(b, { kind: 'material', id: 'wood' }, 62, 'ali') // +1.64 %
    expect(batchReport(b2, c).exceeded.find(l => l.materialId === 'wood')).toBeUndefined()
  })

  it('per-material tolerance overrides the default', () => {
    const { c, b } = setup()
    c.config.toleranceByMaterial.wood = 1
    const b2 = setActualQty(b, { kind: 'material', id: 'wood' }, 62, 'ali')
    expect(batchReport(b2, c).exceeded.map(l => l.materialId)).toContain('wood')
  })

  it('later price changes do not touch an existing batch', () => {
    const { c, b } = setup()
    const before = batchReport(b, c).actual.materialCost
    c.materials.sc4.pricePerKg! *= 2
    expect(batchReport(b, c).actual.materialCost).toBeCloseTo(before, 6)
  })

  it('added, removed and replaced items show up in the variance', () => {
    const { c, b } = setup()
    let b2 = addBatchItem(b, { kind: 'material', id: 'carbonate' }, 2, 'ali')
    expect(batchReport(b2, c).exceeded.map(l => l.materialId)).toContain('carbonate')
    b2 = removeBatchItem(b, { kind: 'material', id: 'wax' }, 'ali')
    const wax = batchReport(b2, c).lines.find(l => l.materialId === 'wax')!
    expect(wax.actualKg).toBeCloseTo(0.33 * 1.5, 9) // only the wax inside PRPF is left
    expect(wax.diffPct).toBeLessThan(-70)
    b2 = replaceBatchItem(b, { kind: 'material', id: 'titan' }, { kind: 'material', id: 'carbon-black' }, 'ali')
    expect(batchReport(b2, c).lines.find(l => l.materialId === 'carbon-black')!.actualKg).toBeCloseTo(8, 9)
  })

  it('can scale a batch to another total weight', () => {
    const { c } = setup()
    const items = productItems(c.products.flex, 'n1', c)
    const b = createBatch({ id: 'b2', date: '2026-10-04', productId: 'flex', colorId: 'n1', items, totalKg: 50 }, c)
    expect(b.items.reduce((s, i) => s + i.actualQty, 0)).toBeCloseTo(50, 9)
  })
})

describe('inventory', () => {
  const buy = (materialId: string, kg: number, price: number, date: string): Movement => ({
    id: `${materialId}-${date}`, date, materialId, kg, type: 'in', pricePerKg: price,
  })

  it('moving-average price across purchases', () => {
    const s = stockLevels([buy('wax', 100, 200, '2026-01-01'), buy('wax', 100, 300, '2026-01-02')])
    expect(s.wax.qtyKg).toBe(200)
    expect(s.wax.avgPrice).toBe(250)
  })

  it('a batch consumes its ACTUAL materials, including those inside PRP', () => {
    const c = cat()
    const items = productItems(c.products.flex, 'n1', c)
    let b = createBatch({ id: 'b1', date: '2026-10-04', productId: 'flex', colorId: 'n1', items }, c)
    b = setActualQty(b, { kind: 'material', id: 'wax' }, 3, 'ali')
    const stock: Movement[] = Object.keys(c.materials).map(id => buy(id, 1000, 1, '2026-10-01'))
    const after = consumeBatch(b, c, stock)
    const lv = stockLevels(after)
    expect(lv.wax.qtyKg).toBeCloseTo(1000 - 3 - 0.33 * 1.5, 9)
    expect(lv.wood.qtyKg).toBeCloseTo(939, 9)
    expect(lv.sc4.qtyKg).toBeCloseTo(1000 - 0.33 * 56.5 * (2000 / 2323), 9)
  })

  it('refuses to produce when stock is short and reports what is missing', () => {
    const c = cat()
    const items = productItems(c.products.flex, 'n1', c)
    const b = createBatch({ id: 'b1', date: '2026-10-04', productId: 'flex', colorId: 'n1', items }, c)
    const stock = [buy('wood', 10, 1, '2026-10-01')]
    expect(() => consumeBatch(b, c, stock)).toThrow(/موجودی کافی نیست/)
    const sh = checkAvailability(flatten(items, c), stockLevels(stock))
    expect(sh.find(s => s.materialId === 'wood')!.missingKg).toBeCloseTo(51, 9)
  })
})

describe('validation and formatting', () => {
  it('reports missing prices, weights and overhead', () => {
    const c = cat()
    c.materials.red.pricePerKg = null
    for (const rc of Object.values(c.recipes)) delete rc.overheadPerKg
    const msgs = validateCatalog(c).map(i => i.message).join('|')
    expect(msgs).toMatch(/وزن شاخه/)
    expect(msgs).toMatch(/قیمت ماده نوشته نشده/)
    expect(msgs).toMatch(/هزینه‌های ثابت کارخانه/)
    // the starting data has its overhead in the making steps, so it is not reported as missing
    expect(validateCatalog(cat()).some(i => /هزینه‌های ثابت/.test(i.message))).toBe(false)
  })

  it('parses Persian digits and separators', () => {
    expect(parseNum('۲٬۰۵۰٬۰۰۰')).toBe(2_050_000)
    expect(parseNum('۱٫۵')).toBe(1.5)
    expect(parseNum('abc')).toBeNull()
  })

  it('Jalali date round trip', () => {
    expect(toJalaliDate('2026-10-04')).toBe('۱۴۰۵/۰۷/۱۲')
    expect(fromJalaliDate('۱۴۰۵/۰۷/۱۲')).toBe('2026-10-04')
    expect(fromJalaliDate('x')).toBeNull()
  })
})

describe('colour swatches', () => {
  it('titan white is light, carbon black is dark, and the two are different', () => {
    const c = cat()
    const white = colorSwatch(c.colors.n1, c)
    const black = colorSwatch(c.colors.n6, c)
    expect(white).toMatch(/^#[0-9a-f]{6}$/)
    expect(luminance(white)).toBeGreaterThan(luminance(black) + 60)
  })

  it('a yellow formula is more yellow than blue, a red one more red', () => {
    const c = cat()
    const y = parseInt(colorSwatch(c.colors.n3, c).slice(1), 16)
    expect((y >> 16) + ((y >> 8) & 255)).toBeGreaterThan(2 * (y & 255))
    const r = parseInt(colorSwatch(c.colors.n8, c).slice(1), 16)
    expect(r >> 16).toBeGreaterThan((r & 255) + 40)
  })

  it('the user\'s own hex wins; a malformed one is ignored', () => {
    const c = cat()
    c.colors.n1.hex = '#AABBCC'
    expect(colorSwatch(c.colors.n1, c)).toBe('#aabbcc')
    c.colors.n1.hex = 'blue'
    expect(colorSwatch(c.colors.n1, c)).toMatch(/^#[0-9a-f]{6}$/)
    expect(colorSwatch(c.colors.n1, c)).not.toBe('blue')
  })
})

describe('formula tools', () => {
  it('cost of a formula = sum of item costs, and a sub-recipe item costs its own per-kg price', () => {
    const c = cat()
    const f = formulaCost(c.recipes['wpc-profile'].items, c)
    // PRPF costs its materials plus its own 20,000 per kg step overhead
    const prpf = recipeMaterialPerKg('prpf', c) + 0.565 * SCRAP_EXTRA + 20_000 // + the scrap's buying costs (56.5 kg of SCF per 100) + step overhead
    expect(f.rows.find(r => r.item.ref.id === 'prpf')!.cost).toBeCloseTo(33 * prpf, 6)
    expect(f.totalCost).toBeCloseTo(33 * prpf + 61 * 44_000 + 1.5 * 700_000 + 2 * 675_000, 4)
    expect(f.incomplete).toBe(false)
  })

  it('normalize scales to 100 kg and keeps the proportions', () => {
    const c = cat()
    const n = normalizeTo(c.recipes.prpf.items, 200)
    expect(n.reduce((s, i) => s + i.qtyKg, 0)).toBeCloseTo(200, 4)
    expect(n[1].qtyKg / n[0].qtyKg).toBeCloseTo(40 / 56.5, 4)
  })

  it('percent edit sets the share and leaves the other items alone', () => {
    const c = cat()
    const items = setItemPercent(c.recipes.prpf.items, 0, 50)!
    const total = items.reduce((s, i) => s + i.qtyKg, 0)
    expect(items[0].qtyKg / total).toBeCloseTo(0.5, 6)
    expect(items[1].qtyKg).toBe(40)
    expect(setItemPercent(c.recipes.prpf.items, 0, 100)).toBeNull()
  })

  it('usage lists the products and recipes that depend on a recipe', () => {
    const c = cat()
    expect(recipeUsage('prpf', c).recipes.map(r => r.id)).toEqual(['wpc-profile'])
    expect(recipeUsage('wpc-profile', c).products.length).toBe(23)
    expect(recipeUsage('scf', c).recipes.map(r => r.id)).toEqual(['prpf'])
  })

  it('replacing a formula in a copy changes prices there and never in the original', () => {
    const c = cat()
    const before = priceProduct(c.products.flex, 'n1', c.tariffs[0], c).perStick!
    const cheaper = c.recipes.prpf.items.map(i => (i.ref.id === 'scf' ? { ...i, qtyKg: 40 } : i))
    const alt = withReplacement(c, 'recipe', 'prpf', cheaper)
    expect(priceProduct(c.products.flex, 'n1', c.tariffs[0], alt).perStick!).toBeLessThan(before)
    expect(priceProduct(c.products.flex, 'n1', c.tariffs[0], c).perStick!).toBe(before)
    expect(c.recipes.prpf.items.find(i => i.ref.id === 'scf')!.qtyKg).toBe(56.5)
  })
})

describe('calculation explanation', () => {
  const full = () => {
    const c = cat()
    c.config.monthlyCosts = [{ name: 'برق', amount: 30_000_000 }, { name: 'حقوق', amount: 70_000_000 }]
    c.config.monthlyProductionKg = 50_000
    c.config.perBatchCosts = [{ name: 'کرایه', amount: 100_000 }]
    c.config.wastePct = 5
    return c
  }

  it('independent recomputation equals the pricing engine for every product, colour and tariff', () => {
    const c = full()
    for (const p of Object.values(c.products)) {
      for (const colorId of ['n1', 'n3', 'n7']) {
        for (const t of c.tariffs) {
          const e = explainPrice(p, p.colorable ? colorId : null, t, c)
          const eng = priceProduct(p, p.colorable ? colorId : null, t, c)
          expect(e.perStick).toBe(eng.perStick)
          expect(e.perMeter).toBe(eng.perMeter)
          expect(e.salePerKg).toBeCloseTo(eng.salePerKg, 6)
          expect(e.checks.find(k => k.title.startsWith('یک بار دیگر هم حساب کردیم'))?.ok).toBe(true)
        }
      }
    }
  })

  it('the steps add up: cost = materials after waste + overhead + extras; sale = cost x (1 + margin)', () => {
    const c = full()
    const e = explainPrice(c.products.flex, 'n1', c.tariffs[0], c)
    expect(e.monthlyPerKg).toBeCloseTo(2000, 9)
    expect(e.overheadPerKg).toBeCloseTo(2000 + e.stagePerKg, 9)
    expect(e.stagePerKg).toBeGreaterThan(0)
    expect(e.extrasPerKg).toBeCloseTo(1000, 9)
    expect(e.afterWastePerKg).toBeCloseTo(e.materialPerKg / 0.95, 6)
    expect(e.costPerKg).toBeCloseTo(e.afterWastePerKg + e.overheadPerKg + 1000, 6)
    expect(e.salePerKg).toBeCloseTo(e.costPerKg * 1.3, 6)
    expect(e.perStickRaw).toBeCloseTo((e.salePerKg * 7500) / 1000, 6)
    expect(e.rows.reduce((s, r) => s + (r.cost ?? 0), 0)).toBeCloseTo(e.materialCost, 6)
    expect(e.profitPerKg).toBeCloseTo(e.salePerKg - e.costPerKg, 9)
  })

  it('checks report what is missing, and are all green when the data is complete', () => {
    const c = cat()
    c.materials.yellow.pricePerKg = null
    for (const rc of Object.values(c.recipes)) delete rc.overheadPerKg
    const bad = explainPrice(c.products['t-once'], 'n3', c.tariffs[0], c)
    const titles = bad.checks.filter(k => !k.ok).map(k => k.title)
    expect(titles).toEqual(expect.arrayContaining(['قیمت بعضی مواد نوشته نشده', 'وزن شاخه را ننوشته‌اید', 'هزینه‌های ثابت کارخانه نوشته نشده']))
    const c2 = full()
    expect(explainPrice(c2.products.flex, 'n1', c2.tariffs[0], c2).checks.every(k => k.ok)).toBe(true)
  })

  it('csv has one row per product, a BOM, and quotes cells that need it', () => {
    const c = full()
    c.products.flex.name = 'Fl"ex, 1'
    const csv = calcCsv(c, 'n1', c.tariffs[0])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.split('\r\n')).toHaveLength(1 + Object.keys(c.products).length)
    expect(csv).toContain('"Fl""ex, 1"')
  })
})

describe('price per square metre', () => {
  it('= price per metre / width in metres, and needs both weight and width', () => {
    const c = cat()
    c.config.roundTo = 1
    const p = priceProduct(c.products.flex, 'n1', c.tariffs[0], c)
    expect(p.perSqm).toBe(Math.round((p.salePerKg * 7500) / 3000 / 0.14))
    expect(p.perSqm!).toBeGreaterThan(p.perMeter!) // a 14 cm board: 1 m2 is about 7 metres
    c.products.flex.widthMm = undefined
    expect(priceProduct(c.products.flex, 'n1', c.tariffs[0], c).perSqm).toBeNull()
    expect(priceProduct(c.products['t-once'], null, c.tariffs[0], c).perSqm).toBeNull() // no weight
  })

  it('the explanation computes the same figure independently and warns about a missing width', () => {
    const c = cat()
    const e = explainPrice(c.products.flex, 'n1', c.tariffs[0], c)
    expect(e.perSqm).toBe(priceProduct(c.products.flex, 'n1', c.tariffs[0], c).perSqm)
    expect(e.widthM).toBeCloseTo(0.14, 9)
    c.products.flex.widthMm = undefined
    expect(explainPrice(c.products.flex, 'n1', c.tariffs[0], c).checks.some(k => !k.ok && k.title === 'عرض محصول را ننوشته‌اید')).toBe(true)
  })
})

describe('the factory workbook (آخرین محاسبه مواد - دی ۱۴۰۲)', () => {
  it('the scrap mix costs 245,470.83 per kg once buying costs are added (sheet G30)', () => {
    const c = cat()
    expect(itemUnitPrice({ ref: { kind: 'recipe', id: 'scf' }, qtyKg: 1 }, c)).toBeCloseTo(245_470.83, 1)
    expect(SCF).toBeCloseTo(245_470.83, 1)
  })

  it('cheque payment adds 6% to the sale price (the workbook multiplies the sale price by 1.06)', () => {
    const c = cat()
    const t = c.tariffs[0]
    const cash = priceProduct(c.products.flex, 'n7', t, c)
    const cheque = priceProduct(c.products.flex, 'n7', t, c, 6)
    expect(cheque.salePerKg).toBeCloseTo(cash.salePerKg * 1.06, 9)
    expect(cheque.costPerKg).toBeCloseTo(cash.costPerKg, 9)
  })

  it('profile with colour N7 (30%): matches the sheet\'s method step by step', () => {
    const c = cat()
    const p = priceProduct(c.products.flex, 'n7', c.tariffs[0], c)
    const prpf = recipeMaterialPerKg('prpf', c) + 0.565 * SCRAP_EXTRA + 20_000
    const mix = 33 * prpf + 61 * 44_000 + 1.5 * 700_000 + 2 * 675_000 + 0.3 * 1_000_000 + 2 * 1_000_000 + 0.25 * 1_200_000
    const kg = 33 + 61 + 1.5 + 2 + 0.3 + 2 + 0.25
    expect(p.costPerKg).toBeCloseTo(mix / kg + 30_000, 6) // + 30,000 profile-step overhead (newest sheet)
    expect(p.salePerKg).toBeCloseTo((mix / kg + 30_000) * 1.3, 6)
  })

  it('the starting data is complete: nothing but the six products without a weight is missing, and there is no cabinet or TOPS', () => {
    expect(validateCatalog(cat()).map(i => i.where).sort()).toEqual(['Coffin', 'Off', 'T-Clan', 'T-Coffin', 'T-Fame', 'T-Once'])
    const c = cat()
    expect(Object.keys(c.recipes).sort()).toEqual(['prpf', 'scf', 'wpc-profile'])
    expect(Object.values(c.products).some(p => /top|cab/i.test(p.id + p.name))).toBe(false)
  })
})

describe('units: everything is Toman', () => {
  it('a price typed in Rial (10x) is flagged, normal prices and small changes are not', () => {
    const c = cat()
    expect(validateCatalog(c).some(i => i.message.startsWith('قیمت مشکوک'))).toBe(false)
    c.materials.wood.pricePerKg = 44_000 * 1.8 // inflation-sized change
    expect(validateCatalog(c).some(i => i.message.startsWith('قیمت مشکوک'))).toBe(false)
    c.materials.wood.pricePerKg = 440_000 // 44,000 Toman written with one zero too many
    const bad = validateCatalog(c).filter(i => i.message.startsWith('قیمت مشکوک'))
    expect(bad).toHaveLength(1)
    expect(bad[0].tab).toBe('مواد')
    c.materials.wood.pricePerKg = 4_400 // one zero too few
    expect(validateCatalog(c).some(i => i.message.startsWith('قیمت مشکوک'))).toBe(true)
  })

  it('price scales linearly with every Toman input (no hidden unit factor)', () => {
    const a = cat(), b = cat()
    for (const m of Object.values(b.materials)) if (m.pricePerKg) m.pricePerKg *= 10
    for (const rc of Object.values(b.recipes)) if (rc.overheadPerKg) rc.overheadPerKg *= 10 // the cost of each making step is Toman too
    const t = a.tariffs[0]
    const pa = priceProduct(a.products.flex, 'n1', t, a), pb = priceProduct(b.products.flex, 'n1', t, b)
    expect(pb.costPerKg / pa.costPerKg).toBeCloseTo(10, 9)
  })
})

describe('stick length', () => {
  it('per metre = stick price / its own length; a product without a length uses 3 m', () => {
    const c = cat()
    c.config.roundTo = 1
    c.products.flex.stickLengthM = 4.1
    c.products.flex.weightPer3mG = 20_000
    const long = priceProduct(c.products.flex, 'n1', c.tariffs[0], c)
    expect(stickLength(c.products.flex)).toBe(4.1)
    expect(long.perStick).toBe(Math.round((long.salePerKg * 20_000) / 1000))
    expect(long.perMeter).toBe(Math.round((long.salePerKg * 20_000) / 4100))
    const other = Object.values(c.products).find(p => p.id !== 'flex' && p.colorable)!
    expect(stickLength(other)).toBe(3)
  })

  it('an explicit length always wins', () => {
    const c = cat()
    c.products.flex.stickLengthM = 6
    expect(stickLength(c.products.flex)).toBe(6)
    delete c.products.flex.stickLengthM
    expect(stickLength(c.products.flex)).toBe(3)
  })

  it('the explanation uses the same length and still equals the engine', () => {
    const c = cat()
    c.products.flex.stickLengthM = 4.1
    c.products.flex.weightPer3mG = 20_000
    const e = explainPrice(c.products.flex, 'n1', c.tariffs[0], c)
    const eng = priceProduct(c.products.flex, 'n1', c.tariffs[0], c)
    expect(e.lengthM).toBe(4.1)
    expect(e.perMeter).toBe(eng.perMeter)
    expect(e.perStick).toBe(eng.perStick)
  })
})

describe('change log sentences', () => {
  it('says what changed in plain words, and nothing when nothing changed', () => {
    const a = cat()
    const b = structuredClone(a)
    expect(catalogChanges(a, b)).toEqual([])
    b.materials.wax.pricePerKg = 900_000
    b.products.flex.weightPer3mG = 7600
    b.tariffs[0].marginPct = 18
    const tariffName = a.tariffs[0].name
    b.config.wastePct = 4
    b.recipes.prpf.items[3].qtyKg = 58
    delete b.products.tail
    const lines = catalogChanges(a, b)
    expect(lines).toContain('قیمت «وکس پلی‌اتیلن (PEWAX)» از ۷۰۰٬۰۰۰ به ۹۰۰٬۰۰۰ تومان')
    expect(lines).toContain('وزن شاخه‌ی «Flex» از ۷٬۵۰۰ به ۷٬۶۰۰ گرم')
    expect(lines).toContain(`سود تعرفه‌ی «${tariffName}» از ۳۰٪ به ۱۸٪`)
    expect(lines.some(l => l.includes('درصد دورریز'))).toBe(true)
    expect(lines).toContain(`مقدار مواد فرمول «${a.recipes.prpf.name}» عوض شد`)
    expect(lines).toContain('محصول حذف شد: «Tail»')
  })

  it('keeps long lists short', () => {
    const a = cat()
    const b = structuredClone(a)
    for (const m of Object.values(b.materials)) m.pricePerKg = (m.pricePerKg ?? 0) + 1
    const lines = catalogChanges(a, b, 5)
    expect(lines).toHaveLength(6)
    expect(lines.at(-1)).toMatch(/^و .* تغییر دیگر$/)
  })
})

describe('dates', () => {
  it('today is taken from the local clock, not UTC', () => {
    // 00:30 local time on the 5th: UTC is still the 4th for a viewer east of Greenwich, but the user lives on the 5th
    expect(todayIso(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05')
    expect(todayIso(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('Jalali conversion, month lengths and weekday (week starts on Saturday)', () => {
    expect(isoToJalali('2026-10-04')).toEqual({ jy: 1405, jm: 7, jd: 12 })
    expect(jalaliToIso(1405, 7, 12)).toBe('2026-10-04')
    expect(jalaliMonthLength(1405, 1)).toBe(31)
    expect(jalaliMonthLength(1405, 7)).toBe(30)
    expect(jalaliMonthLength(1403, 12)).toBe(30) // leap year
    expect(jalaliMonthLength(1404, 12)).toBe(29)
    expect(jalaliWeekday(1405, 7, 12)).toBe(1) // 4 Oct 2026 is a Sunday: Saturday=0, Sunday=1
    expect(jalaliWeekday(1405, 7, 11)).toBe(0) // Saturday
  })
})
