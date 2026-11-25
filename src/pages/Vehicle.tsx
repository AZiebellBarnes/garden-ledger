import { useState } from 'react'
import { useApp } from '../app'
import type { Fuel, Trip } from '../lib/types'
import { fyOf, fyRange, longDate } from '../lib/dates'
import { aud } from '../lib/money'
import { vehicleTotals } from '../lib/tax'
import { Empty, Figures, Head } from '../components/ui'
import { FuelForm, TripForm } from '../components/forms'

export default function Vehicle() {
  const { data, today } = useApp()
  const [trip, setTrip] = useState<Trip | 'new' | null>(null), [fuel, setFuel] = useState<Fuel | 'new' | null>(null)
  const fy = fyOf(today), v = vehicleTotals(data, fyRange(fy)), car = data.settings.vehicle
  const newest = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => y.date.localeCompare(x.date))
  return (
    <>
      <Head title="Fuel and distance"><button className="btn" onClick={() => setTrip('new')}>Add trip</button><button className="btn btn-quiet" onClick={() => setFuel('new')}>Add fuel</button></Head>
      {car.description && <p className="hint mb-4">{car.description}{car.plate && `, ${car.plate}`}. Totals for {fy}.</p>}
      <Figures items={[['Total distance', `${(v.total / 10).toLocaleString('en-AU')} km`], ['Business distance', `${(v.business / 10).toLocaleString('en-AU')} km`], ['Business use', `${v.pct.toFixed(1)}%`], ['Fuel spend', aud(v.fuel)], ['Litres', (v.litres / 1000).toFixed(1)]]} />
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section><h2 className="mb-2">Trips</h2>
          {data.trips.length ? <div className="panel rows">{newest(data.trips).map(t => <button key={t.id} className="flex w-full justify-between gap-3 py-2.5 text-left" onClick={() => setTrip(t)}><span><span className="block font-semibold">{t.purpose || 'No purpose entered'}</span><span className="hint">{longDate(t.date)}, {t.start_tenths / 10} to {t.end_tenths / 10}</span></span><span className="shrink-0 text-right"><b className="block">{(t.end_tenths - t.start_tenths) / 10} km</b><span className="hint">{t.business ? 'Business' : 'Personal'}</span></span></button>)}</div> : <Empty>Add a trip when you finish a drive. The next one starts from its end reading.</Empty>}
        </section>
        <section><h2 className="mb-2">Fuel</h2>
          {data.fuel.length ? <div className="panel rows">{newest(data.fuel).map(f => <button key={f.id} className="flex w-full justify-between gap-3 py-2.5 text-left" onClick={() => setFuel(f)}><span><span className="block font-semibold">{f.litres_ml / 1000} L</span><span className="hint">{longDate(f.date)}{f.receipt_id ? ', receipt linked' : ''}</span></span><span className="shrink-0 text-right"><b className="block">{aud(f.cost_cents)}</b><span className="hint">${(f.cost_cents * 10 / f.litres_ml).toFixed(3)}/L</span></span></button>)}</div> : <Empty>Add a fill-up to track fuel spend.</Empty>}
        </section>
      </div>
      {trip && <TripForm row={trip === 'new' ? undefined : trip} onClose={() => setTrip(null)} />}
      {fuel && <FuelForm row={fuel === 'new' ? undefined : fuel} onClose={() => setFuel(null)} />}
    </>
  )
}
