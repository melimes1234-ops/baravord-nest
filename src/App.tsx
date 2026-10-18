import { useEffect, useLayoutEffect, useState } from 'react'
import { SEED_VERSION, seedCatalog, toFa, validateCatalog } from './core'
import type { Role } from './api'
import { backend } from './backends'
import { supabase } from './backends/supabase'
import { Login } from './Login'
import { BottomBar, Drawer } from './MobileNav'
import { DEMO, useDemoSession } from './demo'
import { applyTheme, initialTheme, type Theme } from './theme'
import { useSession } from './store'
import { Backup, downloadBackup } from './tabs/Backup'
import { Batches } from './tabs/Batches'
import { Calc } from './tabs/Calc'
import { Costs } from './tabs/Costs'
import { Goods } from './tabs/Goods'
import { Guide, guideHidden } from './tabs/Guide'
import { Issues } from './tabs/Issues'
import { Materials } from './tabs/Materials'
import { PriceList } from './tabs/PriceList'
import { Products } from './tabs/Products'
import { Recipes } from './tabs/Recipes'
import { Stock } from './tabs/Stock'
import { SupabaseUsers } from './tabs/SupabaseUsers'
import { Users } from './tabs/Users'

const ALL = ['شروع کار', 'لیست قیمت', 'محاسبات', 'مواد', 'فرمول‌ها', 'محصولات', 'هزینه‌ها', 'پارت تولید', 'محصول ساخته‌شده', 'انبار', 'هشدارها', 'پشتیبان‌گیری', 'کاربران'] as const
type Tab = (typeof ALL)[number]

const TAB_KEY: Record<Tab, string> = {
  'شروع کار': 'guide', 'لیست قیمت': 'prices', 'محاسبات': 'calc', 'مواد': 'materials', 'فرمول‌ها': 'recipes', 'محصولات': 'products',
  'هزینه‌ها': 'costs', 'پارت تولید': 'batches', 'محصول ساخته‌شده': 'goods', 'انبار': 'stock', 'هشدارها': 'issues', 'پشتیبان‌گیری': 'backup', 'کاربران': 'users',
}

const ALLOWED: Record<Role, readonly Tab[]> = {
  admin: ALL,
  operator: ['شروع کار', 'لیست قیمت', 'پارت تولید', 'محصول ساخته‌شده', 'انبار', 'هشدارها'],
  viewer: ['شروع کار', 'لیست قیمت', 'محصول ساخته‌شده', 'انبار', 'هشدارها'],
}
const ROLE_LABEL: Record<Role, string> = { admin: 'ادمین', operator: 'اپراتور', viewer: 'مشاهده‌گر' }

const KEY_TO_TAB = Object.fromEntries(Object.entries(TAB_KEY).map(([t, k]) => [k, t])) as Record<string, Tab>
const TAB_STORE = 'wpc-tab'

/** The section to open: the one in the address (#/prices), else the one used last, else null. */
function savedTab(): Tab | null {
  const hash = KEY_TO_TAB[location.hash.replace(/^#\/?/, '')]
  if (hash) return hash
  try {
    const stored = localStorage.getItem(TAB_STORE)
    if (stored && KEY_TO_TAB[stored]) return KEY_TO_TAB[stored]
  } catch {
    // storage blocked: just start at the default
  }
  return null
}

const useSessionImpl = DEMO ? useDemoSession : useSession

export default function App() {
  const impl = useSessionImpl()
  const { session, error, clearError, login, logout, update } = impl
  const [confirmReset, setConfirmReset] = useState(false)
  // The top menu is sticky; table headers that stick under it need its real height.
  useLayoutEffect(() => {
    const set = () => {
      // the sticky bar the table headers hang under: the tab strip on a computer, the header on a phone
      const nav = document.querySelector<HTMLElement>('nav:not(.bottombar)')
      const bar = nav && nav.offsetParent !== null ? nav : document.querySelector('header')
      if (bar) document.documentElement.style.setProperty('--nav-h', `${bar.getBoundingClientRect().height}px`)
    }
    set()
    window.addEventListener('resize', set)
    return () => window.removeEventListener('resize', set)
  })
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }
  const [tab, setTabState] = useState<Tab>(() => savedTab() ?? (guideHidden() ? 'لیست قیمت' : 'شروع کار'))
  const [menuOpen, setMenuOpen] = useState(false)
  const [sureSeed, setSureSeed] = useState(false)
  const [seedDone, setSeedDone] = useState('')
  // Remember the section: a refresh, a save or logging in again brings the person back to it, and the phone's back button steps through sections.
  const setTab = (t: Tab) => {
    setTabState(t)
    try { localStorage.setItem(TAB_STORE, TAB_KEY[t]) } catch { /* storage blocked */ }
    if (location.hash !== `#/${TAB_KEY[t]}`) history.pushState(null, '', `#/${TAB_KEY[t]}`)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    const onHash = () => { const t = KEY_TO_TAB[location.hash.replace(/^#\/?/, '')]; if (t) setTabState(t) }
    window.addEventListener('popstate', onHash)
    return () => window.removeEventListener('popstate', onHash)
  }, [])

  if (session.status === 'loading') {
    return (
      <main>
        {error ? (
          <div className="card">
            <h2>برنامه باز نشد</h2>
            <div className="alert err">{error}</div>
            <div className="row" style={{ marginBottom: 0 }}>
              <button className="btn" onClick={() => { clearError(); void impl.refresh() }}>تلاش دوباره</button>
              <button className="btn ghost" onClick={() => void logout()}>خروج و ورود دوباره</button>
            </div>
          </div>
        ) : <p className="muted">در حال بارگذاری…</p>}
      </main>
    )
  }
  if (session.status === 'anonymous') return <Login onLogin={login} />

  const { user, state } = session
  const { catalog } = state
  const tabs = DEMO ? ALLOWED.admin.filter(t => t !== 'کاربران') : ALLOWED[user.role]
  const current = tabs.includes(tab) ? tab : tabs[0]
  const issueCount = validateCatalog(catalog).length
  // Read-only roles get the edit handler removed so a stray click cannot be sent.
  const canEdit = user.role !== 'viewer'

  const account = (
    <>
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
    </>
  )

  return (
    <>
      <header>
        <h1>برآورد قیمت و کنترل تولید WPC</h1>
        <span className="who">{user.username} ({ROLE_LABEL[user.role]})</span>
        <button className="btn ghost menu-btn" onClick={() => setMenuOpen(true)} aria-label="باز کردن منو">☰ منو</button>
        <div className="hdr-actions">{account}</div>
      </header>
      <nav className="topnav">
        {tabs.map(t => (
          <button key={t} className={t === current ? 'on' : ''} style={{ ['--tab' as string]: `var(--c-${TAB_KEY[t]})` }} onClick={() => setTab(t)}>
            {t}{t === 'هشدارها' && issueCount > 0 ? ` (${toFa(issueCount)})` : ''}
          </button>
        ))}
      </nav>
      <main key={current} data-tab={TAB_KEY[current]}>
        {DEMO && <div className="alert">نسخه نمایشی: بدون سرور و بدون ورود کاربران. داده‌ها فقط در همین مرورگر می‌مانند و با کسی به اشتراک گذاشته نمی‌شوند.</div>}
        {error && <div className="alert err" onClick={clearError}>{error} (برای بستن بزنید)</div>}
        {seedDone && <div className="alert ok" onClick={() => setSeedDone('')}>{seedDone} (برای بستن بزنید)</div>}
        {(user.role === 'admin' || DEMO) && catalog.seedVersion !== SEED_VERSION && (
          <div className="alert gaps print-hide">
            <b>اطلاعات اولیه‌ی تازه از فایل اکسل کارخانه آماده است</b>
            <p style={{ margin: '6px 0' }}>
              مواد، قیمت‌ها (به تومان)، فرمول‌ها، رنگ‌های N1 تا N12، هزینه‌ی هر مرحله‌ی ساخت (سربار)، و درصد سود طبق فایل اکسل گذاشته می‌شود. با زدن دکمه، <b>همه‌ی قیمت‌ها، فرمول‌ها، رنگ‌ها، محصولات و هزینه‌های فعلی جایگزین می‌شود</b>؛ قبلش خودکار یک فایل پشتیبان از وضعیت فعلی دانلود می‌شود تا هر وقت خواستی برگردانی (تب «پشتیبان‌گیری»). ثبت‌های انبار و پارت‌ها عوض نمی‌شود.
            </p>
            <button className={sureSeed ? 'btn danger' : 'btn'} onClick={() => {
              if (!sureSeed) return setSureSeed(true)
              let saved = true
              try {
                downloadBackup(state, user.username)
              } catch {
                saved = false // a blocked download must not stop the new data from being applied
              }
              update(s => { s.catalog = seedCatalog() })
              setSureSeed(false)
              setSeedDone(saved ? 'اطلاعات اکسل اعمال شد (مواد، قیمت‌ها، فرمول‌ها، رنگ‌ها، محصولات، هزینه‌ها و تعرفه‌ها). فایل پشتیبانِ وضعیت قبلی هم دانلود شد.' : 'اطلاعات اکسل اعمال شد، ولی مرورگر دانلود فایل پشتیبان را قبول نکرد. اگر نگران وضعیت قبلی هستی، از تب «پشتیبان‌گیری» یک فایل بگیر.')
            }}>{sureSeed ? 'مطمئنید؟ دوباره بزنید تا اعمال شود' : 'اعمال اطلاعات اکسل'}</button>
            {sureSeed && <span className="muted"> ← یک بار دیگر بزنید؛ تا آن موقع چیزی عوض نمی‌شود.</span>}
          </div>
        )}
        {current === 'شروع کار' && <Guide catalog={catalog} movements={state.movements} batches={state.batches} role={DEMO ? 'admin' : user.role} demo={DEMO} go={t => setTab(t as Tab)} />}
        {current === 'لیست قیمت' && <PriceList catalog={catalog} go={user.role === 'admin' || DEMO ? t => setTab(t as Tab) : undefined} onEditTariffs={user.role === 'admin' || DEMO ? () => setTab('هزینه‌ها') : undefined} />}
        {current === 'محاسبات' && <Calc catalog={catalog} go={user.role === 'admin' || DEMO ? t => setTab(t as Tab) : undefined} />}
        {current === 'مواد' && <Materials catalog={catalog} update={update} />}
        {current === 'فرمول‌ها' && <Recipes catalog={catalog} update={update} />}
        {current === 'محصولات' && <Products catalog={catalog} update={update} />}
        {current === 'هزینه‌ها' && <Costs catalog={catalog} update={update} />}
        {current === 'پارت تولید' && canEdit && <Batches state={state} update={update} />}
        {current === 'محصول ساخته‌شده' && <Goods state={state} update={update} readOnly={!canEdit} canDelete={user.role === 'admin' || DEMO} />}
        {current === 'انبار' && <Stock catalog={catalog} movements={state.movements} update={update} readOnly={!canEdit} />}
        {current === 'هشدارها' && <Issues catalog={catalog} go={user.role === 'admin' || DEMO ? t => setTab(t as Tab) : undefined} />}
        {current === 'پشتیبان‌گیری' && <Backup state={state} update={update} user={user.username} />}
        {current === 'کاربران' && (backend.kind === 'supabase' ? <SupabaseUsers catalog={catalog} /> : <Users me={user} catalog={catalog} />)}
      </main>
      <BottomBar tabs={tabs} current={current} tabKey={TAB_KEY} onSelect={setTab} issueCount={issueCount} onMore={() => setMenuOpen(true)} />
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} tabs={tabs} current={current} tabKey={TAB_KEY} onSelect={setTab} issueCount={issueCount} who={`${user.username} (${ROLE_LABEL[user.role]})`}>
        {account}
      </Drawer>
    </>
  )
}
