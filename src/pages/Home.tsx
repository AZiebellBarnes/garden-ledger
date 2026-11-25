import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app'
import { addDays, fyOf, longDate, monday, weekday } from '../lib/dates'
import { dailyTotals, hrs } from '../lib/hours'
import { aud } from '../lib/money'
import { effectiveStatus, totals, workStatus } from '../lib/invoices'
import { earningsOf } from '../lib/hours'
import { summarise } from '../lib/tax'
import { Tag } from '../components/ui'
import { FuelForm, ReceiptForm, TripForm, WorkForm } from '../components/forms'

export default function Home() {
  const { data, today } = useApp()
  const [open, setOpen] = useState<'work' | 'trip' | 'fuel' | 'receipt' | null>(null)
  const close = () => setOpen(null)
  const start = monday(today)
  const days = dailyTotals(data.work.filter(w => w.date >= start && w.date <= addDays(start, 6)))
  const total = days.reduce((a, d) => a + d.minutes, 0), earned = days.reduce((a, d) => a + d.cents, 0)
  const tall = Math.max(600, ...days.map(d => d.minutes))
  const s = summarise(data, fyOf(today), today)
  const owing = data.invoices.filter(i => i.status === 'sent').sort((a, b) => a.due_date.localeCompare(b.due_date))
  const unbilled = data.work.filter(w => workStatus(w, data.invoices) === 'Unbilled')
  return (
    <>
      <section className="mb-6">
        <h1 className="mb-1">{total ? `${hrs(total)} hours this week, ${aud(earned)}` : 'No hours logged this week yet'}</h1>
        <p className="hint mb-4">Week of {longDate(start)}</p>
        <div className="bed" role="img" aria-label={'Hours per day: ' + Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return `${weekday(d)} ${hrs(days.find(x => x.date === d)?.minutes ?? 0)}` }).join(', ')}>
          {Array.from({ length: 7 }, (_, i) => {
            const m = days.find(x => x.date === addDays(start, i))?.minutes ?? 0
            return <div key={i} className="bed-day">{m ? <><span>{hrs(m)}</span><span className="bloom" /><span className="stem" style={{ height: 34 + (m / tall) * 78 }} /></> : <span className="seed" />}</div>
          })}
        </div>
        <div className="grid grid-cols-7 pt-1 text-center text-sm" aria-hidden>{Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return <span key={i} className={d === today ? 'font-bold' : 'text-stone'}>{weekday(d)}</span> })}</div>
      </section>
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button className="btn" onClick={() => setOpen('work')}>Log hours</button>
        <button className="btn btn-quiet" onClick={() => setOpen('trip')}>Add trip</button>
        <button className="btn btn-quiet" onClick={() => setOpen('fuel')}>Add fuel</button>
        <button className="btn btn-quiet" onClick={() => setOpen('receipt')}>Add receipt</button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Link to="/tax" className="panel block !bg-marigold"><h2>Move {aud(s.weeklyTotal)} to tax savings this week</h2><p className="mt-2">Based on {aud(s.avgWeekly)} average weekly income. By now you should have put away {aud(s.setAsideSoFar)}.</p></Link>
        <section>
          <h2 className="mb-2">Waiting on payment</h2>
          {owing.length ? <div className="rows">{owing.map(i => <div key={i.id} className="flex items-center justify-between gap-3 py-2"><span><b>{i.number}</b> due {longDate(i.due_date)}</span><span className="flex items-center gap-2"><Tag s={effectiveStatus(i, today)} /><b>{aud(totals(i).total)}</b></span></div>)}</div> : <p className="text-stone">Every sent invoice has been paid.</p>}
          {unbilled.length > 0 && <p className="mt-3"><Link className="font-semibold text-leaf underline" to="/invoices">Invoice {aud(unbilled.reduce((a, w) => a + earningsOf(w), 0))} of unbilled work</Link></p>}
        </section>
      </div>
      {open === 'work' && <WorkForm onClose={close} />}
      {open === 'trip' && <TripForm onClose={close} />}
      {open === 'fuel' && <FuelForm onClose={close} />}
      {open === 'receipt' && <ReceiptForm onClose={close} />}
    </>
  )
}
