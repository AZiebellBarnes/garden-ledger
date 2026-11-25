import { useState } from 'react'
import { useApp } from '../app'
import type { Invoice } from '../lib/types'
import { addDays, isDate, longDate } from '../lib/dates'
import { buildWorkItems, effectiveStatus, nextNumber, refreshDraft, totals, workStatus } from '../lib/invoices'
import { dailyTotals, earningsOf, hrs, minutesOf } from '../lib/hours'
import { aud, parseCents, plain } from '../lib/money'
import { renderInvoice } from '../lib/pdf'
import { Dialog, Empty, Field, Figures, FormDialog, Head, Tag, download, useSave } from '../components/ui'
import { PdfView } from '../components/files'
import { useText } from '../components/forms'

function Editor({ inv, onClose }: { inv?: Invoice; onClose: () => void }) {
  const { data, store, today } = useApp()
  const save = useSave()
  const s = data.settings
  const { v, set, bind } = useText({ number: inv?.number ?? nextNumber(data.invoices, s.invoice_prefix, s.invoice_pad), client: inv?.client_id ?? data.clients[0]?.id ?? '', issue: inv?.issue_date ?? today, due: inv?.due_date ?? addDays(today, s.terms_days), notes: inv?.notes ?? '' })
  const [id] = useState(inv?.id ?? crypto.randomUUID())
  const [custom, setCustom] = useState((inv?.items ?? []).filter(i => i.source !== 'work').map(i => ({ d: i.description, a: plain(i.amount_cents) })))
  const avail = data.work.filter(w => (w.invoice_id === id || workStatus(w, data.invoices) === 'Unbilled') && (!w.client_id || w.client_id === v.client)).sort((a, b) => a.date.localeCompare(b.date))
  const [picked, setPicked] = useState(new Set(inv ? data.work.filter(w => w.invoice_id === inv.id).map(w => w.id) : []))
  const work = avail.filter(w => picked.has(w.id))
  const days = dailyTotals(work)
  const items = [...buildWorkItems(work), ...custom.filter(c => c.d.trim() || c.a.trim()).map(c => ({ description: c.d.trim(), amount_cents: parseCents(c.a) ?? NaN }))]
  const t = totals({ items, gst: s.gst_registered })
  const submit = async () => {
    const number = v.number.trim()
    if (!number) return 'Enter an invoice number.'
    if (!data.clients.some(c => c.id === v.client)) return 'Choose a client. You can add one in Settings.'
    if (!isDate(v.issue) || !isDate(v.due) || v.due < v.issue) return 'The due date must be on or after the issue date.'
    if (items.some(i => !i.description || Number.isNaN(i.amount_cents))) return 'Each custom line needs a description and an amount.'
    if (!items.length) return 'Choose some work or add a line.'
    const base: Invoice = { id, number, client_id: v.client, status: 'draft', issue_date: v.issue, due_date: v.due, sent_date: null, paid_date: null, gst: s.gst_registered, items, daily: days, supplier: null, bill_to: null, notes: v.notes.trim() }
    const linked = data.work.map(w => ({ ...w, invoice_id: work.some(x => x.id === w.id) ? id : null }))
    return save(() => store.saveInvoice(refreshDraft(base, linked, s, data.clients), work.map(w => w.id)), 'Draft saved')
  }
  return (
    <FormDialog title={inv ? `Edit ${inv.number}` : 'New invoice'} onClose={onClose} save="Save draft" submit={submit} onDelete={inv && (() => save(() => store.deleteInvoice(inv.id), 'Draft deleted'))}>
      <Field label="Number"><input {...bind('number')} /></Field>
      <Field label="Client"><select {...bind('client')}><option value="">Choose a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Issue date"><input type="date" value={v.issue} onChange={e => set({ ...v, issue: e.target.value, due: isDate(e.target.value) ? addDays(e.target.value, s.terms_days) : v.due })} /></Field>
      <Field label="Due date"><input type="date" {...bind('due')} /></Field>
      <fieldset className="wide">
        <legend className="label">Unbilled work</legend>
        {avail.length > 0 && <button type="button" className="btn btn-quiet mb-2" onClick={() => setPicked(work.length === avail.length ? new Set() : new Set(avail.map(w => w.id)))}>{work.length === avail.length ? 'Clear all' : 'Select all'}</button>}
        {!avail.length && <p className="hint">No unbilled work for this client.</p>}
        <div className="rows">{avail.map(w => <label key={w.id} className="flex items-center gap-3 py-2.5"><input type="checkbox" checked={picked.has(w.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(w.id); else n.delete(w.id); setPicked(n) }} /><span className="flex-1">{longDate(w.date)} {w.site}<span className="hint block">{hrs(minutesOf(w))} hours</span></span><b>{aud(earningsOf(w))}</b></label>)}</div>
      </fieldset>
      {days.length > 0 && <div className="wide rounded-md bg-lichen p-3"><p className="label">Daily breakdown, not printed</p>{days.map(d => <p key={d.date} className="flex justify-between"><span>{longDate(d.date)}, {hrs(d.minutes)} h</span><span>{aud(d.cents)}</span></p>)}<p className="hint mt-2">Prints as one “Gardening services” line.</p></div>}
      <fieldset className="wide grid gap-2">
        <legend className="label">Custom lines</legend>
        {custom.map((c, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-2"><input aria-label={`Line ${i + 1} description`} placeholder="Description" value={c.d} onChange={e => setCustom(custom.map((x, k) => (k === i ? { ...x, d: e.target.value } : x)))} /><input aria-label={`Line ${i + 1} amount`} inputMode="decimal" placeholder="0.00" value={c.a} onChange={e => setCustom(custom.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} /><button type="button" className="btn btn-danger !px-2" onClick={() => setCustom(custom.filter((_, k) => k !== i))}>Remove</button></div>)}
        <button type="button" className="btn btn-quiet justify-self-start" onClick={() => setCustom([...custom, { d: '', a: '' }])}>Add line</button>
      </fieldset>
      <Field label="Private notes" wide><textarea rows={2} {...bind('notes')} /></Field>
      <p className="wide text-right font-display text-xl font-bold">Total {Number.isNaN(t.total) ? 'not ready' : aud(t.total)}{t.gst ? ` including ${aud(t.gst)} GST` : ''}</p>
    </FormDialog>
  )
}

function PaidForm({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const { store, today } = useApp()
  const save = useSave()
  const { v, bind } = useText({ on: inv.paid_date ?? today })
  return <FormDialog title={`${inv.number} payment`} onClose={onClose} save="Mark as paid" submit={async () => (isDate(v.on) ? save(() => store.setStatus({ ...inv, status: 'paid', paid_date: v.on }), `${inv.number} marked as paid`) : 'Enter the payment date.')}><Field label="Paid on" wide><input type="date" {...bind('on')} /></Field></FormDialog>
}

export default function Invoices() {
  const { data, store, today, act } = useApp()
  const [edit, setEdit] = useState<Invoice | 'new' | null>(null), [paying, setPaying] = useState<Invoice | null>(null), [preview, setPreview] = useState<{ inv: Invoice; blob: Blob } | null>(null)
  const [filter, setFilter] = useState('all')
  const pdf = async (i: Invoice) => new Blob([(await renderInvoice(i)) as BlobPart], { type: 'application/pdf' })
  const send = (i: Invoice) => {
    const b = data.settings
    if (!b.business.name || !b.business.abn || !b.bank.bsb || !b.bank.account_number) return act(async () => { throw new Error('Add your name, ABN and bank details in Settings first.') })
    return act(() => store.saveInvoice({ ...i, status: 'sent', sent_date: today }, data.work.filter(w => w.invoice_id === i.id).map(w => w.id)), `${i.number} marked as sent`)
  }
  const rows = data.invoices.filter(i => filter === 'all' || effectiveStatus(i, today) === filter).sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true }))
  const sum = (f: (i: Invoice) => boolean) => aud(data.invoices.filter(f).reduce((a, i) => a + totals(i).total, 0))
  return (
    <>
      <Head title="Invoices"><button className="btn" onClick={() => setEdit('new')}>New invoice</button></Head>
      <Figures items={[['Awaiting payment', sum(i => i.status === 'sent')], ['Overdue', sum(i => effectiveStatus(i, today) === 'overdue')], ['Paid', sum(i => i.status === 'paid')]]} />
      <div className="mb-4 flex flex-wrap gap-2">{['all', 'draft', 'sent', 'overdue', 'paid'].map(f => <button key={f} aria-pressed={f === filter} className={`btn ${f === filter ? '' : 'btn-quiet'}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
      {!rows.length && <Empty>{filter === 'all' ? 'Create an invoice from your unbilled hours.' : `No ${filter} invoices.`}</Empty>}
      <div className="grid gap-3">{rows.map(i => (
        <article key={i.id} className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="flex items-center gap-2">{i.number} <Tag s={effectiveStatus(i, today)} /></h2><p>{i.bill_to?.name ?? 'No client'}</p><p className="hint">Issued {longDate(i.issue_date)}, due {longDate(i.due_date)}{i.status === 'paid' ? `, paid ${i.paid_date ? longDate(i.paid_date) : '(date not entered)'}` : ''}</p></div>
            <b className="font-display text-2xl">{aud(totals(i).total)}</b>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-quiet" onClick={() => act(async () => download(await pdf(i), `Invoice ${i.number}.pdf`))}>Download PDF</button>
            <button className="btn btn-quiet" onClick={() => act(async () => setPreview({ inv: i, blob: await pdf(i) }))}>Preview</button>
            {i.status === 'draft' && <><button className="btn btn-quiet" onClick={() => setEdit(i)}>Edit</button><button className="btn" onClick={() => send(i)}>Mark as sent</button></>}
            {i.status === 'sent' && <><button className="btn" onClick={() => setPaying(i)}>Mark as paid</button><button className="btn btn-danger" onClick={() => act(() => store.setStatus({ ...i, status: 'draft', sent_date: null }), `${i.number} moved to draft`)}>Back to draft</button></>}
            {i.status === 'paid' && <><button className="btn btn-quiet" onClick={() => setPaying(i)}>{i.paid_date ? 'Change' : 'Add'} payment date</button><button className="btn btn-danger" onClick={() => act(() => store.setStatus({ ...i, status: 'sent', paid_date: null }), `${i.number} marked as unpaid`)}>Mark as unpaid</button></>}
          </div>
        </article>))}</div>
      {edit && <Editor inv={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {paying && <PaidForm inv={paying} onClose={() => setPaying(null)} />}
      {preview && <Dialog full title={`Invoice ${preview.inv.number}`} onClose={() => setPreview(null)}><PdfView blob={preview.blob} /></Dialog>}
    </>
  )
}
