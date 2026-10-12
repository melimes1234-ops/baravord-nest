import { formatKg, formatToman, goodsSentence, type Catalog, type GoodsMove } from './core'

const ROLE: Record<string, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }
const MOVE: Record<string, string> = { in: 'خرید', waste_in: 'ضایعات برگشتی', adjust: 'تعدیل موجودی' }

const LABEL: Record<string, string> = {
  login: 'ورود',
  'catalog.update': 'تغییر قیمت‌ها یا تنظیمات',
  'catalog.init': 'ساخت اطلاعات اولیه',
  'movement.add': 'ثبت در انبار',
  'batch.add': 'ثبت پارت تولید',
  'goods.add': 'ثبت محصول ساخته‌شده',
  'goods.delete': 'حذف ثبت محصول ساخته‌شده',
  'user.add': 'ساخت کاربر',
  'user.update': 'تغییر کاربر',
  'user.delete': 'حذف کاربر',
  'user.role': 'تغییر نقش کاربر',
}

export const auditLabel = (action: string): string => LABEL[action] ?? action

/** The change-log "details" cell as a few readable lines (never raw JSON). */
export function auditLines(action: string, detailText: string, catalog?: Catalog): string[] {
  let d: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(detailText)
    if (parsed && typeof parsed === 'object') d = parsed as Record<string, unknown>
  } catch {
    // an old or unreadable entry: show the general sentence only
  }
  const mat = (id: unknown) => catalog?.materials[String(id)]?.name ?? 'یک ماده'
  switch (action) {
    case 'login':
      return ['وارد برنامه شد']
    case 'catalog.update': {
      if (Array.isArray(d.changes) && d.changes.length > 0) return d.changes.map(String)
      if (typeof d.note === 'string' && d.note.trim()) return d.note.split('\n').filter(Boolean)
      return ['اطلاعات ذخیره شد (برای این مورد، ریز تغییرها ثبت نشده است)']
    }
    case 'catalog.init':
      return ['مواد، فرمول‌ها و محصولات اولیه ساخته شد']
    case 'movement.add': {
      const kg = typeof d.kg === 'number' ? `${formatKg(Math.abs(d.kg))} کیلو` : ''
      const price = typeof d.pricePerKg === 'number' ? `، کیلویی ${formatToman(d.pricePerKg)} تومان` : ''
      return [`${MOVE[String(d.type)] ?? 'ثبت'}: ${kg} ${mat(d.materialId)}${price}`.replace(/\s+/g, ' ')]
    }
    case 'batch.add': {
      const product = catalog?.products[String(d.productId)]?.name ?? 'یک محصول'
      const color = d.colorId ? catalog?.colors[String(d.colorId)]?.name : undefined
      return [`پارت ${product}${color ? ` با رنگ ${color}` : ''}`]
    }
    case 'goods.add':
      return [goodsSentence(d as unknown as GoodsMove, catalog)]
    case 'goods.delete':
      return [`حذف شد — ${goodsSentence(d as unknown as GoodsMove, catalog)}`]
    case 'user.add':
      return [`کاربر «${String(d.username ?? '')}» با نقش ${ROLE[String(d.role)] ?? ''} ساخته شد`]
    case 'user.update': {
      const bits = [d.role ? `نقش به ${ROLE[String(d.role)] ?? ''}` : '', d.passwordChanged ? 'رمز عبور' : ''].filter(Boolean)
      return [`برای «${String(d.username ?? '')}» عوض شد: ${bits.join(' و ') || '—'}`]
    }
    case 'user.delete':
      return [`کاربر «${String(d.username ?? '')}» حذف شد`]
    case 'user.role':
      return [`نقش یک کاربر به ${ROLE[String(d.role)] ?? ''} تغییر کرد`]
    default:
      return []
  }
}

