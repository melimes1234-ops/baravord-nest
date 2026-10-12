import { flatten, sumKg } from './flatten'
import type { Catalog } from './types'

export interface Issue {
  level: 'error' | 'warn'
  where: string
  message: string
  /** Tab where it can be fixed. */
  tab?: string
}

/** Finds everything that makes a price wrong or incomplete. */
export function validateCatalog(c: Catalog): Issue[] {
  const issues: Issue[] = []
  const used = new Set<string>()

  for (const p of Object.values(c.products)) {
    if (p.weightPer3mG == null) {
      issues.push({ level: 'warn', where: p.name, message: 'وزن شاخه نوشته نشده؛ قیمت شاخه و متر معلوم نمی‌شود', tab: 'محصولات' })
    }
    const base = c.recipes[p.baseRecipeId]
    if (!base) {
      issues.push({ level: 'error', where: p.name, message: 'فرمول پایه پیدا نشد', tab: 'فرمول‌ها' })
      continue
    }
    try {
      for (const id of Object.keys(flatten(base.items, c))) used.add(id)
    } catch (e) {
      issues.push({ level: 'error', where: p.name, message: (e as Error).message, tab: 'فرمول‌ها' })
    }
    if (sumKg(base.items) <= 0) issues.push({ level: 'error', where: base.name, message: 'مجموع وزن فرمول صفر است', tab: 'فرمول‌ها' })
  }
  for (const col of Object.values(c.colors)) {
    for (const i of col.items) if (i.ref.kind === 'material') used.add(i.ref.id)
  }
  for (const id of used) {
    const m = c.materials[id]
    if (!m) issues.push({ level: 'error', where: id, message: 'این ماده در لیست مواد نیست', tab: 'مواد' })
    else if (m.pricePerKg == null) issues.push({ level: 'warn', where: m.name, message: 'قیمت ماده نوشته نشده', tab: 'مواد' })
  }
  if (c.config.monthlyCosts.length === 0) {
    issues.push({ level: 'warn', where: 'هزینه‌ها', message: 'هزینه‌های ثابت کارخانه نوشته نشده؛ در قیمت نیامده. در تب «هزینه‌ها»، در جدول اول، دکمه‌ی «افزودن ردیف» را بزنید و اسم و مبلغ ماهانه را بنویسید.', tab: 'هزینه‌ها' })
  } else if (c.config.monthlyCosts.every(l => !(l.amount > 0))) {
    issues.push({ level: 'warn', where: 'هزینه‌ها', message: 'ردیف هزینه‌ی ثابت هست ولی مبلغی جلویش نوشته نشده؛ در قیمت نیامده. مبلغ ماهانه‌ی هر ردیف را در جدول اول تب «هزینه‌ها» بنویسید.', tab: 'هزینه‌ها' })
  } else if (c.config.monthlyProductionKg <= 0) {
    issues.push({ level: 'error', where: 'هزینه‌ها', message: 'کیلوی تولید این ماه نوشته نشده', tab: 'هزینه‌ها' })
  }
  return issues
}
