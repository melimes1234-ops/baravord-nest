import { toFa, validateCatalog, type Catalog } from '../core'

interface Gap {
  text: string
  tab: string
  /** true = the price is wrong without it; false = only worth knowing. */
  must: boolean
}

/** What the user still has to fill in for the prices to be complete, in plain words. Empty when everything is there. */
export function priceGaps(catalog: Catalog): Gap[] {
  const gaps: Gap[] = []
  const issues = validateCatalog(catalog)
  const names = (msg: string) => issues.filter(i => i.message.startsWith(msg)).map(i => i.where)

  const noPrice = names('قیمت ماده نوشته نشده')
  if (noPrice.length) gaps.push({ must: true, tab: 'مواد', text: `قیمت این مواد نوشته نشده (${noPrice.join('، ')}). تا نوشته نشود، قیمت محصولی که از آن‌ها استفاده می‌کند کمتر از واقعی درمی‌آید.` })
  const noWeight = names('وزن شاخه نوشته نشده')
  if (noWeight.length) gaps.push({ must: true, tab: 'محصولات', text: `وزن شاخه‌ی این محصولات نوشته نشده (${noWeight.join('، ')}). بدون وزن، قیمت شاخه و متر معلوم نمی‌شود.` })

  const c = catalog.config
  const fixed = c.monthlyCosts.reduce((s, l) => s + l.amount, 0)
  if (fixed <= 0) gaps.push({ must: true, tab: 'هزینه‌ها', text: 'هزینه‌های ثابت ماهانه (برق، حقوق، اجاره) نوشته نشده و در قیمت نیست.' })
  else if (c.monthlyProductionKg <= 0) gaps.push({ must: true, tab: 'هزینه‌ها', text: 'کیلوی تولید ماهانه نوشته نشده؛ بدون آن، هزینه‌های ثابت بین کیلوها پخش نمی‌شود و در قیمت نمی‌آید.' })

  if (c.perBatchCosts.every(l => !(l.amount > 0))) gaps.push({ must: false, tab: 'هزینه‌ها', text: 'هزینه‌ی هر پارت (کرایه، انبارداری، باسکول) نوشته نشده و در قیمت نیست. اگر چنین هزینه‌ای ندارید، همین‌طور بماند.' })
  if (!(c.wastePct > 0)) gaps.push({ must: false, tab: 'هزینه‌ها', text: 'درصد دورریز صفر است، یعنی فرض شده هیچ ماده‌ای هدر نمی‌رود. اگر در کارخانه دورریز دارید، عدد واقعی را بنویسید تا قیمت واقعی‌تر شود.' })
  return gaps
}

/** A short box above the price list: what is still missing and where to write it. */
export function PriceGaps({ catalog, go }: { catalog: Catalog; go?: (tab: string) => void }) {
  const gaps = priceGaps(catalog)
  if (gaps.length === 0) return null
  const must = gaps.filter(g => g.must).length
  return (
    <div className={`alert gaps print-hide${must ? '' : ' soft'}`}>
      <b>{must ? `این قیمت‌ها هنوز کامل نیست (${toFa(must)} مورد)` : 'قیمت‌ها کامل است؛ فقط این نکته‌ها را بدانید'}</b>
      <ul>
        {gaps.map(g => (
          <li key={g.text}>
            {g.text}
            {go && <> <button className="btn ghost link" onClick={() => go(g.tab)}>نوشتن در «{g.tab}» ←</button></>}
          </li>
        ))}
      </ul>
    </div>
  )
}
