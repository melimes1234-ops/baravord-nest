import type { Accessory, Catalog, Color, Material, Product, ProductGroup, Recipe, RecipeItem } from './types'

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

// The products of the printed price list, in its order. Sizes and weights are the factory's own saved data (backup of 1405/07/26);
// group, description, "cover" (metres of the profile per m2) and the m2 column are from the price list NEST – SUMMER 1405.
interface ProductDef {
  id: string
  name: string
  code: string
  widthMm: number
  thicknessMm: number
  weightG: number
  group: ProductGroup
  description: string
  cover?: number
  sqm?: true
  size?: string
}
const productDefs: ProductDef[] = [
  { id: 'feel', name: 'Feel', code: 'FC140', widthMm: 140, thicknessMm: 21, weightG: 6600, group: 'cladding', description: 'نماپوش 14 سانتیمتر', cover: 7.1428, sqm: true },
  { id: 'lead', name: 'Lead', code: 'FC103', widthMm: 103, thicknessMm: 21, weightG: 4920, group: 'cladding', description: 'نماپوش 10 سانتیمتر', cover: 9.7, sqm: true },
  // Export and Romance: weight per metre 2.37 kg and 2.187 kg (x 3 m = a stick). The list prints their metres-per-m2 inside the description, not next to the drawing (cover 0).
  { id: 'export', name: 'Export', code: 'FC150', widthMm: 150, thicknessMm: 20, weightG: 7110, group: 'cladding', description: 'نماپوش کام و زبانه 15 سانتیمتر – 6.6666', cover: 0, sqm: true },
  { id: 'romance', name: 'Romance', code: 'FC142', widthMm: 142, thicknessMm: 20, weightG: 6561, group: 'cladding', description: 'نماپوش رومنس 14 سانتیمتر - 7.1428', cover: 0, sqm: true },
  { id: 'shine', name: 'Shine', code: 'FC21', widthMm: 140, thicknessMm: 21, weightG: 7200, group: 'decking', description: 'کفپوش و نماپوش 14 سانتیمتر پیچ و کلیپس مخفی', cover: 7.1428, sqm: true },
  { id: 'pond', name: 'Pond', code: 'FD155', widthMm: 155, thicknessMm: 26, weightG: 10050, group: 'decking', description: 'کفپوش سنگین 15.5 - سانتیمتر - پارکی', cover: 6.25, sqm: true },
  { id: 'fair', name: 'Fair', code: 'FD26', widthMm: 155, thicknessMm: 26, weightG: 8820, group: 'decking', description: 'کفپوش 15.5 سانتیمتر خانگی', cover: 6.25, sqm: true },
  { id: 'once', name: 'Once', code: 'FD142', widthMm: 142, thicknessMm: 21, weightG: 7830, group: 'decking', description: 'کفپوش سنگین 14.2 سانتیمتر – پارکی - پیچ و کلیپس مخفی', cover: 6.9444, sqm: true },
  { id: 't-once', name: 'T-Once', code: 'FD142T', widthMm: 142, thicknessMm: 21, weightG: 11310, group: 'decking', description: 'کفپوش سنگین توپر 14.2 سانتیمتر – پارکی - پیچ و کلیپس مخفی', cover: 6.9444, sqm: true },
  { id: 'flex', name: 'Flex', code: 'FD140', widthMm: 140, thicknessMm: 25, weightG: 7680, group: 'decking', description: 'کفپوش 14 سانتیمتر پیچ و کلیپس مخفی', cover: 6.897, sqm: true },
  { id: 'clan', name: 'Clan', code: 'FD92', widthMm: 91.5, thicknessMm: 21, weightG: 5070, group: 'decking', description: 'کفپوش 9.15 سانتیمتر پیچ و کلیپس مخفی', cover: 10.8696, sqm: true },
  { id: 't-clan', name: 'T-Clan', code: 'FD92T', widthMm: 91.5, thicknessMm: 21, weightG: 7080, group: 'decking', description: 'کفپوش توپر 9.15 سانتیمتر پیچ و کلیپس مخفی', cover: 10.8696, sqm: true },
  { id: 'fame', name: 'Fame', code: 'FD72', widthMm: 72, thicknessMm: 21, weightG: 4050, group: 'decking', description: 'کفپوش 7.2 سانتیمتر پیچ و کلیپس مخفی', cover: 13.8888 },
  { id: 't-fame', name: 'Fame-T', code: 'FD72T', widthMm: 72, thicknessMm: 21, weightG: 5100, group: 'decking', description: 'کفپوش 7.2 سانتیمتر تو پر پیچ و کلیپس مخفی', cover: 13.8888 },
  { id: 'fate', name: 'Fate', code: 'FB290', widthMm: 290, thicknessMm: 12, weightG: 14700, group: 'vivards', description: 'تخته توپر 29 سانتیمتر', cover: 3.3898 },
  { id: 'flat', name: 'Flat', code: 'FB130', widthMm: 130, thicknessMm: 11, weightG: 5460, group: 'vivards', description: 'تخته توپر 13 سانتیمتر', cover: 7.6923 },
  { id: 'petal', name: 'Petal', code: 'FB68', widthMm: 68, thicknessMm: 11, weightG: 2820, group: 'vivards', description: 'تخته توپر 6.8 سانتیمتر', cover: 14.7058 },
  { id: 'tail', name: 'Tail', code: 'FB55', widthMm: 55, thicknessMm: 14, weightG: 2940, group: 'vivards', description: 'تخته توپر 5.5 سانتیمتر', cover: 18.1818 },
  { id: 'viva', name: 'Viva', code: 'FB92', widthMm: 92, thicknessMm: 13, weightG: 4320, group: 'vivards', description: 'تخته توپر 9.2 سانتیمتر', cover: 10.99 },
  { id: 'off', name: 'Off', code: 'FT40', widthMm: 38, thicknessMm: 38, weightG: 3150, group: 'trim', description: 'لوور – نما – سقف – دیوار - نرده', size: '38 mm' },
  { id: 'imp', name: 'IMP', code: 'FT90', widthMm: 90, thicknessMm: 45, weightG: 5760, group: 'trim', description: 'لوور سقف و نما' },
  { id: 'coffin', name: 'Coffin', code: 'FT46', widthMm: 27, thicknessMm: 46, weightG: 4050, group: 'trim', description: 'پرچین ، نرده ، نما ، مبلمان شهری ، لوور' },
  { id: 't-coffin', name: 'T-Coffin', code: 'FT46T', widthMm: 27, thicknessMm: 46, weightG: 4605, group: 'trim', description: 'پرچین ، نرده ، نما ، مبلمان شهری ، لوور ، زیرسازی' },
  { id: 'down', name: 'Down', code: 'FT27', widthMm: 27, thicknessMm: 46, weightG: 2880, group: 'trim', description: 'ویژه زیرسازی پرچین ، نرده ، نما ، مبلمان شهری ، لوور' },
  { id: 'mela', name: 'Mela', code: 'FT60', widthMm: 60, thicknessMm: 40, weightG: 5268, group: 'trim', description: 'ویژه زیرسازی پرچین ، نرده ، نما ، مبلمان شهری ، لوور' },
]

const PRICE_LIST_NOTES = [
  'سه سال گارانتی کفپوش – صرفا در صورت نصب محصول توسط تیم های اجرایی که از سوی شرکت مسئول اجرای پروژه می شوند .',
  'پنج سال گارانتی نماپوش– صرفا در صورت نصب نماپوش توسط تیم های اجرایی که از سوی شرکت مسئول اجرای پروژه می شوند .',
  'فروش به همکار و یا هر عنوانی دیگر که اجرا و نصب توسط خودشان انجام می گردد شامل گارانتی نمی شود .',
  'استفاده از اکسسوری و ملزومات نصب غیر استاندارد محصول را از گارانتی خارج خواهد کرد .',
  'به دلیل افزایش کیفیت و ماندگاری محصول و همچنین حمل و نقل بهتر ، پیشنهاد میگردد پروفیل کفپوش با طول 2 متر و 10 سانتی متری سفارش دهید .',
  'افزایش طول پروفیل ها بیش از سه متر ، محصول را از شرایط گارانتی خارج میکند ( . به درخواست مشتری و حذف شرایط گارانتی ، قابل تولید است ) .',
  'حداقل ارتفاع مورد نیاز برای نصب از کف زمین تا زیر چوب پالست 15 سانتیمتر می باشد ، نصب با ارتفاع کمتر از میزان استاندارد محصول را از شرایط گارانتی خارج میکند .',
  '(کالیته رنگ) N3 – N4 – N6 - N7 – N8 – N9 – N10 – N11',
  'بنابر درخواست کارفرما ، پنج درصد مبلغ کل محصول بابت بسته بندی به فاکتور اضافه می گردد.',
]

const acc = (id: string, group: Accessory['group'], name: string, code: string, specialFor: string, price: number | null, extra: Partial<Accessory> = {}): Accessory => ({ id, group, name, code, specialFor, price, ...extra })
const ACCESSORIES: Accessory[] = [
  acc('hcl', 'clips', 'Clicker - H', 'HCL', 'ONCE – CLAN – FAME – POND - FAIR', 8_500, { shape: 'HCL' }),
  acc('hcls', 'clips', 'Clicker - H', 'HCLS', 'FEEL – LEAD - SHINE', 8_500, { shape: 'HCLS' }),
  acc('scl', 'clips', 'Starter Clicker', 'SCL', 'ONCE – CLAN – FAME – POND – FAIR – FEEL – LEAD - SHINE', 8_500, { shape: 'SCL' }),
  acc('tcl', 'clips', 'Clicker - T', 'TCL', 'POND – FAIR - FLEX', 8_500, { shape: 'TCL' }),
  acc('sd', 'clips', 'Sub Deck Clicker', 'SD', 'COFFIN – DOWN - MELA', 55_000, { shape: 'SD' }),
  acc('sd1', 'clips', 'L - Clicker', 'SD1', 'COFFIN – DOWN - MELA', 55_000, { shape: 'SD1' }),
  acc('icl', 'clips', 'I - Clicker', 'ICL', 'IMP', 75_000, { shape: 'ICL' }),
  acc('u', 'finishers', 'U', 'U1 ( 3 x 3 x 3 x 3 )', '( با رنگ کوره ای )', null, { shape: 'U1' }),
  acc('el', 'finishers', 'EL', 'L1 ( 5 x 3 x 3 ) cm', '( با رنگ کوره ای )', null, { shape: 'L1' }),
  acc('omega', 'finishers', 'OMEGA', 'Ω ( 2 x 10 x 10 x 2 ) cm', '( با رنگ کوره ای )', null, { shape: 'OMEGA' }),
  acc('s1', 'screws', 'پیچ 2 سرمته', '4.2 mm x 19 mm', 'پیچ 2.5 سرمته غیر رنگی', null),
  acc('s2', 'screws', 'پیچ 4 سرمته', '4.2 mm x 38 mm', '', null),
  acc('s3', 'screws', 'پیچ 2 ام دی اف', '4.2 mm x 19 mm', '', null),
  acc('s4', 'screws', 'پیچ 2 سرمته', '4.2 mm x 19 mm', 'رنگی', null),
  acc('s5', 'screws', 'پیچ 2.5 سرمته', '4.2 mm x 25 mm', 'رنگی', null),
  acc('s6', 'screws', 'پیچ 4 سرمته', '4.2 mm x 38 mm', 'رنگی', null),
  acc('tile1', 'tiles', 'TILE FAME 4', '30 x 30', 'ساخته شده کامل', null, { shapeText: 'LAVAN' }),
  acc('tile2', 'tiles', 'TILE CLAN 3', '30 x 30', 'ساخته شده کامل', null, { shapeText: 'SHIDOR' }),
]

/** A fresh copy every time: callers edit the result, and the module-level tables must never change. */
export function seedCatalog(): Catalog {
  return structuredClone(buildSeed())
}

function buildSeed(): Catalog {
  const products: Product[] = productDefs.map(d => ({
    id: d.id,
    name: d.name,
    code: d.code,
    widthMm: d.widthMm,
    thicknessMm: d.thicknessMm,
    usages: [],
    weightPer3mG: d.weightG,
    baseRecipeId: 'wpc-profile',
    colorable: true,
    group: d.group,
    description: d.description,
    ...(d.cover != null ? { coverPerM2: d.cover } : {}),
    ...(d.sqm ? { showSqm: true } : {}),
    ...(d.size ? { sizeText: d.size } : {}),
  }))
  const colors: Color[] = colorDefs.map(([id, name, items]) => ({ id, name, items }))

  const recipes: Recipe[] = [
    { id: 'scf', name: 'پلیمر آماده‌ی مصرف (خرید + خردکردن)', kind: 'semi', items: [m('pp', 100)], overheadPerKg: POLYMER_EXTRA / RIAL },
    { id: 'prpf', name: 'PRP پروفایل (PRPF)', kind: 'semi', overheadPerKg: 0, items: [r('scf', 56.5), m('carbonate', 40), m('graft', 1.5), m('a060', 0.25), m('a2112', 0.25), m('wax', 1.5)] },
    { id: 'wpc-profile', name: 'پروفیل WPC (پایه)', kind: 'base', overheadPerKg: 0, items: [r('prpf', 33), m('wood', 61), m('wax', 1.5), m('graft', 2)] },
  ]

  return {
    seedVersion: SEED_VERSION,
    // The printed price list (NEST – SUMMER 1405). The price printed for a profile is the one of colour N9, with no colour written on it.
    priceList: { title: 'NEST – SUMMER 1405', colorId: 'n9', roundTo: 1000, sqmRoundTo: 10_000, notes: PRICE_LIST_NOTES, accessories: ACCESSORIES },
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
