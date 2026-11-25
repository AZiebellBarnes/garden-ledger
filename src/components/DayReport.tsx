import { useState } from 'react'
import { addDays, longDate, monday, weekday } from '../lib/dates'
import { earningsOf, hrs, minutesOf } from '../lib/hours'
import { aud } from '../lib/money'
import { dayList, type SharedRow } from '../lib/sharing'
import { Empty, Field, Figures } from './ui'

/** The contractor's page, also used for the owner's preview. Read-only. */
export function DayReport({ rows, today }: { rows: SharedRow[]; today: string }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const days = dayList(rows, from, to), mon = monday(today)
  const ranges: [string, string, string][] = [['This week', mon, addDays(mon, 6)], ['Last week', addDays(mon, -7), addDays(mon, -1)], ['This month', today.slice(0, 8) + '01', today], ['All', '', '']]
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">{ranges.map(([l, a, b]) => { const on = from === a && to === b; return <button key={l} aria-pressed={on} className={`btn ${on ? '' : 'btn-quiet'}`} onClick={() => { setFrom(a); setTo(b) }}>{l}</button> })}</div>
      <div className="mb-5 grid max-w-md grid-cols-2 gap-3">
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      <Figures items={[['Days worked', String(days.length)], ['Hours', hrs(days.reduce((a, d) => a + d.minutes, 0))], ['Amount', aud(days.reduce((a, d) => a + d.cents, 0))]]} />
      {!days.length && <Empty>{rows.length ? 'No work in these dates.' : 'No work has been logged yet.'}</Empty>}
      <div className="grid gap-4">{days.map(d => (
        <section key={d.date} className="panel">
          <div className="mb-1 flex flex-wrap justify-between gap-x-3"><h2>{weekday(d.date)} {longDate(d.date)}</h2><b>{hrs(d.minutes)} h, {aud(d.cents)}</b></div>
          <div className="rows">{d.jobs.map(j => (
            <div key={j.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0"><span className="block font-semibold">{j.start} to {j.finish}</span><span className="hint">{[j.site, j.break_min ? `${j.break_min} min unpaid break` : ''].filter(Boolean).join(', ')}</span></span>
              <span className="shrink-0 text-right"><b className="block">{aud(earningsOf(j))}</b><span className="hint">{hrs(minutesOf(j))} h</span></span>
            </div>))}</div>
        </section>))}</div>
    </>
  )
}
