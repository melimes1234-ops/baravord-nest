import { useState } from 'react'

export function Login({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main style={{ maxWidth: 380, marginTop: 60 }}>
      <form
        className="card"
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          try { await onLogin(u.trim(), p) } catch (x) { setErr((x as Error).message) }
          setBusy(false)
        }}
      >
        <h2>ورود به سیستم برآورد قیمت</h2>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>نام کاربری<input value={u} onChange={e => setU(e.target.value)} autoComplete="username" autoFocus /></label>
          <label>رمز عبور<input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /></label>
        </div>
        {err && <div className="alert err">{err}</div>}
        <button className="btn" disabled={busy || !u || !p}>ورود</button>
      </form>
    </main>
  )
}
