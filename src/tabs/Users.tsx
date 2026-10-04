import { useCallback, useEffect, useState } from 'react'
import { api, type Role, type User } from '../api'
import { toJalaliDate } from '../core'

const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }
interface Row extends User { created_at: string }
interface AuditRow { at: string; username: string; action: string; detail: string }

export function Users({ me }: { me: User }) {
  const [users, setUsers] = useState<Row[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [err, setErr] = useState('')
  const [f, setF] = useState({ username: '', password: '', role: 'operator' as Role })

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: Row[] }>('GET', '/api/users')).users)
      setAudit((await api<{ rows: AuditRow[] }>('GET', '/api/audit')).rows)
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setErr(''); await load() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <div className="card">
        <h2>کاربران</h2>
        {err && <div className="alert err">{err}</div>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>نام کاربری</th><th>نقش</th><th>ساخته‌شده</th><th /></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}{u.id === me.id && ' (شما)'}</td>
                  <td>
                    <select value={u.role} onChange={e => run(() => api('PATCH', `/api/users/${u.id}`, { role: e.target.value }))}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>{toJalaliDate(u.created_at)}</td>
                  <td>
                    <button className="btn ghost" onClick={() => {
                      const p = prompt(`رمز عبور جدید برای ${u.username} (حداقل ۸ نویسه):`)
                      if (p) void run(() => api('PATCH', `/api/users/${u.id}`, { password: p }))
                    }}>تغییر رمز</button>{' '}
                    <button className="btn danger" disabled={u.id === me.id} onClick={() => confirm(`کاربر ${u.username} حذف شود؟`) && run(() => api('DELETE', `/api/users/${u.id}`))}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>کاربر جدید</h2>
        <div className="row">
          <label>نام کاربری<input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></label>
          <label>رمز عبور (حداقل ۸ نویسه)<input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></label>
          <label>نقش<select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
          <button className="btn" onClick={() => run(async () => { await api('POST', '/api/users', f); setF({ username: '', password: '', role: 'operator' }) })}>افزودن</button>
        </div>
        <p className="muted">ادمین: همه چیز. اپراتور: ثبت پارت، خرید و ضایعات. مشاهده‌گر: فقط دیدن لیست قیمت و گزارش‌ها.</p>
      </div>
      <div className="card">
        <h2>گزارش تغییرات (۲۰۰ مورد آخر)</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>زمان</th><th>کاربر</th><th>عمل</th><th>جزئیات</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}><td>{toJalaliDate(a.at)} {new Date(a.at).toLocaleTimeString('fa-IR')}</td><td>{a.username}</td><td>{a.action}</td><td style={{ whiteSpace: 'normal', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
