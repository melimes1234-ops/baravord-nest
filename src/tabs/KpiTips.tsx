import type { ReactNode } from 'react'
import { faNum, formatKg, formatToman, toFa, type Explain } from '../core'
import { Bill } from '../ui'

const t = (n: number | null) => `${formatToman(n)} تومان`

export type KpiKind = 'cost' | 'sale' | 'stick' | 'meter' | 'sqm'

/** What the number is, in plain words, with this product's real numbers. */
export function kpiTip(kind: KpiKind, e: Explain): ReactNode {
  switch (kind) {
    case 'cost':
      return (
        <Bill
          intro="این همان پولی است که کارخانه برای ساختن یک کیلو از این محصول خرج می‌کند."
          rows={[
            { label: 'مواد (با دورریز)', value: t(e.afterWastePerKg) },
            { label: 'هزینه‌های ثابت کارخانه (برق، حقوق ...)', value: t(e.overheadPerKg) },
            { label: 'کرایه و انبارداری', value: t(e.extrasPerKg) },
          ]}
          total={{ label: 'خرج ساخت یک کیلو', value: t(e.costPerKg) }}
          note={e.overheadPerKg === 0 ? 'هزینه‌های ثابت کارخانه هنوز نوشته نشده، برای همین صفر حساب شده.' : undefined}
        />
      )
    case 'sale':
      return (
        <Bill
          intro="قیمت فروش یعنی خرج ساخت، به‌اضافه‌ی سود."
          rows={[
            { label: 'خرج ساخت یک کیلو', value: t(e.costPerKg) },
            { label: `سود (${toFa(e.marginPct)}٪ از آن)`, value: t(e.profitPerKg) },
          ]}
          total={{ label: 'قیمت فروش یک کیلو', value: t(e.salePerKg) }}
        />
      )
    case 'stick':
      if (e.weightG == null)
        return <Bill intro="قیمت یک شاخه." rows={[]} note={<span className="bad">وزن این محصول را هنوز ننوشته‌اید. در تب «محصولات» وزنش را بنویسید.</span>} />
      return (
        <Bill
          intro="قیمت یک شاخه را از روی وزنش حساب می‌کنیم: هر کیلو چند تومان است، شاخه چند کیلو وزن دارد."
          rows={[
            { label: 'قیمت یک کیلو', value: t(e.salePerKg) },
            { label: 'وزن یک شاخه', value: `${formatKg(e.weightG / 1000)} کیلو` },
          ]}
          total={{ label: `قیمت یک شاخه ${faNum(e.lengthM)} متری`, value: t(e.perStick) }}
          note={`عدد را به نزدیک‌ترین ${formatToman(e.roundStep)} تومان رسانده‌ایم.`}
        />
      )
    case 'meter':
      if (e.weightG == null || e.perStickRaw == null)
        return <Bill intro="قیمت یک متر." rows={[]} note={<span className="bad">وزن این محصول را هنوز ننوشته‌اید. در تب «محصولات» وزنش را بنویسید.</span>} />
      return (
        <Bill
          intro="قیمت یک شاخه را بین متر‌هایش تقسیم می‌کنیم."
          rows={[
            { label: 'قیمت یک شاخه', value: t(e.perStickRaw) },
            { label: 'طول شاخه', value: `${faNum(e.lengthM)} متر` },
          ]}
          total={{ label: 'قیمت یک متر', value: t(e.perMeter) }}
          note={`عدد را به نزدیک‌ترین ${formatToman(e.roundStep)} تومان رسانده‌ایم.`}
        />
      )
    case 'sqm':
      if (e.widthM == null || e.perMeterRaw == null)
        return <Bill intro="قیمت یک متر مربع." rows={[]} note={<span className="bad">برای این قیمت، هم وزن و هم عرض محصول لازم است. عرض را در تب «محصولات» بنویسید.</span>} />
      return (
        <Bill
          intro="برای پوشاندن یک متر مربع، چند متر از این محصول لازم است؟ هرچه محصول باریک‌تر باشد، متر بیشتری می‌خواهد."
          rows={[
            { label: 'عرض محصول', value: `${formatKg(e.widthM)} متر` },
            { label: 'متر لازم برای یک متر مربع', value: `${faNum(Math.round((1 / e.widthM) * 100) / 100)} متر` },
            { label: 'قیمت یک متر', value: t(e.perMeterRaw) },
          ]}
          total={{ label: 'قیمت یک متر مربع', value: t(e.perSqm) }}
        />
      )
  }
}
