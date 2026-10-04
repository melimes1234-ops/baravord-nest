import { flatten, sumKg } from './flatten'
import type { Catalog } from './types'

export interface Issue {
  level: 'error' | 'warn'
  where: string
  message: string
}

/** Finds everything that makes a price wrong or incomplete. */
export function validateCatalog(c: Catalog): Issue[] {
  const issues: Issue[] = []
  const used = new Set<string>()

  for (const p of Object.values(c.products)) {
    if (p.weightPer3mG == null) {
      issues.push({ level: 'warn', where: p.name, message: 'وزن شاخه ۳ متری وارد نشده؛ قیمت هر متر محاسبه نمی‌شود' })
    }
    const base = c.recipes[p.baseRecipeId]
    if (!base) {
      issues.push({ level: 'error', where: p.name, message: 'فرمول پایه پیدا نشد' })
      continue
    }
    try {
      for (const id of Object.keys(flatten(base.items, c))) used.add(id)
    } catch (e) {
      issues.push({ level: 'error', where: p.name, message: (e as Error).message })
    }
    if (sumKg(base.items) <= 0) issues.push({ level: 'error', where: base.name, message: 'مجموع وزن فرمول صفر است' })
  }
  for (const col of Object.values(c.colors)) {
    for (const i of col.items) if (i.ref.kind === 'material') used.add(i.ref.id)
    if (col.needsReview) {
      issues.push({ level: 'warn', where: col.name, message: 'فرمول رنگ از روی دست‌نوشته خوانده شده و باید تأیید شود' })
    }
  }
  for (const id of used) {
    const m = c.materials[id]
    if (!m) issues.push({ level: 'error', where: id, message: 'ماده در لیست مواد نیست' })
    else if (m.pricePerKg == null) issues.push({ level: 'warn', where: m.name, message: 'قیمت ماده وارد نشده' })
  }
  if (c.config.monthlyCosts.length === 0) {
    issues.push({ level: 'warn', where: 'هزینه‌ها', message: 'هزینه‌های ماهانه وارد نشده؛ سربار صفر حساب می‌شود' })
  } else if (c.config.monthlyProductionKg <= 0) {
    issues.push({ level: 'error', where: 'هزینه‌ها', message: 'کیلوی تولید ماهانه وارد نشده' })
  }
  return issues
}
