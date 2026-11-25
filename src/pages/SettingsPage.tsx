import { useState, type FormEvent } from 'react'
import { useApp } from '../app'
import type { Client, Rates, Settings, YearSettings } from '../lib/types'
import { fyOf } from '../lib/dates'
import { parseCents, parseScaled, plain } from '../lib/money'
import { ratesFor, yearOf } from '../lib/tax'
import { makeBackup, restore } from '../lib/backup'
import { Field, Head, download } from '../components/ui'
import { ClientForm, useText } from '../components/forms'

function need(n: number | null, what: string, max = Infinity): number { if (n === null || n < 0 || n > max) throw new Error(`Check ${what}.`); return n }

function Profile({ s }: { s: Settings }) {
  const { store, act } = useApp()
  const { v, bind } = useText({ name: s.business.name, abn: s.business.abn, phone: s.business.phone, email: s.business.email, address: s.business.address.join('\n'), an: s.bank.account_name, bsb: s.bank.bsb, acc: s.bank.account_number, rate: plain(s.default_rate_cents), prefix: s.invoice_prefix, pad: String(s.invoice_pad), terms: String(s.terms_days), car: s.vehicle.description, plate: s.vehicle.plate })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act(async () => store.saveSettings({
      ...s, business: { name: v.name.trim(), abn: v.abn.trim(), phone: v.phone.trim(), email: v.email.trim(), address: v.address.split('\n').map(x => x.trim()).filter(Boolean) },
      bank: { account_name: v.an.trim(), bsb: v.bsb.trim(), account_number: v.acc.trim() }, default_rate_cents: need(parseCents(v.rate), 'the hourly rate'),
      invoice_prefix: v.prefix, invoice_pad: need(parseScaled(v.pad, 0), 'the number of digits', 9), terms_days: need(parseScaled(v.terms, 0), 'the payment terms', 365), vehicle: { description: v.car.trim(), plate: v.plate.trim() }
    }), 'Settings saved')
  }
  return (
    <form onSubmit={submit} className="panel grid-form">
      <h2 className="wide">Your business</h2>
      <Field label="Name"><input {...bind('name')} /></Field><Field label="ABN"><input {...bind('abn')} /></Field>
      <Field label="Phone"><input type="tel" {...bind('phone')} /></Field><Field label="Email" hint="Prints on invoices if filled in"><input type="email" {...bind('email')} /></Field>
      <Field label="Address" wide hint="Prints on invoices if filled in"><textarea rows={2} {...bind('address')} /></Field>
      <h2 className="wide">Bank details</h2>
      <Field label="Account name" wide><input {...bind('an')} /></Field><Field label="BSB"><input {...bind('bsb')} /></Field><Field label="Account number"><input {...bind('acc')} /></Field>
      <h2 className="wide">Invoicing</h2>
      <Field label="Default hourly rate ($)"><input inputMode="decimal" {...bind('rate')} /></Field><Field label="Days until due"><input inputMode="numeric" {...bind('terms')} /></Field>
      <Field label="Number prefix"><input {...bind('prefix')} /></Field><Field label="Digits"><input inputMode="numeric" {...bind('pad')} /></Field>
      <h2 className="wide">Vehicle</h2>
      <Field label="Description"><input {...bind('car')} /></Field><Field label="Number plate"><input {...bind('plate')} /></Field>
      <button className="btn wide justify-self-start">Save settings</button>
    </form>
  )
}
function Year({ fy }: { fy: string }) {
  const { data, store, act } = useApp()
  const s = data.settings, y = yearOf(data, fy), { rates: r } = ratesFor(fy, s.rates)
  const { v, bind } = useText({ gross: plain(y.gross_cents), held: plain(y.withheld_cents), method: y.method as string, pct: String(y.logbook_pct), from1: plain(r.brackets[0][0]), from2: plain(r.brackets[1][0]), from3: plain(r.brackets[2][0]), from4: plain(r.brackets[3][0]), p1: String(r.brackets[0][1]), p2: String(r.brackets[1][1]), p3: String(r.brackets[2][1]), p4: String(r.brackets[3][1]), med: plain(r.medicare_threshold), h1: plain(r.help.from), h2: plain(r.help.mid), h3: plain(r.help.top), km: String(r.cents_per_km), cap: plain(r.super_cap) })
  const pct = (t: string, what: string) => need(t.trim() && Number.isFinite(Number(t)) ? Number(t) : null, what, 200)
  const $ = (t: string, what: string) => need(parseCents(t), what)
  const saveYear = (e: FormEvent) => { e.preventDefault(); void act(async () => { const next: YearSettings = { gross_cents: $(v.gross, 'gross wages'), withheld_cents: $(v.held, 'tax withheld'), method: v.method as YearSettings['method'], logbook_pct: need(pct(v.pct, 'the logbook percentage'), 'the logbook percentage', 100) }; await store.saveSettings({ ...s, by_fy: { ...s.by_fy, [fy]: next } }) }, `${fy} saved`) }
  const saveRates = (e: FormEvent) => {
    e.preventDefault()
    void act(async () => {
      const next: Rates = { brackets: [[$(v.from1, 'threshold 1'), pct(v.p1, 'rate 1')], [$(v.from2, 'threshold 2'), pct(v.p2, 'rate 2')], [$(v.from3, 'threshold 3'), pct(v.p3, 'rate 3')], [$(v.from4, 'threshold 4'), pct(v.p4, 'rate 4')]], medicare_threshold: $(v.med, 'the Medicare threshold'), help: { from: $(v.h1, 'the HELP threshold'), mid: $(v.h2, 'the HELP 17% threshold'), top: $(v.h3, 'the HELP 10% threshold') }, cents_per_km: pct(v.km, 'cents per km'), super_cap: $(v.cap, 'the super cap') }
      if (next.brackets.some((b, i) => i > 0 && b[0] <= next.brackets[i - 1][0])) throw new Error('Tax thresholds must go up.')
      await store.saveSettings({ ...s, rates: { ...s.rates, [fy]: next } })
    }, `${fy} rates saved`)
  }
  const bracket = (f: 'from1' | 'from2' | 'from3' | 'from4', p: 'p1' | 'p2' | 'p3' | 'p4') => <><Field label="Income above ($)"><input inputMode="decimal" {...bind(f)} /></Field><Field label="Tax rate (%)"><input inputMode="decimal" {...bind(p)} /></Field></>
  return (
    <section className="panel">
      <form onSubmit={saveYear} className="grid-form">
        <h2 className="wide">Financial year {fy}</h2>
        <Field label="Gross wages from other jobs ($)" hint="Pay since 1 July"><input inputMode="decimal" {...bind('gross')} /></Field><Field label="Tax withheld from them ($)"><input inputMode="decimal" {...bind('held')} /></Field>
        <Field label="Vehicle method"><select {...bind('method')}><option value="cents_per_km">Cents per km</option><option value="logbook">Logbook</option></select></Field>
        {v.method === 'logbook' && <Field label="Logbook business use (%)" hint="From a 12-week log"><input inputMode="decimal" {...bind('pct')} /></Field>}
        <button className="btn wide justify-self-start">Save year</button>
      </form>
      <details className="mt-5"><summary className="cursor-pointer py-2 font-semibold">Edit {fy} tax rates</summary>
        <form onSubmit={saveRates} className="grid-form mt-3">
          {bracket('from1', 'p1')}{bracket('from2', 'p2')}{bracket('from3', 'p3')}{bracket('from4', 'p4')}
          <Field label="Medicare threshold ($)"><input {...bind('med')} /></Field><Field label="HELP starts above ($)"><input {...bind('h1')} /></Field>
          <Field label="HELP 17% above ($)"><input {...bind('h2')} /></Field><Field label="HELP 10% of all above ($)"><input {...bind('h3')} /></Field>
          <Field label="Cents per km"><input {...bind('km')} /></Field><Field label="Super cap ($)"><input {...bind('cap')} /></Field>
          <button className="btn wide justify-self-start">Save rates</button>
        </form>
      </details>
    </section>
  )
}
export default function SettingsPage() {
  const { data, store, act, today } = useApp()
  const [client, setClient] = useState<Client | 'new' | null>(null)
  const [nonce, setNonce] = useState(0)
  const fy = fyOf(today)
  return (
    <>
      <Head title="Settings" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <section className="panel"><div className="mb-2 flex items-center justify-between"><h2>Clients</h2><button className="btn btn-quiet" onClick={() => setClient('new')}>Add client</button></div>
          <div className="rows">{data.clients.map(c => <button key={c.id} className="block w-full py-2.5 text-left" onClick={() => setClient(c)}><b>{c.name}</b><span className="hint block">{c.lines.join(', ')}</span></button>)}</div>
          {!data.clients.length && <p className="text-stone">Add the business you invoice.</p>}
        </section>
        <Profile key={'p' + nonce} s={data.settings} />
        <Year key={fy + nonce} fy={fy} />
        <section className="panel">
          <h2 className="mb-2">Backup and import</h2>
          <p className="mb-3">A backup holds every record and receipt file. Keep it private: it includes your bank details.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <button className="btn btn-quiet self-end" onClick={() => act(async () => download(new Blob([JSON.stringify(await makeBackup(data, store))], { type: 'application/json' }), `Garden Ledger backup ${today}.json`), 'Backup downloaded')}>Download backup</button>
            <Field label="Import a backup or setup file"><input type="file" accept=".json,application/json" onChange={async e => {
              const el = e.currentTarget, f = el.files?.[0]
              if (f && (await act(async () => { let j; try { j = JSON.parse(await f.text()) } catch { throw new Error('That file is not a Garden Ledger backup.') } await restore(j, store) }, 'Import finished'))) setNonce(n => n + 1)
              el.value = ''
            }} /></Field>
          </div>
        </section>
      </div>
      {client && <ClientForm row={client === 'new' ? undefined : client} onClose={() => setClient(null)} />}
    </>
  )
}
