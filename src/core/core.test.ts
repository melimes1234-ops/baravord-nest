import { describe, expect, it } from 'vitest'
import {
  addBatchItem, batchReport, checkAvailability, consumeBatch, createBatch, costItems, flatten,
  fromJalaliDate, parseNum, priceProduct, productItems, recipeMaterialPerKg, removeBatchItem,
  replaceBatchItem, seedCatalog, setActualQty, stockLevels, toJalaliDate, validateCatalog,
  type Catalog, type Movement,
} from './index'

const cat = (): Catalog => seedCatalog()

describe('recipe costing', () => {
  it('PRP cost per kg is the weighted sum / total weight', () => {
    const c = cat()
    const expected =
      (38.5 * 19_000 + 0.25 * 1_350_000 + 1 * 290_000 + 60 * 205_000) / 99.75
    expect(recipeMaterialPerKg('prp', c)).toBeCloseTo(expected, 6)
  })

  it('flattening a sub-recipe scales its materials by used/total', () => {
    const c = cat()
    const flat = flatten(c.recipes['wpc-profile'].items, c)
    // 33 kg of PRP (99.75 kg) holds 33/99.75 of 60 kg polymer
    expect(flat['pp-white']).toBeCloseTo((33 / 99.75) * 60, 9)
    expect(flat.wood).toBe(60)
    expect(flat.graft).toBeCloseTo(3 + (33 / 99.75) * 1, 9)
  })

  it('detects cycles', () => {
    const c = cat()
    c.recipes.prp.items.push({ ref: { kind: 'recipe', id: 'wpc-profile' }, qtyKg: 1 })
    expect(() => flatten(c.recipes['wpc-profile'].items, c)).toThrow(/چرخه/)
  })

  it('changing a material price changes PRP and every product using it', () => {
    const c = cat()
    const flex = c.products.flex
    const before = priceProduct(flex, 'n1', c.tariffs[0], c).perStick!
    c.materials['pp-white'].pricePerKg! *= 1.1
    const after = priceProduct(flex, 'n1', c.tariffs[0], c).perStick!
    expect(after).toBeGreaterThan(before)
  })
})

describe('product pricing', () => {
  it('stick = sale per kg x weight, meter = stick / 3', () => {
    const c = cat()
    c.config.roundTo = 1
    const p = priceProduct(c.products.flex, 'n1', c.tariffs[1], c)
    expect(p.perStick).toBe(Math.round((p.salePerKg * 7500) / 1000))
    expect(p.perMeter).toBe(Math.round((p.salePerKg * 7500) / 3000))
    expect(p.salePerKg).toBeCloseTo(p.costPerKg * 1.25, 9)
  })

  it('overhead is monthly cost / monthly kg, extras are per batch / batch kg, waste scales materials', () => {
    const c = cat()
    c.config.monthlyCosts = [{ name: 'برق', amount: 30_000_000 }, { name: 'حقوق', amount: 70_000_000 }]
    c.config.monthlyProductionKg = 50_000
    c.config.perBatchCosts = [{ name: 'کرایه', amount: 100_000 }]
    c.config.batchKg = 100
    c.config.wastePct = 5
    const items = productItems(c.products.flex, 'n1', c)
    const r = costItems(items, c)
    expect(r.overheadPerKg).toBeCloseTo(2000, 9)
    expect(r.extrasPerKg).toBeCloseTo(1000, 9)
    expect(r.costPerKg).toBeCloseTo(r.materialPerKg / 0.95 + 3000, 6)
  })

  it('missing prices are reported and price is incomplete', () => {
    const c = cat()
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
    expect(productItems(c.products.cabinet, 'n1', c)).toHaveLength(c.recipes.cabinet.items.length)
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
    expect(rep.extraCost).toBeCloseTo(1 * 250_000, 6)
    expect(rep.exceeded.map(l => l.materialId)).toContain('wax')
    expect(b2.changes.at(-1)).toMatchObject({ by: 'ali', reason: 'چسبندگی' })
  })

  it('small change inside tolerance is not flagged', () => {
    const { c, b } = setup()
    const b2 = setActualQty(b, { kind: 'material', id: 'wood' }, 61, 'ali') // +1.67 %
    expect(batchReport(b2, c).exceeded.find(l => l.materialId === 'wood')).toBeUndefined()
  })

  it('per-material tolerance overrides the default', () => {
    const { c, b } = setup()
    c.config.toleranceByMaterial.wood = 1
    const b2 = setActualQty(b, { kind: 'material', id: 'wood' }, 61, 'ali')
    expect(batchReport(b2, c).exceeded.map(l => l.materialId)).toContain('wood')
  })

  it('later price changes do not touch an existing batch', () => {
    const { c, b } = setup()
    const before = batchReport(b, c).actual.materialCost
    c.materials['pp-white'].pricePerKg! *= 2
    expect(batchReport(b, c).actual.materialCost).toBeCloseTo(before, 6)
  })

  it('added, removed and replaced items show up in the variance', () => {
    const { c, b } = setup()
    let b2 = addBatchItem(b, { kind: 'material', id: 'carbonate' }, 2, 'ali')
    expect(batchReport(b2, c).exceeded.map(l => l.materialId)).toContain('carbonate')
    b2 = removeBatchItem(b, { kind: 'material', id: 'wax' }, 'ali')
    const wax = batchReport(b2, c).lines.find(l => l.materialId === 'wax')!
    expect(wax.actualKg).toBe(0)
    expect(wax.diffPct).toBeCloseTo(-100, 9)
    b2 = replaceBatchItem(b, { kind: 'material', id: 'titan' }, { kind: 'material', id: 'carbon-black' }, 'ali')
    expect(batchReport(b2, c).lines.find(l => l.materialId === 'carbon-black')!.actualKg).toBeCloseTo(1.5, 9)
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
    expect(lv.wax.qtyKg).toBeCloseTo(997, 9)
    expect(lv.wood.qtyKg).toBeCloseTo(940, 9)
    expect(lv['pp-white'].qtyKg).toBeCloseTo(1000 - (33 / 99.75) * 60, 9)
  })

  it('refuses to produce when stock is short and reports what is missing', () => {
    const c = cat()
    const items = productItems(c.products.flex, 'n1', c)
    const b = createBatch({ id: 'b1', date: '2026-10-04', productId: 'flex', colorId: 'n1', items }, c)
    const stock = [buy('wood', 10, 1, '2026-10-01')]
    expect(() => consumeBatch(b, c, stock)).toThrow(/موجودی کافی نیست/)
    const sh = checkAvailability(flatten(items, c), stockLevels(stock))
    expect(sh.find(s => s.materialId === 'wood')!.missingKg).toBeCloseTo(50, 9)
  })
})

describe('validation and formatting', () => {
  it('reports missing prices, weights and overhead', () => {
    const msgs = validateCatalog(cat()).map(i => i.message).join('|')
    expect(msgs).toMatch(/وزن شاخه/)
    expect(msgs).toMatch(/قیمت ماده وارد نشده/)
    expect(msgs).toMatch(/هزینه‌های ماهانه/)
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
