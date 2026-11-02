import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import type { Catalog } from '../core'
import { InfoTip } from '../ui'

interface SiteView { enabled: boolean; key: string; tariffId: string }

/** Hands the printed-list prices to the company website (WordPress). Only the server version has it. */
export function SiteSync({ catalog }: { catalog: Catalog }) {
  const [v, setV] = useState<SiteView | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    api<SiteView>('GET', '/api/site-sync').then(setV).catch(e => setErr(e instanceof ApiError ? e.message : 'خطا'))
  }, [])
  const send = async (body: { action?: 'enable' | 'regenerate' | 'disable'; tariffId?: string }) => {
    setErr('')
    try { setV(await api<SiteView>('PUT', '/api/site-sync', body)) } catch (e) { setErr(e instanceof ApiError ? e.message : 'خطا') }
  }
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500) } catch { setErr('کپی نشد؛ متن را دستی انتخاب کنید') }
  }
  return (
    <div className="card">
      <h2>اتصال به سایت وردپرس <InfoTip>
        <p>سایت شرکت، قیمت‌ها را خودش از اینجا می‌خواند (افزونه‌ی «همگام‌سازی قیمت نست»). فقط <b>همان قیمت‌های لیست چاپی</b> داده می‌شود: یک قیمت برای هر محصول، بدون تفکیک رنگ، نقدی. قیمت تمام‌شده، سود، فرمول و انبار هرگز بیرون نمی‌رود.</p>
        <p>هر وقت قیمتی را اینجا عوض کنی، سایت ظرف حداکثر یک ساعت (یا با دکمه‌ی «همگام‌سازی» در پنل وردپرس، همان لحظه) عوض می‌شود.</p>
      </InfoTip></h2>
      {err && <div className="alert err">{err}</div>}
      {!v ? <p className="muted">در حال بارگذاری…</p> : !v.enabled ? (
        <>
          <p className="muted help">فعلاً خاموش است و هیچ قیمتی بیرون داده نمی‌شود.</p>
          <button className="btn" onClick={() => send({ action: 'enable' })}>فعال کردن اتصال</button>
        </>
      ) : (
        <>
          <label>قیمت کدام تعرفه به سایت برود
            <select value={v.tariffId} onChange={e => send({ tariffId: e.target.value })}>
              {catalog.tariffs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <p className="muted help">برای سایت معمولاً تعرفه‌ی «اصلی» (قیمت رسمی لیست) درست است.</p>
          <span className="field-label">این دو را در پنل وردپرس (تنظیمات ← همگام‌سازی قیمت نست) بنویس</span>
          <div className="tablewrap">
            <table>
              <tbody>
                <tr>
                  <td>آدرس برنامه</td>
                  <td style={{ direction: 'ltr', textAlign: 'left' }}><code>{url}</code></td>
                  <td><button className="btn ghost" onClick={() => copy('url', url)}>{copied === 'url' ? 'کپی شد' : 'کپی'}</button></td>
                </tr>
                <tr>
                  <td>کلید مخفی</td>
                  <td style={{ direction: 'ltr', textAlign: 'left', wordBreak: 'break-all' }}><code>{v.key}</code></td>
                  <td><button className="btn ghost" onClick={() => copy('key', v.key)}>{copied === 'key' ? 'کپی شد' : 'کپی'}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => { if (confirm('کلید جدید ساخته می‌شود و کلید قبلی از کار می‌افتد. باید کلید جدید را در وردپرس بنویسی. ادامه؟')) void send({ action: 'regenerate' }) }}>ساختن کلید جدید</button>
            <button className="btn danger" onClick={() => { if (confirm('اتصال خاموش شود؟ سایت دیگر قیمت جدید نمی‌گیرد و قیمت‌های فعلی‌اش می‌ماند.')) void send({ action: 'disable' }) }}>خاموش کردن اتصال</button>
          </div>
        </>
      )}
    </div>
  )
}
