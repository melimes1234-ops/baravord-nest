import type { Catalog, Color, Material, Product, RecipeItem } from './types'

// Prices come from the handwritten price sheet (written in Rial, stored here in Toman).
// Values marked null were not on the sheet and must be entered in the app.
const materials: Material[] = [
  { id: 'wood', name: 'پودر چوب (خاک اره)', pricePerKg: 20_500 },
  { id: 'carbonate', name: 'کربنات', pricePerKg: 19_000 },
  { id: 'antioxidant', name: 'آنتی‌اکسیدان', pricePerKg: 1_350_000 },
  { id: 'pp-white', name: 'پلیمر سفید', pricePerKg: 205_000 },
  { id: 'pp-recycled', name: 'پلیمر چهارمالی', pricePerKg: null },
  { id: 'graft', name: 'گرافت', pricePerKg: 290_000 },
  { id: 'wax', name: 'وکس', pricePerKg: 250_000 },
  { id: 'waste', name: 'ضایعات', pricePerKg: 0 },
  { id: 'titan', name: 'تیتان', pricePerKg: 1_572_000 },
  { id: 'yellow', name: 'رنگ زرد', pricePerKg: null },
  { id: 'red', name: 'رنگ قرمز', pricePerKg: null },
  { id: 'brown', name: 'رنگ قهوه‌ای', pricePerKg: null },
  { id: 'carbon-black', name: 'دوده', pricePerKg: null },
]

const m = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'material', id }, qtyKg })
const r = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'recipe', id }, qtyKg })

// Colour formulas are read from a handwritten sheet: every one needs review.
const colorDefs: [string, string, RecipeItem[]][] = [
  ['n1', 'N1', [m('titan', 1.5)]],
  ['n2', 'N2', [m('red', 1.3), m('brown', 0.05), m('carbon-black', 0.03), m('waste', 0.1), m('graft', 1.5), m('wax', 3)]],
  ['n3', 'N3', [m('yellow', 2), m('red', 0.25), m('titan', 0.25)]],
  ['n4', 'N4', [m('yellow', 1.87), m('red', 0.3), m('titan', 0.3), m('carbon-black', 0.03)]],
  ['n5', 'N5', [m('brown', 2), m('red', 0.3), m('carbon-black', 0.25)]],
  ['n6', 'N6', [m('graft', 1.5), m('wax', 2), m('carbon-black', 1.2), m('waste', 0.1)]],
  ['n7', 'N7', [m('brown', 0.8), m('red', 0.09), m('carbon-black', 0.05), m('waste', 0.1), m('wax', 2), m('graft', 1.8)]],
  ['n8', 'N8', [m('red', 2), m('brown', 0.2), m('carbon-black', 0.2)]],
  ['n9', 'N9', [m('titan', 1.5), m('carbon-black', 0.1)]],
  ['n10', 'N10', [m('carbon-black', 0.18), m('titan', 0.25)]],
  ['n11', 'N11', [m('yellow', 1.3), m('red', 0.9), m('brown', 0.3)]],
]

// [name, code, width mm, thickness mm, weight of a 3 m stick in grams (null = unknown)]
const productDefs: [string, string, number, number, number | null][] = [
  ['Feel', 'FC140', 140, 21, 4800],
  ['Lead', 'FC103', 103, 21, 5100],
  ['Shine', 'FD21', 140, 21, 7400],
  ['Pond', 'FD155', 155, 26, 10450],
  ['Fair', 'FD26', 155, 26, 9750],
  ['Flex', 'FD140', 140, 25, 7500],
  ['Once', 'FD142', 142, 21, 7800],
  ['T-Once', 'FD142', 142, 21, null],
  ['Clan', 'FD92', 91.5, 21, 5100],
  ['T-Clan', 'FD92T', 91.5, 21, null],
  ['Fame', 'FD72', 72, 21, 3900],
  ['T-Fame', 'FD72T', 72, 21, null],
  ['Fate', 'FB290', 290, 12, 15100],
  ['Flat', 'FB130', 130, 11, 5950],
  ['Petal', 'FB68', 68, 11, 2890],
  ['Tail', 'FB55', 55, 14, 3110],
  ['Viva', 'FB92', 92, 13, 4250],
  ['Off', 'FT40', 38, 38, null],
  ['IMP', 'FT90', 90, 45, 5730],
  ['Mela', 'FT60', 60, 40, 5700],
  ['Coffin', 'FT46', 27, 46, null],
  ['T-Coffin', 'FT46T', 27, 46, null],
  ['Down', 'FT27', 27, 46, 2900],
]

export function seedCatalog(): Catalog {
  const products: Product[] = productDefs.map(([name, code, widthMm, thicknessMm, w]) => ({
    id: name.toLowerCase(),
    name,
    code,
    widthMm,
    thicknessMm,
    usages: [],
    weightPer3mG: w,
    baseRecipeId: 'wpc-profile',
    colorable: true,
    // Flex = 7.5 kg per 3 m was confirmed by the owner; the rest still need a check.
    needsReview: name !== 'Flex',
  }))
  products.push({
    id: 'cabinet',
    name: 'صفحه کابینت',
    code: 'CAB',
    usages: [],
    weightPer3mG: null,
    baseRecipeId: 'cabinet',
    colorable: false,
  })
  const colors: Color[] = colorDefs.map(([id, name, items]) => ({ id, name, items, needsReview: true }))

  return {
    materials: Object.fromEntries(materials.map(x => [x.id, x])),
    recipes: {
      prp: {
        id: 'prp',
        name: 'PRP',
        items: [m('carbonate', 38.5), m('antioxidant', 0.25), m('graft', 1), m('pp-white', 60)],
      },
      'wpc-profile': {
        id: 'wpc-profile',
        name: 'پروفیل WPC (پایه)',
        items: [m('wood', 60), r('prp', 33), m('wax', 2), m('graft', 3)],
      },
      cabinet: {
        id: 'cabinet',
        name: 'صفحه کابینت',
        // The waste quantity (10 or 15 kg) is unclear on the sheet.
        items: [m('wood', 72), m('pp-recycled', 24), m('wax', 2), m('graft', 1), m('waste', 10)],
        needsReview: true,
      },
    },
    colors: Object.fromEntries(colors.map(c => [c.id, c])),
    products: Object.fromEntries(products.map(p => [p.id, p])),
    // Sample margins: replace with the real ones.
    tariffs: [
      { id: 'wholesale', name: 'عمده', marginPct: 15 },
      { id: 'retail', name: 'خرده', marginPct: 25 },
    ],
    config: {
      monthlyCosts: [],
      monthlyProductionKg: 0,
      perBatchCosts: [],
      batchKg: 100,
      wastePct: 0,
      roundTo: 100,
      defaultTolerancePct: 5,
      toleranceByMaterial: {},
    },
  }
}
