import type { Catalog, Color, Material, Product, Recipe, RecipeItem } from './types'

/**
 * Starting data = the factory's own calculation workbook ("آخرین محاسبه مواد - دی ۱۴۰۲").
 * The workbook headers say «ريال», but its numbers are on the same scale as the Toman prices the factory already used
 * (e.g. TiO2 1,450,000 there, 1,572,000 here), so they are taken as Toman exactly as written, with no conversion.
 * Bump SEED_VERSION when this data changes, so an admin can be offered the new starting data.
 */
export const SEED_VERSION = 6

const RIAL = 1
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
  // One polymer price. The workbook has two scraps (SC4 205,000 and SCH 182,000, mixed 2000 : 323); this is their average.
  mat('pp', 'پلیمر (PP / اسکرپ)', 201_800),
  // Not in the workbook, but the "finished product" page puts returned production waste here.
  { id: 'waste', name: 'ضایعات برگشتی', pricePerKg: 0 },
]

const m = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'material', id }, qtyKg })
const r = (id: string, qtyKg: number): RecipeItem => ({ ref: { kind: 'recipe', id }, qtyKg })

// Buying the polymer costs more than its price: 9% tax on the purchase, freight (3,500,000 for a 2,323 kg load) and grinding (24,000 per kg).
// The workbook ends at 245,470.83 per kg; this extra is kept as the cost of the "ready polymer" step so one price edit is enough.
const POLYMER_PRICE = 201_800
const POLYMER_EXTRA = POLYMER_PRICE * 0.09 + 3_500_000 / 2323 + 24_000

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

// [name, code, width mm, thickness mm, weight of a 3 m stick in grams]. Sizes and weights come from the factory's own saved data (backup of 1405/07/26).
const productDefs: [string, string, number, number, number | null][] = [
  ['Feel', 'FC140', 140, 21, 6600],
  ['Lead', 'FC103', 103, 21, 4920],
  ['Shine', 'FD21', 140, 21, 7200],
  ['Pond', 'FD155', 155, 26, 10050],
  ['Fair', 'FD26', 155, 26, 8820],
  ['Flex', 'FD140', 140, 25, 7680],
  ['Once', 'FD142', 142, 21, 7830],
  ['T-Once', 'FD142', 142, 21, 11310],
  ['Clan', 'FD92', 91.5, 21, 5070],
  ['T-Clan', 'FD92T', 91.5, 21, 7080],
  ['Fame', 'FD72', 72, 21, 4050],
  ['T-Fame', 'FD72T', 72, 21, 5100],
  ['Fate', 'FB290', 290, 12, 14700],
  ['Flat', 'FB130', 130, 11, 5460],
  ['Petal', 'FB68', 68, 11, 2820],
  ['Tail', 'FB55', 55, 14, 2940],
  ['Viva', 'FB92', 92, 13, 4320],
  ['Off', 'FT40', 38, 38, 3150],
  ['IMP', 'FT90', 90, 45, 5760],
  ['Mela', 'FT60', 60, 40, 5268],
  ['Coffin', 'FT46', 27, 46, 4050],
  ['T-Coffin', 'FT46T', 27, 46, 4605],
  ['Down', 'FT27', 27, 46, 2880],
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
  const colors: Color[] = colorDefs.map(([id, name, items]) => ({ id, name, items }))

  const recipes: Recipe[] = [
    { id: 'scf', name: 'پلیمر آماده‌ی مصرف (خرید + خردکردن)', kind: 'semi', items: [m('pp', 100)], overheadPerKg: POLYMER_EXTRA / RIAL },
    { id: 'prpf', name: 'PRP پروفایل (PRPF)', kind: 'semi', overheadPerKg: 0, items: [r('scf', 56.5), m('carbonate', 40), m('graft', 1.5), m('a060', 0.25), m('a2112', 0.25), m('wax', 1.5)] },
    { id: 'wpc-profile', name: 'پروفیل WPC (پایه)', kind: 'base', overheadPerKg: 0, items: [r('prpf', 33), m('wood', 61), m('wax', 1.5), m('graft', 2)] },
  ]

  return {
    seedVersion: SEED_VERSION,
    materials: Object.fromEntries(materials.map(x => [x.id, x])),
    recipes: Object.fromEntries(recipes.map(x => [x.id, x])),
    colors: Object.fromEntries(colors.map(c => [c.id, c])),
    products: Object.fromEntries(products.map(p => [p.id, p])),
    // The factory's own tariffs (backup of 1405/07/26). The workbook's profile profit is x1.3 = 30%.
    tariffs: [
      { id: 'wholesale', name: 'عمده', marginPct: 15 },
      { id: 'retail', name: 'خرده', marginPct: 25 },
      { id: 't-mv47ncp0', name: 'خرده', marginPct: 50 },
      { id: 't-mvcninml', name: 'اصلی', marginPct: 100 },
    ],
    config: {
      // The factory's own monthly costs and production (backup of 1405/07/26): 510,000,000 / 10,000 kg = 51,000 per kg.
      // The cost of each making step (PRP, profile) is left at 0 so the same overhead is not counted twice.
      monthlyCosts: [
        { name: 'برق', amount: 70_000_000 },
        { name: 'اجاره', amount: 150_000_000 },
        { name: 'استهلاک', amount: 50_000_000 },
        { name: 'آب', amount: 20_000_000 },
        { name: 'گاز', amount: 20_000_000 },
        { name: 'حقوق', amount: 200_000_000 },
      ],
      monthlyProductionKg: 10_000,
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
