import { useState } from 'react'
import { addDays, longDate, monday, weekday } from '../lib/dates'
import { earningsOf, hrs, minutesOf } from '../lib/hours'
import { aud } from '../lib/money'
import { invoiceLabel, weekList, type SharedRow } from '../lib/sharing'
import { Empty, Field, Figures } from './ui'

/** The contractor's page, also used for the owner's preview. Read-only. */
export function DayReport({ rows, today }: { rows: SharedRow[]; today: string }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const weeks = weekList(rows, from, to), mon = monday(today)
  const ranges: [string, string, string][] = [['This week', mon, addDays(mon, 6)], ['Last week', addDays(mon, -7), addDays(mon, -1)], ['This month', today.slice(0, 8) + '01', today], ['All', '', '']]
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">{ranges.map(([l, a, b]) => { const on = from === a && to === b; return <button key={l} aria-pressed={on} className={`btn ${on ? '' : 'btn-quiet'}`} onClick={() => { setFrom(a); setTo(b) }}>{l}</button> })}</div>
      <div className="mb-5 grid max-w-md grid-cols-2 gap-3">
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      <Figures items={[['Days worked', String(weeks.reduce((a, w) => a + w.days.length, 0))], ['Hours', hrs(weeks.reduce((a, w) => a + w.minutes, 0))], ['Amount', aud(weeks.reduce((a, w) => a + w.cents, 0))]]} />
      {!weeks.length && <Empty>{rows.length ? 'No work in these dates.' : 'No work has been logged yet.'}</Empty>}
      <div className="grid gap-8">{weeks.map(w => (
        <section key={w.start} aria-labelledby={`week-${w.start}`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 border-b-2 border-leaf pb-2">
            <h2 id={`week-${w.start}`}>{longDate(w.start)} to {longDate(w.end)}</h2>
            <b>{hrs(w.minutes)} h, {aud(w.cents)}</b>
          </div>
          <div className="grid gap-3">{w.days.map(d => (
            <div key={d.date} className="panel">
              <div className="mb-1 flex flex-wrap justify-between gap-x-3"><h3 className="text-lg">{weekday(d.date)} {longDate(d.date)}</h3><b>{hrs(d.minutes)} h, {aud(d.cents)}</b></div>
              <div className="rows">{d.jobs.map(j => (
                <div key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-semibold">{j.start} to {j.finish}</span>
                    <span className="hint block">{[j.site, j.break_min ? `${j.break_min} min unpaid break` : ''].filter(Boolean).join(', ')}</span>
                    {j.invoice !== undefined && <span className={`tag mt-1 ${j.invoice ? 'tag-invoiced' : ''}`}>{invoiceLabel(j.invoice)}</span>}
                  </span>
                  <span className="shrink-0 text-right"><b className="block">{aud(earningsOf(j))}</b><span className="hint">{hrs(minutesOf(j))} h</span></span>
                </div>))}</div>
            </div>))}</div>
        </section>))}</div>
    </>
  )
}
