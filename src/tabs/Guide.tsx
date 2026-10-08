import { useState } from 'react'
import type { Role } from '../api'
import { toFa, type Catalog, type Movement } from '../core'
import type { Batch } from '../core'

const CHECKS_KEY = 'baravord-nest/guide-checks'
export const GUIDE_HIDDEN_KEY = 'baravord-nest/guide-hidden'

function readChecks(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const guideHidden = (): boolean => {
  try {
    return localStorage.getItem(GUIDE_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

interface Step {
  id: string
  title: string
  text: string
  tab: string
  /** Detected from the data. Steps without it are ticked by hand. */
  done?: boolean
  /** Short status shown next to an auto-detected step. */
  status?: string
}

export function Guide(props: {
  catalog: Catalog
  movements: Movement[]
  batches: Batch[]
  role: Role
  /** The demo has no user management. */
  demo: boolean
  go: (tab: string) => void
}) {
  const { catalog, movements, batches, role, demo, go } = props
  const [checks, setChecks] = useState(readChecks)
  const [hidden, setHidden] = useState(guideHidden)

  const toggleCheck = (id: string) => {
    const next = { ...checks, [id]: !checks[id] }
    setChecks(next)
    try {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(next))
    } catch {
      // storage blocked: the tick lasts until the page closes
    }
  }
  const toggleHidden = () => {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem(GUIDE_HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // storage blocked
    }
  }

  const noPrice = Object.values(catalog.materials).filter(m => m.pricePerKg == null).length
  const noWeight = Object.values(catalog.products).filter(p => p.colorable && p.weightPer3mG == null).length
  const costsOk = catalog.config.monthlyCosts.length > 0 && catalog.config.monthlyProductionKg > 0

  const setup: Step[] = [
    {
      id: 'prices', tab: 'مواد', title: 'قیمت مواد را وارد کنید',
      text: 'جلوی هر ماده، قیمت هر کیلو را بنویسید. اگر قیمت‌ها را به ریال دارید، تیک «قیمت را به ریال وارد می‌کنم» را بزنید تا خودش به تومان تبدیل کند.',
      done: noPrice === 0, status: noPrice === 0 ? 'همه قیمت دارند' : `${toFa(noPrice)} ماده بدون قیمت`,
    },
    {
      id: 'recipes', tab: 'فرمول‌ها', title: 'فرمول‌ها را با فرمول واقعی کارخانه مقایسه کنید',
      text: 'فرمول PRP، پروفیل، صفحه کابینت و رنگ‌ها را باز کنید و اگر مقداری با کارخانه فرق دارد، درستش کنید. مقدارها به کیلو و برای هر ۱۰۰ کیلو هستند. می‌توانید جزء اضافه یا حذف کنید.',
    },
    {
      id: 'weights', tab: 'محصولات', title: 'وزن هر محصول را وارد کنید',
      text: 'وزن یک شاخه ۳ متری را به گرم بنویسید. بدون وزن، قیمت هر متر و هر شاخه حساب نمی‌شود.',
      done: noWeight === 0, status: noWeight === 0 ? 'همه وزن دارند' : `${toFa(noWeight)} محصول بدون وزن`,
    },
    {
      id: 'costs', tab: 'هزینه‌ها', title: 'هزینه‌های کارخانه را وارد کنید',
      text: 'هزینه‌های ماهانه (برق، حقوق، اجاره، استهلاک و غیره) و کیلوی تولید همان ماه را بنویسید تا سربار هر کیلو حساب شود. کرایه، انبارداری و باسکول هر پارت و درصد ضایعات را هم همان‌جا وارد کنید.',
      done: costsOk, status: costsOk ? 'وارد شده' : 'هنوز وارد نشده',
    },
    {
      id: 'tariffs', tab: 'هزینه‌ها', title: 'درصد سود تعرفه‌ها را مشخص کنید',
      text: 'در پایین همان صفحه، برای هر تعرفه (مثلاً عمده و خرده) درصد سود را بنویسید. دو تعرفه‌ی فعلی فقط نمونه‌اند. می‌توانید تعرفه اضافه یا حذف کنید.',
    },
    {
      id: 'check', tab: 'لیست قیمت', title: 'لیست قیمت را بررسی کنید',
      text: 'رنگ و تعرفه را انتخاب کنید. روی هر محصول بزنید تا اجزای قیمتش را ببینید و عدد را با حساب خودتان مقایسه کنید. اگر عدد درست بود، آماده‌اید.',
    },
    ...(demo ? [] : [{
      id: 'users', tab: 'کاربران', title: 'برای همکاران کاربر بسازید',
      text: 'به هر همکار یک نقش بدهید: «اپراتور» پارت و انبار را ثبت می‌کند و «مشاهده‌گر» فقط می‌بیند. راهنمای ساخت کاربر جدید در همان صفحه نوشته شده است.',
    }]),
  ]

  const daily: Step[] = [
    {
      id: 'buy', tab: 'انبار', title: 'خرید مواد را ثبت کنید',
      text: 'هر بار ماده‌ای خریدید، ماده، مقدار (کیلو)، قیمت خرید هر کیلو و تاریخ شمسی را بنویسید و «ثبت خرید» را بزنید. قیمت ماده در لیست قیمت خودکار با میانگین خریدها به‌روز می‌شود.',
      done: movements.some(m => m.type === 'in'), status: movements.some(m => m.type === 'in') ? 'ثبت شده' : 'هنوز خریدی ثبت نشده',
    },
    {
      id: 'batch', tab: 'پارت تولید', title: 'هر پارت تولید را ثبت کنید',
      text: 'محصول و رنگ را انتخاب کنید و «شروع پارت» را بزنید. اگر مقدار واقعی ماده‌ای با فرمول فرق داشت، همان‌جا عوضش کنید. در آخر «ثبت پارت و کسر از انبار» را بزنید. مصرف از موجودی کم می‌شود و اختلاف با فرمول استاندارد دیده می‌شود.',
      done: batches.length > 0, status: batches.length > 0 ? `${toFa(batches.length)} پارت ثبت شده` : 'هنوز پارتی ثبت نشده',
    },
    {
      id: 'waste', tab: 'انبار', title: 'ضایعات برگشتی را ثبت کنید',
      text: 'ضایعاتی که دوباره مصرف می‌شود را با دکمه «ضایعات برگشتی» ثبت کنید تا موجودی ضایعات درست بماند.',
      done: movements.some(m => m.type === 'waste_in'), status: movements.some(m => m.type === 'waste_in') ? 'ثبت شده' : 'هنوز ثبت نشده',
    },
    {
      id: 'stock', tab: 'انبار', title: 'باقی‌مانده مواد را ببینید',
      text: 'جدول «باقی‌مانده مواد» نشان می‌دهد از هر ماده چقدر مانده است. اگر موجودی کم باشد، ثبت پارت به شما می‌گوید کدام ماده کم است.',
    },
  ]

  const isDone = (s: Step) => (s.done !== undefined ? s.done : !!checks[s.id])
  const render = (steps: Step[], offset = 0) => (
    <ol className="steps">
      {steps.map((s, i) => {
        const done = isDone(s)
        return (
          <li key={s.id} className={`step${done ? ' done' : ''}`}>
            <span className="step-num" aria-hidden="true">{done ? '✓' : toFa(i + 1 + offset)}</span>
            <div className="step-body">
              <b>{s.title}</b>
              <p>{s.text}</p>
              <div className="row" style={{ marginBottom: 0 }}>
                <button className="btn ghost" onClick={() => go(s.tab)}>برو به «{s.tab}»</button>
                {s.status !== undefined
                  ? <span className={`tag ${done ? 'ok' : ''}`}>{s.status}</span>
                  : (
                    <label className="check">
                      <input type="checkbox" checked={done} onChange={() => toggleCheck(s.id)} /> انجام دادم
                    </label>
                  )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )

  const doneCount = setup.filter(isDone).length

  return (
    <>
      <div className="card">
        <h2>خوش آمدید</h2>
        <p>
          این برنامه قیمت تمام‌شده و قیمت فروش محصولات WPC را از روی قیمت مواد و فرمول‌ها حساب می‌کند،
          و مصرف مواد و موجودی انبار را کنترل می‌کند. همه قیمت‌ها به تومان‌اند.
        </p>
        <div className="note">
          <b>قیمت چطور حساب می‌شود؟</b>
          <p>
            قیمت هر ماده × مقدارش در فرمول، هزینه مواد هر کیلو را می‌دهد. به آن سهم ضایعات، سربار کارخانه
            (هزینه ماهانه تقسیم بر کیلوی تولید) و کرایه و انبارداری اضافه می‌شود تا <b>قیمت تمام‌شده</b> بسازد.
            با درصد سود تعرفه، <b>قیمت فروش</b> هر کیلو، هر متر و هر شاخه ۳ متری به‌دست می‌آید.
          </p>
        </div>
      </div>

      {role === 'viewer' && (
        <div className="card">
          <h2>چه چیزی می‌توانید ببینید؟</h2>
          <ol className="steps">
            <li className="step"><span className="step-num">۱</span><div className="step-body"><b>لیست قیمت</b>
              <p>رنگ و تعرفه را انتخاب کنید تا قیمت هر کیلو، هر متر و هر شاخه ۳ متری را ببینید. روی هر محصول بزنید تا اجزای قیمت باز شود.</p>
              <button className="btn ghost" onClick={() => go('لیست قیمت')}>برو به «لیست قیمت»</button></div></li>
            <li className="step"><span className="step-num">۲</span><div className="step-body"><b>انبار</b>
              <p>باقی‌مانده هر ماده و تاریخچه ورود و خروج را ببینید. شما فقط اجازه دیدن دارید و چیزی را نمی‌توانید تغییر دهید.</p>
              <button className="btn ghost" onClick={() => go('انبار')}>برو به «انبار»</button></div></li>
          </ol>
        </div>
      )}

      {role === 'admin' && (
        <div className="card">
          <h2>راه‌اندازی (یک بار)</h2>
          <p className="muted">
            این قدم‌ها را به ترتیب انجام دهید. هر قدمی که برنامه بتواند خودش تشخیص بدهد، خودش تیک می‌خورد
            ({toFa(doneCount)} از {toFa(setup.length)} انجام شده).
          </p>
          {render(setup)}
        </div>
      )}

      {role !== 'viewer' && (
        <div className="card">
          <h2>کار روزانه</h2>
          {render(daily)}
        </div>
      )}

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={hidden} onChange={toggleHidden} />
          هنگام ورود، این صفحه را نشان نده (از تب «شروع کار» همیشه در دسترس است)
        </label>
      </div>
    </>
  )
}
