import { useState } from 'react'
import { useApp } from '../app'
import { isDate, fyOf } from '../lib/dates'
import { fuelCols, invoiceCols, receiptCols, tripCols, workCols, type Col } from '../lib/columns'
import { buildWorkbook, csvFor, type Tab } from '../lib/exports'
import { validate } from '../lib/validate'
import { workLocked } from '../lib/invoices'
import type { Invoice, Table } from '../lib/types'
import { Empty, Field, Head, download } from '../components/ui'
import { yearsIn } from './Tax'

function Cell<R>({ col, row, locked, onSave }: { col: Col<R>; row: R; locked: boolean; onSave: (r: R) => Promise<boolean> }) {
  const { data, today } = useApp()
  const shown = col.value(row, data, today)
  const num = col.type === 'money' || col.type === 'number'
  const fmt = shown === null ? '' : col.type === 'money' ? Number(shown).toFixed(2) : String(shown)
  const raw = col.raw ? col.raw(row) : fmt
  const [t, setT] = useState(raw), [seen, setSeen] = useState(raw)
  if (seen !== raw) { setSeen(raw); setT(raw) }
  if (!col.set || locked) return <td className={num ? 'num' : ''}><span>{fmt}</span></td>
  const commit = async (v: string) => {
    if (v === raw) return
    const next = col.set!(row, v)
    if (!next || !(await onSave(next))) setT(raw)
  }
  return <td className={num ? 'num' : ''}>{col.options
    ? <select aria-label={col.label} value={t} onChange={e => { setT(e.target.value); void commit(e.target.value) }}>{col.options(data).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    : <input aria-label={col.label} type={col.type === 'date' || col.type === 'time' ? col.type : 'text'} inputMode={num ? 'decimal' : undefined} value={t} onChange={e => setT(e.target.value)} onBlur={() => void commit(t)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setT(raw) }} />}</td>
}
function Grid<R extends { id: string; date?: string; issue_date?: string }>({ cols, rows, q, from, to, locked, onSave }: { cols: Col<R>[]; rows: R[]; q: string; from: string; to: string; locked?: (r: R) => boolean; onSave: (r: R) => Promise<boolean> }) {
  const { data, today } = useApp()
  const key = (r: R) => r.date ?? r.issue_date ?? ''
  const shown = rows.filter(r => (!from || key(r) >= from) && (!to || key(r) <= to) && (!q || cols.map(c => c.value(r, data, today)).join(' ').toLowerCase().includes(q.toLowerCase()))).sort((a, b) => key(b).localeCompare(key(a)))
  if (!shown.length) return <Empty>No matching rows.</Empty>
  return <div className="max-h-[65dvh] overflow-auto rounded-lg"><table className="sheet"><thead><tr>{cols.map(c => <th key={c.label} scope="col">{c.label}</th>)}</tr></thead><tbody>{shown.map(r => <tr key={r.id}>{cols.map(c => <Cell key={c.label} col={c} row={r} locked={locked?.(r) ?? false} onSave={onSave} />)}</tr>)}</tbody></table></div>
}
const TABS: [Tab, string][] = [['work', 'Work Hours'], ['vehicle', 'Fuel & Distance'], ['receipts', 'Receipts'], ['invoices', 'Invoices']]
export default function Spreadsheet() {
  const { data, store, act, today } = useApp()
  const [tab, setTab] = useState<Tab>('work'), [q, setQ] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [fy, setFy] = useState(fyOf(today))
  const put = (t: Table) => (r: never) => act(async () => { const bad = validate(t, r); if (bad) throw new Error(bad); await store.put(t, r) }, 'Saved')
  const putInvoice = (i: Invoice) => act(async () => {
    if (!isDate(i.issue_date) || !isDate(i.due_date) || i.due_date < i.issue_date) throw new Error('The due date must be on or after the issue date.')
    await store.saveInvoice(i, data.work.filter(w => w.invoice_id === i.id).map(w => w.id))
  }, 'Saved')
  const f = { q, from, to }
  return (
    <>
      <Head title="Spreadsheet">
        <select aria-label="Tax summary year" className="!w-auto" value={fy} onChange={e => setFy(e.target.value)}>{yearsIn([...data.invoices.map(i => i.issue_date), ...data.receipts.map(r => r.date)], today).map(y => <option key={y}>{y}</option>)}</select>
        <button className="btn" onClick={() => act(async () => download(new Blob([await buildWorkbook(data, fy, today)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Garden Ledger ${today}.xlsx`), 'Excel workbook exported')}>Export Excel</button>
        <button className="btn btn-quiet" onClick={() => download(new Blob([csvFor(tab, data)], { type: 'text/csv' }), `${TABS.find(t => t[0] === tab)![1]} ${today}.csv`)}>Export this tab as CSV</button>
      </Head>
      <div className="mb-4 flex flex-wrap gap-2">{TABS.map(([t, l]) => <button key={t} aria-pressed={t === tab} className={`btn ${t === tab ? '' : 'btn-quiet'}`} onClick={() => setTab(t)}>{l}</button>)}</div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Filter rows"><input type="search" value={q} onChange={e => setQ(e.target.value)} /></Field>
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      {tab === 'work' && <Grid cols={workCols} rows={data.work} {...f} locked={w => workLocked(w, data.invoices)} onSave={put('work') as never} />}
      {tab === 'vehicle' && <><h2 className="mb-2">Trips</h2><Grid cols={tripCols} rows={data.trips} {...f} onSave={put('trips') as never} /><h2 className="mb-2 mt-6">Fuel</h2><Grid cols={fuelCols} rows={data.fuel} {...f} onSave={put('fuel') as never} /></>}
      {tab === 'receipts' && <Grid cols={receiptCols} rows={data.receipts} {...f} onSave={put('receipts') as never} />}
      {tab === 'invoices' && <Grid cols={invoiceCols} rows={data.invoices} {...f} locked={i => i.status !== 'draft'} onSave={putInvoice} />}
      <p className="hint mt-3">Shaded cells are calculated or locked. Exports include every row in a tab, not just the filtered ones.</p>
    </>
  )
}
