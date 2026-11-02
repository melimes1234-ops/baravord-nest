import { createPortal } from 'react-dom'
import { ACCESSORY_GROUP_LABEL, GROUP_LABEL, SHAPES, type OfficialList } from '../core'

const num = (n: number | null) => (n == null ? '' : n.toLocaleString('en-US'))
/** A picture at the size it has in the original list (the files are 300 dpi). */
const Pic = ({ code }: { code?: string }) => {
  const s = code ? SHAPES[code] : undefined
  return s ? <img className="os-pic" src={s.src} alt="" style={{ width: `${s.w / 300}in`, height: `${s.h / 300}in` }} /> : null
}

/** «7.1428» split at the point, so the decimal points of all rows stand exactly under each other. */
const Cover = ({ v }: { v: string }) => {
  const [i, f] = v.split('.')
  return (
    <span className="os-cov" dir="ltr">
      <span className="os-cov-dash">-</span>
      <span className="os-cov-i">{i}</span>
      <span className="os-cov-f">{f ? `.${f}` : ''}</span>
    </span>
  )
}

/** The factory's printed price list: page 1 profiles, page 2 accessories. Only on screen while printing. */
export function OfficialSheet({ data }: { data: OfficialList }) {
  return createPortal(
    <div className="print-sheet official-sheet" dir="rtl">
      <section className="os-page os-p1">
        <div className="os-title">{data.title}{data.notIncluded.length > 0 && <span className="os-warn"> — ناقص: بدون {data.notIncluded.join('، ')}</span>}</div>
        <div className="os-frame">
          <table className="os-table">
            <colgroup>
              <col style={{ width: '4.5%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10.5%' }} />
              <col style={{ width: '19%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10.5%' }} /><col style={{ width: '28.5%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>کاربرد</th><th>نام کالا</th><th>کد کالا</th><th>اندازه (میلیمتر)</th><th>سطح مقطع</th><th>مترطول (تومان)</th><th>مترمربع (تومان)</th><th>توضیحات بیشتر</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.flatMap(g => g.rows.map((r, i) => (
                <tr key={r.id}>
                  {i === 0 && (
                    <td rowSpan={g.rows.length} className="os-group">
                      <div className="os-vert"><b>{GROUP_LABEL[g.group].en}</b><span>{GROUP_LABEL[g.group].fa}</span></div>
                    </td>
                  )}
                  <td className="os-name">{r.name}</td>
                  <td className="os-code">{r.code}</td>
                  <td className="os-size">{r.size}</td>
                  <td className="os-shape">
                    {r.cover ? (
                      <div className="os-shapebox"><div className="os-pic-cell"><Pic code={r.code} /></div><Cover v={r.cover} /></div>
                    ) : (
                      <div className="os-shapebox os-solo"><Pic code={r.code} /></div>
                    )}
                  </td>
                  <td className="os-n">{num(r.perMeter) || ''}</td>
                  <td className="os-n">{num(r.perSqm)}</td>
                  <td className="os-desc">{r.description}</td>
                </tr>
              )))}
            </tbody>
          </table>
          <ul className="os-notes">
            {data.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </section>

      <section className="os-page os-p2">
        <table className="os-table os-acc">
          <colgroup>
            <col style={{ width: '6.5%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /><col style={{ width: '10%' }} /><col style={{ width: '33%' }} /><col style={{ width: '10.5%' }} />
          </colgroup>
          <thead>
            <tr className="os-acc-head">
              <th>OBJECT</th><th>NAME OBJECT</th><th>CODE OBJECT</th><th>SHAPE OBJECT</th><th>SPECIAL FOR</th><th>PRICES (T)</th>
            </tr>
          </thead>
          <tbody>
            {data.accessories.flatMap(g => g.rows.map((a, i) => (
              <tr key={a.id}>
                {i === 0 && (
                  <td rowSpan={g.rows.length} className="os-group">
                    <div className="os-vert"><b>{ACCESSORY_GROUP_LABEL[g.group].en}</b>{ACCESSORY_GROUP_LABEL[g.group].fa && <span>{ACCESSORY_GROUP_LABEL[g.group].fa}</span>}</div>
                  </td>
                )}
                <td className="os-name os-ltr">{a.name}</td>
                <td className="os-code">{a.code}</td>
                <td className="os-shape">{a.shape ? <Pic code={a.shape} /> : a.shapeText ? <b>{a.shapeText}</b> : null}</td>
                <td className="os-desc os-special">{a.specialFor}</td>
                <td className="os-n">{a.price == null ? <span className="os-call">تماس بگیرید</span> : num(a.price)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </section>
    </div>,
    document.body,
  )
}
