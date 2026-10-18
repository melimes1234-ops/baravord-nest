import { formatToman, toFa } from './format'
import type { Catalog, CostLine } from './types'

const num = (n: number | null | undefined) => (n == null ? 'نوشته نشده' : formatToman(n))
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sumLines = (l: CostLine[]) => l.reduce((s, x) => s + x.amount, 0)

/**
 * What changed between two saved catalogs, as short Persian sentences for the change log.
 * At most `max` lines; the rest is summarised.
 */
export function catalogChanges(prev: Catalog, next: Catalog, max = 12): string[] {
  const out: string[] = []

  for (const id of Object.keys(next.materials)) {
    const a = prev.materials[id]
    const b = next.materials[id]
    if (!a) out.push(`ماده‌ی جدید: «${b.name}»`)
    else {
      if (a.name !== b.name) out.push(`اسم ماده از «${a.name}» به «${b.name}» عوض شد`)
      if (a.pricePerKg !== b.pricePerKg) out.push(`قیمت «${b.name}» از ${num(a.pricePerKg)} به ${num(b.pricePerKg)} تومان`)
    }
  }
  for (const id of Object.keys(prev.materials)) if (!next.materials[id]) out.push(`ماده حذف شد: «${prev.materials[id].name}»`)

  const formulas = (kind: 'recipes' | 'colors', label: string) => {
    for (const id of Object.keys(next[kind])) {
      const a = prev[kind][id]
      const b = next[kind][id]
      if (!a) out.push(`${label} جدید: «${b.name}»`)
      else if (a.name !== b.name) out.push(`${label} «${a.name}» به «${b.name}» تغییر نام داد`)
      else if (!sameJson(a.items, b.items)) out.push(`مقدار مواد ${label} «${b.name}» عوض شد`)
    }
    for (const id of Object.keys(prev[kind])) if (!next[kind][id]) out.push(`${label} حذف شد: «${prev[kind][id].name}»`)
  }
  formulas('recipes', 'فرمول')
  formulas('colors', 'رنگ')

  for (const id of Object.keys(next.products)) {
    const a = prev.products[id]
    const b = next.products[id]
    if (!a) { out.push(`محصول جدید: «${b.name}»`); continue }
    if (a.name !== b.name) out.push(`محصول «${a.name}» به «${b.name}» تغییر نام داد`)
    if (a.weightPer3mG !== b.weightPer3mG) out.push(`وزن شاخه‌ی «${b.name}» از ${num(a.weightPer3mG)} به ${num(b.weightPer3mG)} گرم`)
    if ((a.stickLengthM ?? null) !== (b.stickLengthM ?? null)) out.push(`طول شاخه‌ی «${b.name}» عوض شد`)
    if ((a.widthMm ?? null) !== (b.widthMm ?? null)) out.push(`عرض «${b.name}» از ${num(a.widthMm)} به ${num(b.widthMm)} میلی‌متر`)
    if (a.baseRecipeId !== b.baseRecipeId) out.push(`فرمول «${b.name}» عوض شد`)
  }
  for (const id of Object.keys(prev.products)) if (!next.products[id]) out.push(`محصول حذف شد: «${prev.products[id].name}»`)

  for (const t of next.tariffs) {
    const o = prev.tariffs.find(x => x.id === t.id)
    if (!o) out.push(`تعرفه‌ی جدید: «${t.name}» با ${toFa(t.marginPct)}٪ سود`)
    else if (o.marginPct !== t.marginPct) out.push(`سود تعرفه‌ی «${t.name}» از ${toFa(o.marginPct)}٪ به ${toFa(t.marginPct)}٪`)
    else if (o.name !== t.name) out.push(`تعرفه‌ی «${o.name}» به «${t.name}» تغییر نام داد`)
  }
  for (const t of prev.tariffs) if (!next.tariffs.some(x => x.id === t.id)) out.push(`تعرفه حذف شد: «${t.name}»`)

  const pc = prev.config
  const nc = next.config
  if (!sameJson(pc.monthlyCosts, nc.monthlyCosts)) out.push(`هزینه‌های ثابت ماهانه از ${formatToman(sumLines(pc.monthlyCosts))} به ${formatToman(sumLines(nc.monthlyCosts))} تومان`)
  if (pc.monthlyProductionKg !== nc.monthlyProductionKg) out.push(`کیلوی تولید ماه از ${formatToman(pc.monthlyProductionKg)} به ${formatToman(nc.monthlyProductionKg)}`)
  if (!sameJson(pc.perBatchCosts, nc.perBatchCosts)) out.push(`هزینه‌های هر پارت از ${formatToman(sumLines(pc.perBatchCosts))} به ${formatToman(sumLines(nc.perBatchCosts))} تومان`)
  if (pc.batchKg !== nc.batchKg) out.push(`وزن پارت معمولی از ${toFa(pc.batchKg)} به ${toFa(nc.batchKg)} کیلو`)
  if (pc.wastePct !== nc.wastePct) out.push(`درصد دورریز از ${toFa(pc.wastePct)}٪ به ${toFa(nc.wastePct)}٪`)
  if (pc.roundTo !== nc.roundTo) out.push(`رساندن قیمت‌ها به نزدیک‌ترین ${formatToman(pc.roundTo)} تومان`)
  if (pc.defaultTolerancePct !== nc.defaultTolerancePct) out.push(`حد مجاز فرق با فرمول از ${toFa(pc.defaultTolerancePct)}٪ به ${toFa(nc.defaultTolerancePct)}٪`)

  if (out.length > max) return [...out.slice(0, max), `و ${toFa(out.length - max)} تغییر دیگر`]
  return out
}
