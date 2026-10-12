import { useCallback, useEffect, useState } from 'react'
import type { Role } from '../api'
import { toJalaliDate, type Catalog } from '../core'
import { auditLabel, auditLines } from '../auditText'
import { rpc } from '../backends/supabase'

const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }
interface Row { id: string; email: string; role: Role; created_at: string }
interface AuditRow { at: string; username: string; action: string; detail: string }

/** Accounts are created in the Supabase dashboard; here the admin only assigns roles. */
export function SupabaseUsers({ catalog }: { catalog?: Catalog }) {
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
        <div className="tablewrap scroll-box">
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
      </div>
      <div className="card">
        <h2>گزارش تغییرات (۲۰۰ مورد آخر)</h2>
        <div className="tablewrap scroll-box">
          <table>
            <thead><tr><th>زمان</th><th>کاربر</th><th>چه کاری</th><th>جزئیات</th></tr></thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{toJalaliDate(a.at)} {new Date(a.at).toLocaleTimeString('fa-IR')}</td>
                  <td>{a.username}</td><td>{auditLabel(a.action)}</td>
                  <td className="audit-detail">{auditLines(a.action, a.detail, catalog).map((l, k) => <div key={k}>{l}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
