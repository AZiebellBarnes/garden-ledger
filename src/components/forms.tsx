import { useState, type ChangeEvent } from 'react'
import { useApp } from '../app'
import { CATEGORIES, type Category, type Client, type Fuel, type Receipt, type Trip, type Work } from '../lib/types'
import { validate } from '../lib/validate'
import { aud, parseCents, parseScaled, plain } from '../lib/money'
import { earningsCents, hrs, workMinutes } from '../lib/hours'
import { workLocked } from '../lib/invoices'
import { Check, Field, FormDialog, useSave } from './ui'
import { ACCEPT, makeThumb } from './files'

type P<T> = { row?: T; onClose: () => void }
const BAD = -1 // unreadable numbers become invalid, so validation reports them
export function useText<T extends Record<string, string>>(init: T) {
  const [v, set] = useState(init)
  const bind = (k: keyof T) => ({ value: v[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set({ ...v, [k]: e.target.value }) })
  return { v, set, bind }
}
const tenths = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n / 10))

export function WorkForm({ row, onClose }: P<Work>) {
  const { data, store, today } = useApp()
  const save = useSave()
  const last = [...data.work].sort((a, b) => b.date.localeCompare(a.date))[0]
  const cid = row ? row.client_id ?? '' : last?.client_id ?? data.clients[0]?.id ?? ''
  const rateFor = (id: string) => plain(data.clients.find(c => c.id === id)?.rate_cents ?? data.settings.default_rate_cents)
  const { v, set, bind } = useText({ date: row?.date ?? today, start: row?.start ?? '', finish: row?.finish ?? '', brk: row ? String(row.break_min) : '', client: cid, site: row?.site ?? '', rate: row ? plain(row.rate_cents) : rateFor(cid), notes: row?.notes ?? '' })
  const locked = !!row && workLocked(row, data.invoices)
  const build = (): Work => ({ id: row?.id ?? crypto.randomUUID(), date: v.date, start: v.start, finish: v.finish, break_min: v.brk.trim() ? parseScaled(v.brk, 0) ?? BAD : 0, client_id: v.client || null, site: v.site.trim(), rate_cents: parseCents(v.rate) ?? BAD, notes: v.notes.trim(), invoice_id: row?.invoice_id ?? null })
  const w = build(), mins = workMinutes(w.start, w.finish, w.break_min)
  const [id] = useState(w.id)
  const submit = async () => { const r = { ...build(), id }; return locked ? 'These hours are locked because their invoice has been sent.' : validate('work', r) ?? save(() => store.put('work', r), 'Hours saved') }
  return (
    <FormDialog title={row ? 'Edit hours' : 'Log hours'} onClose={onClose} submit={submit} save="Save hours" onDelete={row && !locked ? () => save(() => store.remove('work', row.id), 'Hours deleted') : undefined}>
      {locked && <p className="wide hint">These hours are on a sent invoice, so they can’t be changed.</p>}
      <Field label="Date" wide><input type="date" {...bind('date')} /></Field>
      <Field label="Start"><input type="time" {...bind('start')} /></Field>
      <Field label="Finish"><input type="time" {...bind('finish')} /></Field>
      <Field label="Unpaid break (min)"><input inputMode="numeric" placeholder="0" {...bind('brk')} /></Field>
      <Field label="Hourly rate"><input inputMode="decimal" {...bind('rate')} /></Field>
      <Field label="Client"><select value={v.client} onChange={e => set({ ...v, client: e.target.value, rate: rateFor(e.target.value) })}><option value="">No client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Site"><input {...bind('site')} list="sites" /></Field>
      <datalist id="sites">{[...new Set(data.work.map(x => x.site).filter(Boolean))].map(s => <option key={s} value={s} />)}</datalist>
      <Field label="Notes" wide><textarea rows={2} {...bind('notes')} /></Field>
      <p className="wide rounded-md bg-lichen px-3 py-2 font-semibold">{mins === null ? 'Enter start and finish times to see the total.' : `${hrs(mins)} hours, ${aud(earningsCents(mins, Math.max(0, w.rate_cents)))}`}</p>
    </FormDialog>
  )
}

export function TripForm({ row, onClose }: P<Trip>) {
  const { data, store, today } = useApp()
  const save = useSave()
  const max = Math.max(0, ...data.trips.map(t => t.end_tenths))
  const { v, bind } = useText({ date: row?.date ?? today, a: row ? tenths(row.start_tenths) : max ? tenths(max) : '', b: tenths(row?.end_tenths), purpose: row?.purpose ?? '' })
  const [business, setBusiness] = useState(row?.business ?? true)
  const [id] = useState(row?.id ?? crypto.randomUUID())
  const t: Trip = { id, date: v.date, start_tenths: parseScaled(v.a, 1) ?? BAD, end_tenths: parseScaled(v.b, 1) ?? BAD, purpose: v.purpose.trim(), business }
  return (
    <FormDialog title={row ? 'Edit trip' : 'Add trip'} onClose={onClose} save="Save trip" submit={async () => validate('trips', t) ?? save(() => store.put('trips', t), 'Trip saved')} onDelete={row && (() => save(() => store.remove('trips', row.id), 'Trip deleted'))}>
      <Field label="Date" wide><input type="date" {...bind('date')} /></Field>
      <Field label="Start odometer (km)"><input inputMode="decimal" {...bind('a')} /></Field>
      <Field label="End odometer (km)"><input inputMode="decimal" {...bind('b')} /></Field>
      <Field label="Purpose or job location" wide><input {...bind('purpose')} /></Field>
      <Check label="Business trip" checked={business} onChange={setBusiness} hint="Driving between home and a regular workplace usually counts as personal." />
      <p className="wide rounded-md bg-lichen px-3 py-2 font-semibold">{t.start_tenths >= 0 && t.end_tenths > t.start_tenths ? `${(t.end_tenths - t.start_tenths) / 10} km` : 'Enter both readings to see the distance.'}</p>
    </FormDialog>
  )
}

export function FuelForm({ row, onClose }: P<Fuel>) {
  const { data, store, today } = useApp()
  const save = useSave()
  const { v, set, bind } = useText({ date: row?.date ?? today, litres: row ? String(row.litres_ml / 1000) : '', per: '', total: row ? plain(row.cost_cents) : '', odo: tenths(row?.odo_tenths), receipt: row?.receipt_id ?? '' })
  const [id] = useState(row?.id ?? crypto.randomUUID())
  const ml = parseScaled(v.litres, 3), per = parseScaled(v.per, 4)
  const cost = v.total.trim() ? parseCents(v.total) : ml !== null && per !== null ? Math.round((ml * per) / 100000) : null
  const f: Fuel = { id, date: v.date, litres_ml: ml ?? BAD, cost_cents: cost ?? BAD, odo_tenths: v.odo.trim() ? parseScaled(v.odo, 1) ?? BAD : null, receipt_id: v.receipt || null }
  return (
    <FormDialog title={row ? 'Edit fuel' : 'Add fuel'} onClose={onClose} save="Save fuel" submit={async () => validate('fuel', f) ?? save(() => store.put('fuel', f), 'Fuel saved')} onDelete={row && (() => save(() => store.remove('fuel', row.id), 'Fuel deleted'))}>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Litres"><input inputMode="decimal" {...bind('litres')} /></Field>
      <Field label="Price per litre ($)"><input inputMode="decimal" value={v.per} onChange={e => set({ ...v, per: e.target.value, total: '' })} /></Field>
      <Field label="Total cost ($)" hint={!v.total && cost !== null ? `Works out to ${aud(cost)}` : 'Or enter the price per litre'}><input inputMode="decimal" {...bind('total')} /></Field>
      <Field label="Odometer (km)"><input inputMode="decimal" {...bind('odo')} /></Field>
      <Field label="Receipt"><select {...bind('receipt')}><option value="">No receipt</option>{[...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).filter(r => r.category === 'Fuel' || r.id === v.receipt).map(r => <option key={r.id} value={r.id}>{r.date} {r.vendor} {aud(r.amount_cents)}</option>)}</select></Field>
    </FormDialog>
  )
}

const VEHICLE: Category[] = ['Fuel', 'Vehicle Maintenance']
export function ReceiptForm({ row, onClose }: P<Receipt>) {
  const { store, today } = useApp()
  const save = useSave()
  const { v, set, bind } = useText({ date: row?.date ?? today, vendor: row?.vendor ?? '', amount: row ? plain(row.amount_cents) : '', category: (row?.category ?? 'Supplies') as string, pct: String(row?.business_pct ?? 100), notes: row?.notes ?? '' })
  const [gst, setGst] = useState(row?.gst_included ?? true), [asset, setAsset] = useState(row?.is_asset ?? false), [veh, setVeh] = useState(row?.is_vehicle ?? false)
  const [file, setFile] = useState<File | null>(null)
  const [id] = useState(row?.id ?? crypto.randomUUID())
  const submit = async () => {
    const r: Receipt = { id, date: v.date, vendor: v.vendor.trim(), amount_cents: parseCents(v.amount) ?? BAD, category: v.category as Category, gst_included: gst, notes: v.notes.trim(), file: row?.file ?? null, thumb: row?.thumb ?? null, mime: row?.mime ?? null, business_pct: parseScaled(v.pct, 0) ?? BAD, is_asset: asset, is_vehicle: veh }
    const bad = validate('receipts', r)
    if (bad) return bad
    if (file && !ACCEPT.includes(file.type)) return 'Use a JPG, PNG, WEBP or PDF file.'
    if (file && file.size > 15 * 1024 * 1024) return 'That file is over 15 MB. Choose a smaller one.'
    return save(async () => {
      if (file) {
        const thumb = await makeThumb(file), key = crypto.randomUUID()
        await store.putFile(`${key}/file`, file)
        await store.putFile(`${key}/thumb`, thumb)
        Object.assign(r, { file: `${key}/file`, thumb: `${key}/thumb`, mime: file.type })
      }
      await store.put('receipts', r)
      if (file) await removeFiles(row)
    }, 'Receipt saved')
  }
  // A leftover file is harmless, so it never blocks the change itself.
  const removeFiles = async (x?: Receipt) => { for (const p of [x?.file, x?.thumb]) if (p) await store.removeFile(p).catch(() => {}) }
  return (
    <FormDialog title={row ? 'Edit receipt' : 'Add receipt'} onClose={onClose} save="Save receipt" submit={submit} onDelete={row && (() => save(async () => { await store.remove('receipts', row.id); await removeFiles(row) }, 'Receipt deleted'))}>
      <Field label={row?.file ? 'Replace file' : 'Photo or PDF'} wide hint="JPG, PNG, WEBP or PDF, up to 15 MB"><input type="file" accept={ACCEPT.join(',')} onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Amount ($)"><input inputMode="decimal" {...bind('amount')} /></Field>
      <Field label="Vendor"><input {...bind('vendor')} /></Field>
      <Field label="Category"><select value={v.category} onChange={e => { set({ ...v, category: e.target.value }); setVeh(VEHICLE.includes(e.target.value as Category)) }}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Business use (%)"><input inputMode="numeric" {...bind('pct')} /></Field>
      <div className="wide">
        <Check label="GST included" checked={gst} onChange={setGst} />
        <Check label="Car cost" checked={veh} onChange={setVeh} hint="Fuel, rego, insurance, servicing. Not deducted separately while you use cents per km." />
        <Check label="Equipment kept for more than a year" checked={asset} onChange={setAsset} hint="Left out of deductions until you decide how to write it off." />
      </div>
      <Field label="Notes" wide><textarea rows={2} {...bind('notes')} /></Field>
    </FormDialog>
  )
}

export function ClientForm({ row, onClose }: P<Client>) {
  const { store } = useApp()
  const save = useSave()
  const { v, bind } = useText({ name: row?.name ?? '', lines: row?.lines.join('\n') ?? '', rate: row?.rate_cents == null ? '' : plain(row.rate_cents) })
  const [id] = useState(row?.id ?? crypto.randomUUID())
  const submit = async () => {
    const rate = v.rate.trim() ? parseCents(v.rate) : null
    if (v.rate.trim() && (rate === null || rate < 0)) return 'Check the hourly rate.'
    const c: Client = { id, name: v.name.trim(), lines: v.lines.split('\n').map(s => s.trim()).filter(Boolean), rate_cents: rate }
    return validate('clients', c) ?? save(() => store.put('clients', c), 'Client saved')
  }
  return (
    <FormDialog title={row ? 'Edit client' : 'Add client'} onClose={onClose} save="Save client" submit={submit} onDelete={row && (() => save(() => store.remove('clients', row.id), 'Client deleted'))}>
      <Field label="Business name" wide><input {...bind('name')} /></Field>
      <Field label="Address, one line each" wide><textarea rows={3} {...bind('lines')} /></Field>
      <Field label="Hourly rate" hint="Leave blank to use your default"><input inputMode="decimal" {...bind('rate')} /></Field>
    </FormDialog>
  )
}
