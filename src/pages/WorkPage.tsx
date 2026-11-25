import { useState } from 'react'
import { useApp } from '../app'
import type { Work } from '../lib/types'
import { longDate, weekday } from '../lib/dates'
import { dailyTotals, earningsOf, hrs, minutesOf } from '../lib/hours'
import { workStatus } from '../lib/invoices'
import { aud } from '../lib/money'
import { Empty, Figures, Head, Tag } from '../components/ui'
import { WorkForm } from '../components/forms'

export default function WorkPage() {
  const { data } = useApp()
  const [edit, setEdit] = useState<Work | 'new' | null>(null)
  const [filter, setFilter] = useState('All')
  const rows = data.work.filter(w => filter === 'All' || workStatus(w, data.invoices) === filter)
  const days = dailyTotals(rows).reverse()
  return (
    <>
      <Head title="Work hours"><button className="btn" onClick={() => setEdit('new')}>Log hours</button></Head>
      <Figures items={[['Hours', hrs(rows.reduce((a, w) => a + minutesOf(w), 0))], ['Earnings', aud(rows.reduce((a, w) => a + earningsOf(w), 0))], ['Days', String(days.length)]]} />
      <div className="mb-4 flex flex-wrap gap-2">{['All', 'Unbilled', 'Invoiced', 'Paid'].map(f => <button key={f} aria-pressed={f === filter} className={`btn ${f === filter ? '' : 'btn-quiet'}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
      {!days.length && <Empty>{filter === 'All' ? 'Log your first job to start tracking hours and earnings.' : `No ${filter.toLowerCase()} hours.`}</Empty>}
      <div className="grid gap-4">{days.map(d => (
        <section key={d.date} className="panel">
          <div className="mb-1 flex justify-between gap-3"><h2>{weekday(d.date)} {longDate(d.date)}</h2><b>{hrs(d.minutes)} h, {aud(d.cents)}</b></div>
          <div className="rows">{rows.filter(w => w.date === d.date).sort((a, b) => a.start.localeCompare(b.start)).map(w => (
            <button key={w.id} className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={() => setEdit(w)}>
              <span className="min-w-0"><span className="block font-semibold">{w.site || data.clients.find(c => c.id === w.client_id)?.name || 'No site'}</span><span className="hint">{w.start} to {w.finish}{w.break_min ? `, ${w.break_min} min break` : ''}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1"><b>{aud(earningsOf(w))}</b><Tag s={workStatus(w, data.invoices)} /></span>
            </button>))}</div>
        </section>))}</div>
      {edit && <WorkForm row={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}
