import { useState } from 'react'
import { validateCatalog, toFa } from './core'
import { useAppState } from './store'
import { Batches } from './tabs/Batches'
import { Costs } from './tabs/Costs'
import { Issues } from './tabs/Issues'
import { Materials } from './tabs/Materials'
import { PriceList } from './tabs/PriceList'
import { Products } from './tabs/Products'
import { Recipes } from './tabs/Recipes'
import { Stock } from './tabs/Stock'

const TABS = ['لیست قیمت', 'مواد', 'فرمول‌ها', 'محصولات', 'هزینه‌ها', 'پارت تولید', 'انبار', 'هشدارها'] as const

export default function App() {
  const { state, update, reset } = useAppState()
  const [tab, setTab] = useState<(typeof TABS)[number]>('لیست قیمت')
  const { catalog } = state
  const issueCount = validateCatalog(catalog).length

  return (
    <>
      <header>
        <h1>برآورد قیمت و کنترل تولید WPC</h1>
        <button
          className="btn ghost"
          style={{ color: 'inherit', borderColor: 'currentColor' }}
          onClick={() => confirm('همه داده‌ها به حالت اولیه برمی‌گردد. ادامه می‌دهید؟') && reset()}
        >
          بازنشانی
        </button>
      </header>
      <nav>
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{t === 'هشدارها' && issueCount > 0 ? ` (${toFa(issueCount)})` : ''}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'لیست قیمت' && <PriceList catalog={catalog} />}
        {tab === 'مواد' && <Materials catalog={catalog} update={update} />}
        {tab === 'فرمول‌ها' && <Recipes catalog={catalog} update={update} />}
        {tab === 'محصولات' && <Products catalog={catalog} update={update} />}
        {tab === 'هزینه‌ها' && <Costs catalog={catalog} update={update} />}
        {tab === 'پارت تولید' && <Batches state={state} update={update} />}
        {tab === 'انبار' && <Stock catalog={catalog} movements={state.movements} update={update} />}
        {tab === 'هشدارها' && <Issues catalog={catalog} />}
      </main>
    </>
  )
}
