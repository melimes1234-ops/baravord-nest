import { useRef, useState } from 'react'
import { toFa, toJalaliDate, todayIso, validateCatalog, type Catalog } from '../core'
import type { AppState, Update } from '../store'

const LAST = 'wpc-last-backup'
const lastBackup = (): string | null => {
  try { return localStorage.getItem(LAST) } catch { return null }
}

interface BackupFile {
  app: 'wpc-nest'
  format: 1
  createdAt: string
  by: string
  catalog: Catalog
  movements: AppState['movements']
  batches: AppState['batches']
  goods: AppState['goods']
}

/** Saves everything the app holds as one file on this device. */
export function downloadBackup(state: AppState, by: string): string {
  const file: BackupFile = { app: 'wpc-nest', format: 1, createdAt: new Date().toISOString(), by, catalog: state.catalog, movements: state.movements, batches: state.batches, goods: state.goods }
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' })
  const iso = todayIso()
  const name = `wpc-backup-${toJalaliDate(iso).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\//g, '-')}-${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  try { localStorage.setItem(LAST, new Date().toISOString()) } catch { /* storage blocked */ }
  return name
}

function readFile(file: File): Promise<BackupFile> {
  return file.text().then(text => {
    const data = JSON.parse(text) as Partial<BackupFile>
    const c = data.catalog
    if (data.app !== 'wpc-nest' || !c || typeof c !== 'object' || !c.materials || !c.recipes || !c.products || !c.colors || !c.config || !Array.isArray(c.tariffs)) {
      throw new Error('این فایل پشتیبانِ همین برنامه نیست یا خراب است.')
    }
    return data as BackupFile
  })
}

export function Backup({ state, update, user }: { state: AppState; update: Update; user: string }) {
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<BackupFile | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const last = lastBackup()
  const { catalog } = state

  const save = () => {
    const name = downloadBackup(state, user)
    setDone(`فایل پشتیبان ساخته شد: ${name}. آن را جای امنی نگه دارید (گوشی‌تان، ایمیل یا حافظه‌ی دیگر).`)
    setError('')
  }

  const choose = async (f: File | undefined) => {
    setError(''); setDone(''); setPicked(null)
    if (!f) return
    try { setPicked(await readFile(f)) } catch (e) { setError(e instanceof SyntaxError ? 'این فایل خوانده نشد؛ مطمئن شوید فایل پشتیبان است.' : (e as Error).message) }
  }

  const restore = () => {
    if (!picked) return
    downloadBackup(state, user) // keep what is there now, in case the old file turns out to be the wrong one
    update(s => { s.catalog = picked.catalog })
    setDone('قیمت‌ها، فرمول‌ها، محصولات و هزینه‌ها از فایل برگردانده شد. پیش از این، از وضعیت قبلی هم یک فایل پشتیبان دانلود شد.')
    setPicked(null)
    if (input.current) input.current.value = ''
  }

  const n = (o: object) => toFa(Object.keys(o).length)
  return (
    <>
      <div className="card">
        <h2>پشتیبان‌گیری</h2>
        <p className="muted help">یک نسخه از همه‌ی اطلاعات (قیمت‌ها، فرمول‌ها، محصولات، هزینه‌ها، انبار، پارت‌ها و محصول ساخته‌شده) روی دستگاه خودتان ذخیره می‌شود. قبل از هر تغییر بزرگ یک بار پشتیبان بگیرید تا اگر چیزی خراب شد، برگردد.</p>
        {done && <div className="alert ok" onClick={() => setDone('')}>{done}</div>}
        {error && <div className="alert err">{error}</div>}
        <div className="row" style={{ marginBottom: 6 }}>
          <button className="btn big" onClick={save}>دانلود فایل پشتیبان</button>
        </div>
        <p className="muted">{last ? `آخرین پشتیبانی که از همین دستگاه گرفته‌اید: ${toJalaliDate(last.slice(0, 10))}` : 'هنوز از این دستگاه پشتیبان نگرفته‌اید.'}</p>
        <ul className="muted" style={{ lineHeight: 1.9, marginTop: 4 }}>
          <li>الان در برنامه: {n(catalog.materials)} ماده، {n(catalog.recipes)} فرمول، {n(catalog.products)} محصول، {toFa(state.movements.length)} ثبت انبار، {toFa(state.batches.length)} پارت و {toFa(state.goods.length)} ثبت محصول ساخته‌شده.</li>
        </ul>
      </div>

      <div className="card">
        <h2>برگرداندن از فایل پشتیبان</h2>
        <p className="muted help">با این کار <b>قیمت‌ها، فرمول‌ها، رنگ‌ها، محصولات، هزینه‌ها و تعرفه‌ها</b> دقیقاً مثل فایل می‌شود. ثبت‌های انبار، پارت‌ها و محصول ساخته‌شده با این کار عوض نمی‌شود (آن‌ها در فایل برای نگهداری هست). قبل از برگرداندن، خودکار از وضعیت فعلی هم یک فایل پشتیبان دانلود می‌شود.</p>
        <div className="row">
          <input ref={input} type="file" accept=".json,application/json" onChange={e => void choose(e.target.files?.[0])} />
        </div>
        {picked && (
          <div className="alert">
            <b>فایل خوانده شد.</b> ساخته‌شده در {toJalaliDate(picked.createdAt.slice(0, 10))}: {n(picked.catalog.materials)} ماده، {n(picked.catalog.recipes)} فرمول، {n(picked.catalog.products)} محصول.
            {validateCatalog(picked.catalog).length > 0 && <> (در این اطلاعات {toFa(validateCatalog(picked.catalog).length)} مورد ناقص هست.)</>}
            <div className="row" style={{ marginTop: 8, marginBottom: 0 }}>
              <button className="btn danger" onClick={restore}>بله، قیمت‌ها و فرمول‌ها را از این فایل برگردان</button>
              <button className="btn ghost" onClick={() => { setPicked(null); if (input.current) input.current.value = '' }}>انصراف</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
