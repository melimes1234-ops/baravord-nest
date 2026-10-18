import type { Catalog, Color, Material, Product, Recipe, RecipeItem } from './types'

/**
 * Starting data = the factory's own calculation workbook ("آخرین محاسبه مواد - دی ۱۴۰۲").
 * The workbook writes prices in Rial per kg; the app is in Toman, so every price here is the workbook value / 10.
 * Bump SEED_VERSION when this data changes, so an admin can be offered the new starting data.
 */
export const SEED_VERSION = 2

const RIAL = 10
const mat = (id: string, name: string, rialPerKg: number | null): Material => ({ id, name, pricePerKg: rialPerKg == null ? null : rialPerKg / RIAL })

const materials: Material[] = [
  mat('wood', 'پودر چوب (wood powder)', 44_000),
  mat('carbonate', 'کربنات (CaCO₃)', 50_000),
  mat('wax', 'وکس پلی‌اتیلن (PEWAX)', 700_000),
  mat('graft', 'گرافت (Coupling Agent)', 675_000),
  mat('a060', 'آنتی‌اکسیدان A060', 2_700_000),
  mat('a2112', 'آنتی‌اکسیدان 2112', 2_900_000),
  mat('titan', 'تیتان (TiO₂)', 1_450_000),
  mat('red', 'اکسید قرمز آهن', 1_000_000),
  mat('yellow', 'اکسید زرد آهن', 1_000_000),
  mat('brown', 'رنگدانه قهوه‌ای', 1_000_000),
  mat('carbon-black', 'دوده (Carbon black)', 1_200_000),
  mat('sc4', 'اسکرپ چهار رنگ (SC4)', 205_000),
  mat('sch', 'اسکرپ هاش (SCH)', 182_000),
  // Not in the workbook, but the "finished product" page puts returned production waste here.
  { id: 'waste', name: 'ضایعات برگشتی', pricePerKg: 0 },
]

const m = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'material', id }, qtyKg })
const r = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'recipe', id }, qtyKg })

// Buying the scrap: price x weight + 9% tax on the purchase + freight (3,500,000 Rial for the load) + grinding (24,000 Rial per kg).
// The workbook ends at 245,470.83 Rial per kg for the mix; here that is the two scraps plus the per-kg extra below.
const SC4_KG = 2000
const SCH_KG = 323
const SCRAP_KG = SC4_KG + SCH_KG
const SCRAP_EXTRA_RIAL = ((SC4_KG * 205_000 + SCH_KG * 182_000) * 0.09 + 3_500_000 + 24_000 * SCRAP_KG) / SCRAP_KG

// Colour = pigments only, added to the same base mix (PRPF 33, wood 61, wax 1.5, graft 2): "فرمول رنگ ۱۴۰۲".
const colorDefs: [string, string, RecipeItem[]][] = [
  ['n1', 'N1', [m('titan', 8)]],
  ['n2', 'N2', [m('titan', 0.25), m('brown', 1.5)]],
  ['n2p', 'N2⁺', [m('titan', 0.4), m('red', 0.4), m('yellow', 1.7)]],
  ['n22', 'N22', [m('titan', 0.4), m('yellow', 2)]],
  ['n3', 'N3', [m('titan', 0.25), m('red', 0.25), m('yellow', 2)]],
  ['n4', 'N4', [m('titan', 0.3), m('red', 0.3), m('yellow', 1.87), m('carbon-black', 0.03)]],
  ['n5', 'N5', [m('titan', 0.4), m('red', 0.4), m('yellow', 1.7)]],
  ['n6', 'N6', [m('carbon-black', 1)]],
  ['n6p', 'N6⁺', [m('yellow', 1.5), m('carbon-black', 0.1)]],
  ['n7', 'N7', [m('red', 0.3), m('brown', 2), m('carbon-black', 0.25)]],
  ['n8', 'N8', [m('red', 2), m('brown', 0.2), m('carbon-black', 0.2)]],
  ['n9', 'N9', [m('titan', 1.5), m('carbon-black', 0.1)]],
  ['n10', 'N10', [m('titan', 0.3), m('carbon-black', 0.15)]],
  ['n11', 'N11', [m('red', 0.9), m('yellow', 1.3), m('brown', 0.3)]],
  ['n12', 'N12', [m('titan', 0.4), m('red', 0.3), m('brown', 1.2)]],
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

/** A fresh copy every time: callers edit the result, and the module-level tables must never change. */
export function seedCatalog(): Catalog {
  return structuredClone(buildSeed())
}

function buildSeed(): Catalog {
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
  }))
  // TOPS boards: sold by the board; the weight of a whole board decides the price (workbook, 1402/09/25).
  const tops: [string, string, number, number, number][] = [
    ['TOPS 32 (4.1 m)', 'TOPS32-41', 32, 4.1, 49_000],
    ['TOPS 50 (4.1 m)', 'TOPS50-41', 50, 4.1, 61_500],
    ['TOPS 32 (3.6 m)', 'TOPS32-36', 32, 3.6, 41_400],
    ['TOPS 50 (3.6 m)', 'TOPS50-36', 50, 3.6, 51_350],
  ]
  for (const [name, code, thicknessMm, lengthM, w] of tops) {
    products.push({ id: code.toLowerCase(), name, code, widthMm: 600, thicknessMm, usages: [], weightPer3mG: w, stickLengthM: lengthM, baseRecipeId: 'tops', colorable: false })
  }
  const colors: Color[] = colorDefs.map(([id, name, items]) => ({ id, name, items }))

  const recipes: Recipe[] = [
    { id: 'scf', name: 'اسکرپ آماده‌ی میکس (SC4 + SCH)', kind: 'semi', items: [m('sc4', SC4_KG), m('sch', SCH_KG)], overheadPerKg: SCRAP_EXTRA_RIAL / RIAL },
    { id: 'prpft', name: 'PRP تاپس (PRPFT)', kind: 'semi', overheadPerKg: 20_000 / RIAL, items: [r('scf', 58), m('carbonate', 40.8), m('graft', 1), m('a060', 0.1), m('a2112', 0.1)] },
    { id: 'prpf', name: 'PRP پروفایل (PRPF)', kind: 'semi', overheadPerKg: 20_000 / RIAL, items: [r('scf', 56.5), m('carbonate', 40), m('graft', 1.5), m('a060', 0.25), m('a2112', 0.25), m('wax', 1.5)] },
    { id: 'wpc-profile', name: 'پروفیل WPC (پایه)', kind: 'base', overheadPerKg: 100_000 / RIAL, items: [r('prpf', 33), m('wood', 61), m('wax', 1.5), m('graft', 2)] },
    { id: 'tops', name: 'تاپس (پایه)', kind: 'base', overheadPerKg: 30_000 / RIAL, items: [r('prpft', 30), m('wood', 77), m('wax', 1.5), m('graft', 1)] },
  ]

  return {
    seedVersion: SEED_VERSION,
    materials: Object.fromEntries(materials.map(x => [x.id, x])),
    recipes: Object.fromEntries(recipes.map(x => [x.id, x])),
    colors: Object.fromEntries(colors.map(c => [c.id, c])),
    products: Object.fromEntries(products.map(p => [p.id, p])),
    // Profit used in the workbook: x1.2 for TOPS boards, x1.3 for profiles.
    tariffs: [
      { id: 'tops', name: 'سود ۲۰٪ (تاپس)', marginPct: 20 },
      { id: 'profile', name: 'سود ۳۰٪ (پروفایل)', marginPct: 30 },
    ],
    config: {
      monthlyCosts: [],
      monthlyProductionKg: 0,
      perBatchCosts: [],
      batchKg: 100,
      wastePct: 0,
      roundTo: 1,
      defaultTolerancePct: 5,
      toleranceByMaterial: {},
      chequeSurchargePct: 6,
    },
  }
}
