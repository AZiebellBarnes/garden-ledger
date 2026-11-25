import { useState } from 'react'
import { useApp } from '../app'
import { CATEGORIES, type Receipt } from '../lib/types'
import { longDate } from '../lib/dates'
import { aud } from '../lib/money'
import { Empty, Field, Figures, Head } from '../components/ui'
import { ReceiptForm, useText } from '../components/forms'
import { Thumb, Viewer } from '../components/files'

export default function Receipts() {
  const { data } = useApp()
  const [edit, setEdit] = useState<Receipt | 'new' | null>(null), [view, setView] = useState<Receipt | null>(null)
  const { v, bind } = useText({ q: '', cat: '', from: '', to: '' })
  const q = v.q.trim().toLowerCase()
  const rows = data.receipts.filter(r => (!q || `${r.vendor} ${r.notes} ${r.category} ${(r.amount_cents / 100).toFixed(2)}`.toLowerCase().includes(q)) && (!v.cat || r.category === v.cat) && (!v.from || r.date >= v.from) && (!v.to || r.date <= v.to)).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <>
      <Head title="Receipts"><button className="btn" onClick={() => setEdit('new')}>Add receipt</button></Head>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Search"><input type="search" {...bind('q')} /></Field>
        <Field label="Category"><select {...bind('cat')}><option value="">All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="From"><input type="date" {...bind('from')} /></Field>
        <Field label="To"><input type="date" {...bind('to')} /></Field>
      </div>
      <Figures items={[['Receipts', String(rows.length)], ['Total', aud(rows.reduce((a, r) => a + r.amount_cents, 0))]]} />
      {!rows.length && <Empty>{data.receipts.length ? 'No receipts match these filters.' : 'Photograph a receipt to store it here and count it at tax time.'}</Empty>}
      {rows.length > 0 && <div className="panel rows">{rows.map(r => (
        <div key={r.id} className="flex items-center gap-3 py-2.5">
          <button disabled={!r.file} aria-label={`View ${r.vendor} receipt`} onClick={() => setView(r)}><Thumb r={r} /></button>
          <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left" onClick={() => setEdit(r)}>
            <span className="min-w-0"><span className="block truncate font-semibold">{r.vendor}</span><span className="hint">{longDate(r.date)}, {r.category}{r.is_asset ? ', asset' : ''}</span></span>
            <b>{aud(r.amount_cents)}</b>
          </button>
        </div>))}</div>}
      {edit && <ReceiptForm row={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {view && <Viewer r={view} onClose={() => setView(null)} />}
    </>
  )
}
