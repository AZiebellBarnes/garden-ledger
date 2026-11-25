import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../app'
import type { Viewer } from '../data/sharing'
import { sharedInvoice } from '../lib/sharing'
import { DayReport } from '../components/DayReport'
import { Field, Head } from '../components/ui'

export default function Contractor() {
  const { data, sharing, today, act } = useApp()
  const [list, setList] = useState<Viewer[] | null>(null), [err, setErr] = useState('')
  const [email, setEmail] = useState(''), [cid, setCid] = useState(data.clients[0]?.id ?? ''), [sure, setSure] = useState('')
  const load = () => sharing?.list().then(l => { setList(l); setErr('') }).catch(e => setErr(e.message))
  useEffect(() => { void load() }, [sharing])
  const name = (id: string) => data.clients.find(c => c.id === id)?.name ?? 'Deleted client'
  const add = async (e: FormEvent) => { e.preventDefault(); if (await act(() => sharing!.add(email, cid), 'Access given')) { setEmail(''); void load() } }
  const remove = async (v: Viewer) => { if (sure !== v.id) return setSure(v.id); setSure(''); if (await act(() => sharing!.remove(v.id), 'Access removed')) void load() }
  const unassigned = data.work.filter(w => !w.client_id).length
  return (
    <>
      <Head title="Contractor access" />
      <section className="panel mb-8">
        <h2 className="mb-2">Who can see your hours</h2>
        <p className="mb-4">They see dates, times, breaks, sites, hours, amounts and invoice numbers for their own business. They can’t see your notes, other clients, the invoices themselves, receipts, tax or bank details, and can’t change anything.</p>
        {!sharing && <p className="hint">Connect Supabase to give someone access.</p>}
        {err && <p role="alert" className="font-semibold text-rust">{err}</p>}
        {list && <div className="rows mb-4">{list.map(v => <div key={v.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><b className="block truncate">{v.email}</b><span className="hint">{name(v.client_id)}</span></span><button className="btn btn-danger" onClick={() => void remove(v)}>{sure === v.id ? 'Remove access?' : 'Remove'}</button></div>)}{!list.length && <p className="hint py-2">Nobody has access.</p>}</div>}
        {list && <form onSubmit={add} className="grid-form">
          <Field label="Their email" hint="Must match the login you create for them"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Their business"><select required value={cid} onChange={e => setCid(e.target.value)}><option value="">Choose a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <p className="hint wide">Give access first, then create the login in Supabase under Authentication, Users, Add user.</p>
          <button className="btn wide justify-self-start">Give access</button>
        </form>}
      </section>
      <h2 className="mb-3">What they see</h2>
      <div className="mb-4 max-w-md"><Field label="Preview for"><select value={cid} onChange={e => setCid(e.target.value)}><option value="">Choose a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
      {unassigned > 0 && <p className="hint mb-4">{unassigned} work {unassigned === 1 ? 'entry has' : 'entries have'} no client, so no contractor sees {unassigned === 1 ? 'it' : 'them'}.</p>}
      <DayReport rows={cid ? data.work.filter(w => w.client_id === cid).map(w => ({ ...w, invoice: sharedInvoice(w, data.invoices) })) : []} today={today} />
    </>
  )
}
