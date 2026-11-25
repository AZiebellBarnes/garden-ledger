import { useState } from 'react'
import { useApp } from '../app'
import type { Settings } from '../lib/types'
import { fyOf, fyRange } from '../lib/dates'
import { aud } from '../lib/money'
import { summarise } from '../lib/tax'
import { Check, Field, Head } from '../components/ui'

export const yearsIn = (dates: string[], today: string) => [...new Set([fyOf(today), ...dates.map(fyOf)])].sort().reverse()
export function Pct({ label, value, onSave }: { label: string; value: number; onSave: (n: number) => void }) {
  const [t, setT] = useState(String(value))
  const commit = () => { const n = Number(t); if (t.trim() && n >= 0 && n <= 100) { if (n !== value) onSave(n) } else setT(String(value)) }
  return <Field label={label}><input inputMode="decimal" value={t} onChange={e => setT(e.target.value)} onBlur={commit} /></Field>
}
export default function Tax() {
  const { data, today, store, act } = useApp()
  const [fy, setFy] = useState(fyOf(today))
  const st = data.settings, s = summarise(data, fy, today)
  const put = (o: Partial<Settings>) => void act(() => store.saveSettings({ ...st, ...o }))
  const current = fy === fyOf(today)
  const lines = (title: string, rows: [string, number, string?][]) => (
    <section className="panel"><h2 className="mb-2">{title}</h2><dl className="rows">{rows.map(([k, v, note]) => <div key={k} className="flex justify-between gap-4 py-2"><dt>{k}{note && <span className="hint block">{note}</span>}</dt><dd className="font-semibold">{aud(v)}</dd></div>)}</dl></section>
  )
  return (
    <>
      <Head title="Tax set-aside"><select aria-label="Financial year" className="!w-auto" value={fy} onChange={e => setFy(e.target.value)}>{yearsIn([...data.invoices.map(i => i.issue_date), ...data.receipts.map(r => r.date)], today).map(y => <option key={y}>{y}</option>)}</select></Head>
      {current && <section className="mb-6 rounded-xl bg-marigold p-6">
        <h2>Recommended weekly tax set-aside</h2>
        <p className="my-1 font-display text-6xl font-bold tracking-tight">{aud(s.weeklyTotal)}</p>
        <p>{st.buffer_on ? `Your custom ${st.buffer_pct}%` : `${(s.rate * 100).toFixed(1)}%`} of {aud(s.avgWeekly)} average weekly income{s.weeklyGst ? `, plus ${aud(s.weeklyGst)} GST` : ''}. By now you should have {aud(s.setAsideSoFar)} put away.</p>
        {s.weeklySuper > 0 && <p className="mt-2 font-semibold">Also move {aud(s.weeklySuper)} to super, separately.</p>}
      </section>}
      {s.estimated && <p className="mb-4 border-l-4 border-rust pl-3">No rates are stored for {fy}, so the nearest year’s are used. Enter them in Settings.</p>}
      {current && s.weeks < 4 && <p className="hint mb-4">This average covers {Math.round(s.weeks * 7)} days, so expect it to move as you log more income.</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:grid-cols-2">
        <section className="panel grid-form">
          <h2 className="wide">How it’s worked out</h2>
          <Field label="Income counted"><select value={st.income_basis} onChange={e => put({ income_basis: e.target.value as Settings['income_basis'] })}><option value="all">All sent and paid</option><option value="paid">Paid only</option></select></Field>
          <Field label="Weekly average over"><select value={st.window} onChange={e => put({ window: e.target.value as Settings['window'] })}><option value="4">Last 4 weeks</option><option value="8">Last 8 weeks</option><option value="ytd">Year to date</option></select></Field>
          <Check label="Registered for GST (10%)" checked={st.gst_registered} onChange={v => put({ gst_registered: v })} hint="Adds GST to new invoices. Registration is required once turnover reaches $75,000." />
          <Check label="Voluntary super" checked={st.super_on} onChange={v => put({ super_on: v })} hint="Assumes you give your fund a notice of intent to claim." />
          {st.super_on && <Pct key={st.super_pct} label="Super (%)" value={st.super_pct} onSave={n => put({ super_pct: n })} />}
          <Check label="Use my own tax percentage" checked={st.buffer_on} onChange={v => put({ buffer_on: v })} />
          {st.buffer_on && <Pct key={st.buffer_pct} label="Tax buffer (%)" value={st.buffer_pct} onSave={n => put({ buffer_pct: n })} />}
          <Check label="I have a HELP debt" checked={st.help_debt} onChange={v => put({ help_debt: v })} />
        </section>
        {lines('So far this year', [['Income, excluding GST', s.income], ['Receipt deductions', -s.otherDeductions], ['Vehicle deduction', -s.vehicleDeduction, s.year.method === 'cents_per_km' ? `${s.rates.cents_per_km}c per km, up to 5,000 km` : `Logbook, ${s.year.logbook_pct}% business`], ['Net income', s.netYtd], ...(s.assetsExcluded ? [['Equipment not deducted yet', s.assetsExcluded, 'Needs a write-off decision'] as [string, number, string]] : []), ...(st.gst_registered ? [['GST collected', s.gstCollected] as [string, number], ['GST credits', -s.gstCredits] as [string, number]] : [])])}
        {lines(`Projected to ${fyRange(fy)[1].slice(0, 4)} year end`, [['Business income', s.projectedIncome], ['Deductions', -s.projectedDeductions, 'Recorded so far only'], ['Wages', s.year.gross_cents, s.year.gross_cents ? undefined : 'Add any wages since 1 July in Settings'], ...(s.superDeduction ? [['Super deduction', -s.superDeduction] as [string, number]] : []), ['Taxable income', s.projectedTaxable]])}
        {lines('Estimated tax', [['Income tax', s.incomeTax, 'After the low income tax offset'], ['Medicare levy', s.medicareLevy], ...(st.help_debt ? [['HELP repayment', s.help, `Starts above ${aud(s.rates.help.from)}`] as [string, number, string]] : []), ['Already withheld', -s.withheld], ['Estimated owing', s.owed]])}
      </div>
      <p className="hint mt-5">An estimate for budgeting, using resident rates. It leaves out the small business tax offset, which may lower your bill. The 2026–27 Medicare low-income threshold of $28,011 is the last known figure. Check with the ATO or a registered tax agent before lodging.</p>
    </>
  )
}
