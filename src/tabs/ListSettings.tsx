import { ACCESSORY_GROUP_LABEL, ACCESSORY_GROUP_ORDER, GROUP_LABEL, GROUP_ORDER, seedCatalog, type AccessoryGroup, type Catalog, type PriceListSettings, type ProductGroup } from '../core'
import type { Update } from '../store'
import { InfoTip, NumInput, TextInput } from '../ui'

/** Everything the printed price list needs that is not calculated: title, colour, notes, accessories and each product's printed details. */
export function ListSettings({ catalog, update }: { catalog: Catalog; update: Update }) {
  const list = catalog.priceList ?? seedCatalog().priceList!
  // changes always start from the saved settings (or the starting ones when the catalog has none yet)
  const edit = (fn: (l: PriceListSettings) => void) => update(s => {
    s.catalog.priceList ??= structuredClone(seedCatalog().priceList!)
    fn(s.catalog.priceList)
  })
  const colors = Object.values(catalog.colors)
  const products = Object.values(catalog.products)

  return (
    <>
      <div className="card">
        <h2>لیست قیمت چاپی (PDF): عنوان، تبصره‌ها و قیمت پایه <InfoTip>
          <p>این‌ها در PDF «لیست قیمت» (طرح رسمی شرکت) چاپ می‌شود. هر چه اینجا عوض کنید، PDF بعدی همان را دارد.</p>
          <p><b>رنگ قیمت:</b> لیست رسمی رنگ ندارد و برای هر محصول یک قیمت چاپ می‌کند. قیمت همین رنگ چاپ می‌شود، بی‌آنکه اسم رنگ نوشته شود.</p>
          <p><b>رُند کردن:</b> قیمت هر متر به نزدیک‌ترین «رُند متر» و قیمت متر مربع به نزدیک‌ترین «رُند متر مربع» می‌رسد.</p>
        </InfoTip></h2>
        <div className="row">
          <label style={{ flex: '1 1 280px' }}>عنوان بالای لیست<input value={list.title} onChange={e => edit(l => { l.title = e.target.value })} style={{ direction: 'ltr' }} /></label>
          <label>قیمت کدام رنگ چاپ شود
            <select value={list.colorId} onChange={e => edit(l => { l.colorId = e.target.value })}>
              {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>رُند متر<NumInput unit="تومان" money value={list.roundTo} onChange={v => edit(l => { l.roundTo = v && v > 0 ? v : 1 })} /></label>
          <label>رُند متر مربع<NumInput unit="تومان" money value={list.sqmRoundTo} onChange={v => edit(l => { l.sqmRoundTo = v && v > 0 ? v : 1 })} /></label>
        </div>
        <span className="field-label">تبصره‌ها (پایین صفحه‌ی اول)</span>
        <div className="tablewrap">
          <table>
            <tbody>
              {list.notes.map((n, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'normal', width: '100%' }}><TextInput value={n} onChange={v => edit(l => { l.notes[i] = v })} /></td>
                  <td><button className="btn danger" onClick={() => edit(l => { l.notes.splice(i, 1) })}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => edit(l => { l.notes.push('تبصره‌ی جدید') })}>＋ افزودن تبصره</button>
      </div>

      <div className="card">
        <h2>لوازم جانبی لیست قیمت (کلیپس، پیچ، …)</h2>
        <p className="muted help">این‌ها صفحه‌ی دوم PDF هستند. قیمتشان ثابت است و از فرمول نمی‌آید. قیمت خالی یعنی در لیست «تماس بگیرید» چاپ می‌شود. عکس هر کدام (اگر داشته باشد) از لیست رسمی آمده.</p>
        <div className="tablewrap scroll-box">
          <table>
            <thead className="sticky-head"><tr><th>گروه</th><th>نام</th><th>کد</th><th>مناسب برای</th><th className="n">قیمت (تومان)</th><th /></tr></thead>
            <tbody>
              {list.accessories.map((a, i) => (
                <tr key={a.id}>
                  <td>
                    <select value={a.group} onChange={e => edit(l => { l.accessories[i].group = e.target.value as AccessoryGroup })}>
                      {ACCESSORY_GROUP_ORDER.map(g => <option key={g} value={g}>{ACCESSORY_GROUP_LABEL[g].fa || ACCESSORY_GROUP_LABEL[g].en}</option>)}
                    </select>
                  </td>
                  <td><TextInput ltr width={150} value={a.name} onChange={v => edit(l => { l.accessories[i].name = v })} /></td>
                  <td><TextInput ltr width={170} value={a.code} onChange={v => edit(l => { l.accessories[i].code = v })} /></td>
                  <td style={{ whiteSpace: 'normal', minWidth: 220 }}><TextInput value={a.specialFor} onChange={v => edit(l => { l.accessories[i].specialFor = v })} /></td>
                  <td className="n"><NumInput unit="تومان" money value={a.price} placeholder="تماس بگیرید" onChange={v => edit(l => { l.accessories[i].price = v })} /></td>
                  <td><button className="btn danger" onClick={() => edit(l => { l.accessories.splice(i, 1) })}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => edit(l => { l.accessories.push({ id: `a-${Date.now().toString(36)}`, group: 'clips', name: '', code: '', specialFor: '', price: null }) })}>＋ افزودن ردیف</button>
      </div>

      <div className="card">
        <h2>اطلاعات چاپی هر محصول</h2>
        <p className="muted help">گروه (ستون «کاربرد»)، توضیحات بیشتر، اینکه قیمت متر مربع هم چاپ شود یا نه، و عدد کنار نقشه‌ی مقطع (چند متر از این پروفایل یک متر مربع را می‌پوشاند؛ خالی یعنی ۱۰۰۰ ÷ پهنا).</p>
        <div className="tablewrap scroll-box">
          <table>
            <thead className="sticky-head"><tr><th>محصول</th><th>گروه</th><th>توضیحات بیشتر</th><th>قیمت متر مربع</th><th className="n">عدد کنار نقشه</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><b>{p.name}</b> <span className="muted">{p.code}</span></td>
                  <td>
                    <select value={p.group ?? ''} onChange={e => update(s => { const pr = s.catalog.products[p.id]; if (e.target.value) pr.group = e.target.value as ProductGroup; else delete pr.group })}>
                      <option value="">بدون گروه</option>
                      {GROUP_ORDER.filter(g => g !== 'other').map(g => <option key={g} value={g}>{GROUP_LABEL[g].fa}</option>)}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'normal', minWidth: 240 }}><TextInput value={p.description ?? ''} onChange={v => update(s => { s.catalog.products[p.id].description = v })} /></td>
                  <td><label className="check"><input type="checkbox" checked={!!p.showSqm} onChange={e => update(s => { s.catalog.products[p.id].showSqm = e.target.checked })} style={{ minWidth: 0 }} /> چاپ شود</label></td>
                  <td className="n"><NumInput value={p.coverPerM2 ?? null} decimals={4} placeholder={p.widthMm ? String(Math.round(10_000_000 / p.widthMm) / 10_000) : '—'} onChange={v => update(s => { const pr = s.catalog.products[p.id]; if (v == null) delete pr.coverPerM2; else pr.coverPerM2 = v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
