import type { ReactNode } from 'react'
import { faNum, formatKg, formatToman, toFa, type Explain } from '../core'

const m = formatToman
/** Numbers read left-to-right even inside Persian text. */
const N = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="num-inline">{children}</bdi>
const more = <p className="tip-more">همه‌ی قدم‌ها را در تب «محاسبات» ببینید.</p>

export type KpiKind = 'cost' | 'sale' | 'stick' | 'meter' | 'sqm'

/** What the number is, and how it was calculated, with this product's real numbers. */
export function kpiTip(kind: KpiKind, e: Explain): ReactNode {
  switch (kind) {
    case 'cost':
      return (
        <>
          <p><b>قیمت تمام‌شده‌ی هر کیلو</b>: پولی که کارخانه برای ساختن یک کیلو از این محصول خرج می‌کند.</p>
          <p>مواد (با ضایعات) + سربار کارخانه + کرایه و انبارداری</p>
          <p><N>{m(e.afterWastePerKg)} + {m(e.overheadPerKg)} + {m(e.extrasPerKg)} = {m(e.costPerKg)}</N></p>
          {more}
        </>
      )
    case 'sale':
      return (
        <>
          <p><b>قیمت فروش هر کیلو</b>: قیمت تمام‌شده به‌اضافه‌ی سود تعرفه «{e.tariff.name}».</p>
          <p>قیمت تمام‌شده × (۱ + درصد سود)</p>
          <p><N>{m(e.costPerKg)} × (۱ + {toFa(e.marginPct)}٪) = {m(e.salePerKg)}</N></p>
          {more}
        </>
      )
    case 'stick':
      return (
        <>
          <p><b>قیمت یک شاخه</b> ({faNum(e.lengthM)} متری).</p>
          {e.weightG == null ? (
            <p className="over">وزن این محصول وارد نشده، پس قیمت شاخه حساب نمی‌شود.</p>
          ) : (
            <>
              <p>قیمت فروش هر کیلو × وزن شاخه (به کیلو)</p>
              <p><N>{m(e.salePerKg)} × {formatKg(e.weightG / 1000)} کیلو = {m(e.perStickRaw)}</N></p>
              <p>بعد به مضرب <N>{m(e.roundStep)}</N> گرد می‌شود: <N>{m(e.perStick)}</N></p>
            </>
          )}
          {more}
        </>
      )
    case 'meter':
      return (
        <>
          <p><b>قیمت هر متر</b>: قیمت شاخه تقسیم بر طول شاخه.</p>
          {e.weightG == null || e.perStickRaw == null ? (
            <p className="over">وزن این محصول وارد نشده، پس قیمت متر حساب نمی‌شود.</p>
          ) : (
            <>
              <p><N>{m(e.perStickRaw)} ÷ {faNum(e.lengthM)} متر = {m(e.perMeterRaw)}</N></p>
              <p>بعد به مضرب <N>{m(e.roundStep)}</N> گرد می‌شود: <N>{m(e.perMeter)}</N></p>
            </>
          )}
          {more}
        </>
      )
    case 'sqm':
      return (
        <>
          <p><b>قیمت هر متر مربع</b>: هر متر از محصول فقط به اندازه‌ی عرضش سطح را می‌پوشاند.</p>
          {e.widthM == null || e.perMeterRaw == null ? (
            <p className="over">برای این قیمت، هم وزن و هم عرض محصول لازم است. عرض را در تب «محصولات» بنویسید.</p>
          ) : (
            <>
              <p>قیمت هر متر ÷ عرض (به متر)</p>
              <p><N>{m(e.perMeterRaw)} ÷ {formatKg(e.widthM)} متر = {m(e.perSqmRaw)}</N></p>
              <p>بعد به مضرب <N>{m(e.roundStep)}</N> گرد می‌شود: <N>{m(e.perSqm)}</N></p>
            </>
          )}
          {more}
        </>
      )
  }
}
