import { useState } from 'react'
import { toFa, validateCatalog } from './core'
import type { Role } from './api'
import { backend } from './backends'
import { supabase } from './backends/supabase'
import { Login } from './Login'
import { DEMO, useDemoSession } from './demo'
import { applyTheme, initialTheme, type Theme } from './theme'
import { useSession } from './store'
import { Batches } from './tabs/Batches'
import { Costs } from './tabs/Costs'
import { Guide, guideHidden } from './tabs/Guide'
import { Issues } from './tabs/Issues'
import { Materials } from './tabs/Materials'
import { PriceList } from './tabs/PriceList'
import { Products } from './tabs/Products'
import { Recipes } from './tabs/Recipes'
import { Stock } from './tabs/Stock'
import { SupabaseUsers } from './tabs/SupabaseUsers'
import { Users } from './tabs/Users'

const ALL = ['شروع کار', 'لیست قیمت', 'مواد', 'فرمول‌ها', 'محصولات', 'هزینه‌ها', 'پارت تولید', 'انبار', 'هشدارها', 'کاربران'] as const
type Tab = (typeof ALL)[number]

const TAB_KEY: Record<Tab, string> = {
  'شروع کار': 'guide', 'لیست قیمت': 'prices', 'مواد': 'materials', 'فرمول‌ها': 'recipes', 'محصولات': 'products',
  'هزینه‌ها': 'costs', 'پارت تولید': 'batches', 'انبار': 'stock', 'هشدارها': 'issues', 'کاربران': 'users',
}

const ALLOWED: Record<Role, readonly Tab[]> = {
  admin: ALL,
  operator: ['شروع کار', 'لیست قیمت', 'پارت تولید', 'انبار', 'هشدارها'],
  viewer: ['شروع کار', 'لیست قیمت', 'انبار', 'هشدارها'],
}
const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }

const useSessionImpl = DEMO ? useDemoSession : useSession

export default function App() {
  const impl = useSessionImpl()
  const { session, error, clearError, login, logout, update } = impl
  const [confirmReset, setConfirmReset] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }
  const [tab, setTab] = useState<Tab>(() => (guideHidden() ? 'لیست قیمت' : 'شروع کار'))

  if (session.status === 'loading') return <main><p className="muted">در حال بارگذاری…</p>{error && <div className="alert err">{error}</div>}</main>
  if (session.status === 'anonymous') return <Login onLogin={login} />

  const { user, state } = session
  const { catalog } = state
  const tabs = DEMO ? ALLOWED.admin.filter(t => t !== 'کاربران') : ALLOWED[user.role]
  const current = tabs.includes(tab) ? tab : tabs[0]
  const issueCount = validateCatalog(catalog).length
  // Read-only roles get the edit handler removed so a stray click cannot be sent.
  const canEdit = user.role !== 'viewer'

  return (
    <>
      <header>
        <h1>برآورد قیمت و کنترل تولید WPC</h1>
        <span className="who">{user.username} ({ROLE_LABEL[user.role]})</span>
        <button className="btn ghost" onClick={toggleTheme}>
          {theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}
        </button>
        {DEMO ? (
          <button
            className="btn ghost"
           
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true)
              ;(impl as ReturnType<typeof useDemoSession>).reset()
              setConfirmReset(false)
            }}
          >
            {confirmReset ? 'مطمئنید؟ دوباره بزنید' : 'بازنشانی داده‌ها'}
          </button>
        ) : (
          <>
            {backend.kind === 'supabase' && (
              <button
                className="btn ghost"
               
                onClick={async () => {
                  const p = prompt('رمز عبور جدید (حداقل ۸ نویسه):')
                  if (!p) return
                  const { error: e } = await supabase().auth.updateUser({ password: p })
                  alert(e ? e.message : 'رمز عبور تغییر کرد.')
                }}
              >
                تغییر رمز من
              </button>
            )}
            <button className="btn ghost" onClick={() => void logout()}>خروج</button>
          </>
        )}
      </header>
      <nav>
        {tabs.map(t => (
          <button key={t} className={t === current ? 'on' : ''} style={{ ['--tab' as string]: `var(--c-${TAB_KEY[t]})` }} onClick={() => setTab(t)}>
            {t}{t === 'هشدارها' && issueCount > 0 ? ` (${toFa(issueCount)})` : ''}
          </button>
        ))}
      </nav>
      <main data-tab={TAB_KEY[current]}>
        {DEMO && <div className="alert">نسخه نمایشی: بدون سرور و بدون ورود کاربران. داده‌ها فقط در همین مرورگر می‌مانند و با کسی به اشتراک گذاشته نمی‌شوند.</div>}
        {error && <div className="alert err" onClick={clearError}>{error} (برای بستن بزنید)</div>}
        {current === 'شروع کار' && <Guide catalog={catalog} movements={state.movements} batches={state.batches} role={DEMO ? 'admin' : user.role} demo={DEMO} go={t => setTab(t as Tab)} />}
        {current === 'لیست قیمت' && <PriceList catalog={catalog} onEditTariffs={user.role === 'admin' || DEMO ? () => setTab('هزینه‌ها') : undefined} />}
        {current === 'مواد' && <Materials catalog={catalog} update={update} />}
        {current === 'فرمول‌ها' && <Recipes catalog={catalog} update={update} />}
        {current === 'محصولات' && <Products catalog={catalog} update={update} />}
        {current === 'هزینه‌ها' && <Costs catalog={catalog} update={update} />}
        {current === 'پارت تولید' && canEdit && <Batches state={state} update={update} />}
        {current === 'انبار' && <Stock catalog={catalog} movements={state.movements} update={update} readOnly={!canEdit} />}
        {current === 'هشدارها' && <Issues catalog={catalog} />}
        {current === 'کاربران' && (backend.kind === 'supabase' ? <SupabaseUsers /> : <Users me={user} />)}
      </main>
    </>
  )
}
