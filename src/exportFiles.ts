import { METRIC_LABEL, NO_COLOR, metricValue, priceExportJson, type PriceExport, type PriceMetric } from './core'

/** Saves text or bytes as a file download. */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const exportName = (x: PriceExport, ext: string) => `wpc-price-list-${x.jalaliDate.replace(/\//g, '-')}.${ext}`

export function downloadJson(x: PriceExport) {
  saveBlob(new Blob([priceExportJson(x)], { type: 'application/json' }), exportName(x, 'json'))
}

const METRICS: PriceMetric[] = ['perStick', 'perMeter', 'perSqm', 'perKg']
const SHEET_NAME: Record<PriceMetric, string> = { perStick: 'قیمت شاخه', perMeter: 'قیمت متر', perSqm: 'قیمت متر مربع', perKg: 'قیمت کیلو' }

/** Excel: one sheet with the settings, then one sheet per price kind (products down, colours across). */
export async function downloadExcel(x: PriceExport) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const head = { fontWeight: 'bold' as const, backgroundColor: '#e8f0ec', align: 'center' as const }
  const text = (value: string, extra: object = {}) => ({ value, type: String, ...extra })
  const num = (value: number | null) => (value == null ? { value: '—', type: String, align: 'center' as const } : { value, type: Number, format: '#,##0' })

  const info = [
    [text('لیست قیمت محصولات WPC', { fontWeight: 'bold', fontSize: 14 })],
    [text('تاریخ'), text(x.jalaliDate)],
    [text('تعرفه'), text(`${x.tariff.name} (${x.tariff.marginPct}٪ سود)`)],
    [text('روش پرداخت'), text(x.payment === 'cheque' ? `چک دو ماهه (+${x.payPct}٪)` : 'نقدی')],
    [text('واحد قیمت'), text('تومان')],
    [text('رُند کردن'), text(`تا ${x.roundTo} تومان`)],
    [text('وضعیت'), text(x.notIncluded.length ? `ناقص: بدون ${x.notIncluded.join('، ')}` : 'کامل (همه‌ی هزینه‌ها و سود)')],
  ]
  const sheets = [{ data: info, sheet: 'اطلاعات', columns: [{ width: 18 }, { width: 50 }], rightToLeft: true }]

  for (const metric of METRICS) {
    const colorCols = x.colors.length ? x.colors : [{ id: NO_COLOR, name: 'قیمت', hex: '' }]
    const cell = (value: string) => ({ ...head, value, type: String })
    const header = [cell(METRIC_LABEL[metric]), cell('کد'), cell('پهنا×ضخامت (mm)'), cell('وزن شاخه (گرم)'), cell('طول شاخه (متر)'), ...colorCols.map(c => cell(c.name))]
    const rows = x.rows.map(({ product: p, lengthM, byColor }) => [
      text(p.name, { fontWeight: 'bold' }),
      text(p.code),
      text(p.widthMm != null && p.thicknessMm != null ? `${p.widthMm}×${p.thicknessMm}` : '—', { align: 'center' }),
      num(p.weightPer3mG),
      num(lengthM),
      ...(p.colorable ? colorCols.map(c => num(metricValue(byColor[c.id], metric))) : [num(metricValue(byColor[NO_COLOR], metric)), ...colorCols.slice(1).map(() => text(''))]),
    ])
    sheets.push({
      data: [header, ...rows] as never,
      sheet: SHEET_NAME[metric],
      columns: [{ width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, ...colorCols.map(() => ({ width: 13 }))],
      rightToLeft: true,
      stickyRowsCount: 1,
      stickyColumnsCount: 1,
    } as never)
  }
  const blob = await writeExcelFile(sheets as never).toBlob()
  saveBlob(blob, exportName(x, 'xlsx'))
}
