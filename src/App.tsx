import { useState } from 'react'
import { toFa, validateCatalog } from './core'
import type { Role } from './api'
import { Login } from './Login'
import { useSession } from './store'
import { Batches } from './tabs/Batches'
import { Costs } from './tabs/Costs'
import { Issues } from './tabs/Issues'
import { Materials } from './tabs/Materials'
import { PriceList } from './tabs/PriceList'
import { Products } from './tabs/Products'
import { Recipes } from './tabs/Recipes'
import { Stock } from './tabs/Stock'
import { Users } from './tabs/Users'

const ALL = ['لیست قیمت', 'مواد', 'فرمول‌ها', 'محصولات', 'هزینه‌ها', 'پارت تولید', 'انبار', 'هشدارها', 'کاربران'] as const
type Tab = (typeof ALL)[number]

const ALLOWED: Record<Role, readonly Tab[]> = {
  admin: ALL,
  operator: ['لیست قیمت', 'پارت تولید', 'انبار', 'هشدارها'],
  viewer: ['لیست قیمت', 'انبار', 'هشدارها'],
}
const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }

export default function App() {
  const { session, error, clearError, login, logout, update } = useSession()
  const [tab, setTab] = useState<Tab>('لیست قیمت')

  if (session.status === 'loading') return <main><p className="muted">در حال بارگذاری…</p>{error && <div className="alert err">{error}</div>}</main>
  if (session.status === 'anonymous') return <Login onLogin={login} />

  const { user, state } = session
  const { catalog } = state
  const tabs = ALLOWED[user.role]
  const current = tabs.includes(tab) ? tab : tabs[0]
  const issueCount = validateCatalog(catalog).length
  // Read-only roles get the edit handler removed so a stray click cannot be sent.
  const canEdit = user.role !== 'viewer'

  return (
    <>
      <header>
        <h1>برآورد قیمت و کنترل تولید WPC</h1>
        <span className="muted" style={{ color: 'inherit' }}>{user.username} ({ROLE_LABEL[user.role]})</span>
        <button className="btn ghost" style={{ color: 'inherit', borderColor: 'currentColor' }} onClick={() => void logout()}>خروج</button>
      </header>
      <nav>
        {tabs.map(t => (
          <button key={t} className={t === current ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{t === 'هشدارها' && issueCount > 0 ? ` (${toFa(issueCount)})` : ''}
          </button>
        ))}
      </nav>
      <main>
        {error && <div className="alert err" onClick={clearError}>{error} (برای بستن بزنید)</div>}
        {current === 'لیست قیمت' && <PriceList catalog={catalog} />}
        {current === 'مواد' && <Materials catalog={catalog} update={update} />}
        {current === 'فرمول‌ها' && <Recipes catalog={catalog} update={update} />}
        {current === 'محصولات' && <Products catalog={catalog} update={update} />}
        {current === 'هزینه‌ها' && <Costs catalog={catalog} update={update} />}
        {current === 'پارت تولید' && canEdit && <Batches state={state} update={update} />}
        {current === 'انبار' && <Stock catalog={catalog} movements={state.movements} update={update} readOnly={!canEdit} />}
        {current === 'هشدارها' && <Issues catalog={catalog} />}
        {current === 'کاربران' && <Users me={user} />}
      </main>
    </>
  )
}
