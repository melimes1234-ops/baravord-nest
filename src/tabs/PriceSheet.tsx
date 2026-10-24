import { createPortal } from 'react-dom'
import { METRIC_LABEL, NO_COLOR, faNum, formatToman, metricValue, toFa, type PriceExport, type PriceMetric } from '../core'

/** The printable (and «save as PDF») version of the price list. It is only on screen while printing. */
export function PriceSheet({ data, metrics }: { data: PriceExport; metrics: PriceMetric[] }) {
  const cols = data.colors.length ? data.colors : [{ id: NO_COLOR, name: 'قیمت', hex: '' }]
  return createPortal(
    <div className="print-sheet" dir="rtl">
      {metrics.map(metric => (
        <section className="ps-section" key={metric}>
          <h1>لیست قیمت محصولات WPC — {METRIC_LABEL[metric]}</h1>
          <p className="ps-meta">
            تاریخ: {toFa(data.jalaliDate)} · تعرفه: {data.tariff.name} ({toFa(data.tariff.marginPct)}٪ سود) · پرداخت: {data.payment === 'cheque' ? `چک دو ماهه (+${toFa(data.payPct)}٪)` : 'نقدی'} · قیمت‌ها به تومان
            {data.notIncluded.length > 0 && <b className="ps-warn"> · ناقص: بدون {data.notIncluded.join('، ')}</b>}
          </p>
          <table className="ps-table">
            <thead>
              <tr>
                <th className="ps-name">محصول</th>
                <th>ابعاد (mm)</th>
                <th>وزن شاخه (گرم)</th>
                <th>طول (متر)</th>
                {cols.map(c => (
                  <th key={c.id}>
                    {c.hex && <i className="ps-sw" style={{ background: c.hex }} />}
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(({ product: p, lengthM, byColor }) => (
                <tr key={p.id}>
                  <td className="ps-name"><b>{p.name}</b> <span>{p.code}</span></td>
                  <td>{p.widthMm != null && p.thicknessMm != null ? `${faNum(p.widthMm)}×${faNum(p.thicknessMm)}` : '—'}</td>
                  <td>{p.weightPer3mG == null ? '—' : formatToman(p.weightPer3mG)}</td>
                  <td>{faNum(lengthM)}</td>
                  {p.colorable
                    ? cols.map(c => <td key={c.id} className="ps-n">{formatToman(metricValue(byColor[c.id], metric))}</td>)
                    : <td className="ps-n" colSpan={cols.length}>{formatToman(metricValue(byColor[NO_COLOR], metric))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ps-foot">
            {metric === 'perSqm' ? 'قیمت متر مربع = قیمت هر متر ÷ پهنای محصول (به متر).' : metric === 'perMeter' ? 'قیمت هر متر = قیمت شاخه ÷ طول شاخه.' : metric === 'perStick' ? 'قیمت شاخه = قیمت هر کیلو × وزن شاخه.' : 'قیمت فروش هر کیلو، با تعرفه‌ی بالا.'}
            {' '}«—» یعنی قیمت معلوم نیست (وزن یا پهنا نوشته نشده).
          </p>
        </section>
      ))}
    </div>,
    document.body,
  )
}
