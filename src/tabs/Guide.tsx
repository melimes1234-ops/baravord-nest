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
      id: 'prices', tab: 'مواد', title: 'قیمت مواد را بنویسید',
      text: 'جلوی هر ماده بنویسید هر کیلو چند تومان است.',
      done: noPrice === 0, status: noPrice === 0 ? 'همه قیمت دارند' : `${toFa(noPrice)} ماده قیمت ندارد`,
    },
    {
      id: 'recipes', tab: 'فرمول‌ها', title: 'فرمول‌ها را با کارخانه یکی کنید',
      text: 'فرمول‌ها را باز کنید و ببینید با فرمول واقعی کارخانه یکی است یا نه. فرمول‌های اصلی قفل‌اند تا اشتباهی دست نخورند. اگر چیزی فرق دارد، «کپی برای آزمایش» را بزنید، در کپی تغییرش بدهید و ببینید قیمت‌ها چه می‌شوند.',
    },
    {
      id: 'weights', tab: 'محصولات', title: 'وزن هر محصول را بنویسید',
      text: 'وزن یک شاخه را به گرم بنویسید. طول شاخه هم همان‌جا هست (معمولاً ۳ متر). تا وزن نباشد، قیمت شاخه و متر معلوم نمی‌شود.',
      done: noWeight === 0, status: noWeight === 0 ? 'همه وزن دارند' : `${toFa(noWeight)} محصول وزن ندارد`,
    },
    {
      id: 'costs', tab: 'هزینه‌ها', title: 'هزینه‌های کارخانه را بنویسید',
      text: 'هزینه‌هایی که هر ماه پرداخت می‌کنید (برق، حقوق، اجاره و مانند آن) و تعداد کیلویی که آن ماه ساخته‌اید را بنویسید. کرایه و انبارداری هر پارت و درصد دورریز مواد هم همان‌جاست.',
      done: costsOk, status: costsOk ? 'نوشته شده' : 'هنوز نوشته نشده',
    },
    {
      id: 'tariffs', tab: 'هزینه‌ها', title: 'درصد سود را مشخص کنید',
      text: 'پایین همان صفحه، برای هر نوع فروش (مثلاً عمده و خرده) بنویسید چند درصد سود می‌خواهید. دو تعرفه‌ی فعلی فقط نمونه‌اند؛ تغییرشان بدهید.',
    },
    {
      id: 'calc', tab: 'محاسبات', title: 'ببینید قیمت چطور درمی‌آید',
      text: 'تب «محاسبات» قدم‌به‌قدم نشان می‌دهد قیمت یک محصول چطور ساخته می‌شود، مثل یک صورت‌حساب. بالایش هم می‌نویسد چه چیزی ناقص یا مشکوک است. اگر عددی به نظرتان درست نبود، «کپی خلاصه‌ی محاسبه» را بزنید و برای ما بفرستید.',
    },
    {
      id: 'check', tab: 'لیست قیمت', title: 'لیست قیمت را نگاه کنید',
      text: 'رنگ و تعرفه را انتخاب کنید. روی هر محصول بزنید تا ببینید قیمتش از چه چیزهایی ساخته شده، و عدد را با حساب خودتان مقایسه کنید. اگر درست بود، آماده‌اید.',
    },
    ...(demo ? [] : [{
      id: 'users', tab: 'کاربران', title: 'برای همکارانتان کاربر بسازید',
      text: 'به هر همکار یک نقش بدهید: «اپراتور» پارت و انبار را ثبت می‌کند، «مشاهده‌گر» فقط می‌بیند.',
    }]),
  ]

  const daily: Step[] = [
    {
      id: 'buy', tab: 'انبار', title: 'خریدها را ثبت کنید',
      text: 'هر بار ماده‌ای خریدید، اسم ماده، چند کیلو، قیمت هر کیلو و تاریخ را بنویسید و «ثبت خرید» را بزنید. قیمت آن ماده خودش با میانگین خریدها به‌روز می‌شود.',
      done: movements.some(m => m.type === 'in'), status: movements.some(m => m.type === 'in') ? 'ثبت شده' : 'هنوز خریدی ثبت نشده',
    },
    {
      id: 'batch', tab: 'پارت تولید', title: 'هر پارت تولید را ثبت کنید',
      text: 'محصول و رنگ را انتخاب کنید و «شروع پارت» را بزنید. اگر مقدار واقعی یک ماده با فرمول فرق داشت، همان‌جا عوضش کنید. آخر کار «ثبت پارت و کسر از انبار» را بزنید. مواد مصرف‌شده از انبار کم می‌شود و می‌بینید چقدر با فرمول فرق داشته‌اید.',
      done: batches.length > 0, status: batches.length > 0 ? `${toFa(batches.length)} پارت ثبت شده` : 'هنوز پارتی ثبت نشده',
    },
    {
      id: 'waste', tab: 'انبار', title: 'دورریزِ قابل مصرف را ثبت کنید',
      text: 'دورریزی که دوباره مصرف می‌شود را با دکمه‌ی «ضایعات برگشتی» ثبت کنید تا موجودی‌اش درست بماند.',
      done: movements.some(m => m.type === 'waste_in'), status: movements.some(m => m.type === 'waste_in') ? 'ثبت شده' : 'هنوز ثبت نشده',
    },
    {
      id: 'stock', tab: 'انبار', title: 'ببینید چه چیزی مانده',
      text: 'جدول «باقی‌مانده مواد» می‌گوید از هر ماده چقدر مانده. اگر ماده‌ای کم باشد، موقع ثبت پارت به شما می‌گوید.',
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
          این برنامه به شما می‌گوید هر محصول WPC چقدر خرج ساخت دارد و باید چند تومان فروخته شود.
          هم‌چنین مصرف مواد و موجودی انبار را نگه می‌دارد. همه‌ی قیمت‌ها به تومان‌اند.
        </p>
        <div className="note">
          <b>قیمت چطور درمی‌آید؟</b>
          <p>
            اول می‌بینیم مواد یک کیلو چقدر خرج دارد. بعد دورریز مواد، هزینه‌های ثابت کارخانه (برق، حقوق، اجاره)
            و کرایه و انبارداری را به آن اضافه می‌کنیم. جمعش <b>خرج ساخت</b> (قیمت تمام‌شده) است.
            سود را روی آن می‌گذاریم و <b>قیمت فروش</b> یک کیلو درمی‌آید. از روی آن قیمت یک شاخه، یک متر و یک متر مربع را هم می‌گوییم.
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
