import { useCallback, useEffect, useState } from 'react'
import type { Role } from '../api'
import { toJalaliDate } from '../core'
import { rpc } from '../backends/supabase'

const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }
interface Row { id: string; email: string; role: Role; created_at: string }
interface AuditRow { at: string; username: string; action: string; detail: string }

/** Accounts are created in the Supabase dashboard; here the admin only assigns roles. */
export function SupabaseUsers() {
  const [users, setUsers] = useState<Row[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      setUsers(await rpc<Row[]>('list_users'))
      setAudit(await rpc<AuditRow[]>('audit_log'))
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const setRole = async (id: string, role: string) => {
    try { await rpc('set_role', { p_user: id, p_role: role }); setErr('') } catch (e) { setErr((e as Error).message) }
    await load()
  }

  return (
    <>
      <div className="card">
        <h2>کاربران و نقش‌ها</h2>
        {err && <div className="alert err">{err}</div>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>ایمیل</th><th>نقش</th><th>ساخته‌شده</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{u.email}</td>
                  <td>
                    <select value={u.role} onChange={e => void setRole(u.id, e.target.value)}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>{toJalaliDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          برای کاربر جدید: در Supabase بروید به Authentication ← Users ← Add user و ایمیل و رمز بدهید (گزینه Auto Confirm User را بزنید).
          کاربر جدید «مشاهده‌گر» شروع می‌کند و اینجا نقشش را عوض می‌کنید. حذف کاربر یا رمز فراموش‌شده هم از همان صفحه Supabase انجام می‌شود.
        </p>
      </div>
      <div className="card">
        <h2>گزارش تغییرات (۲۰۰ مورد آخر)</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>زمان</th><th>کاربر</th><th>عمل</th><th>جزئیات</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{toJalaliDate(a.at)} {new Date(a.at).toLocaleTimeString('fa-IR')}</td>
                  <td>{a.username}</td><td>{a.action}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
