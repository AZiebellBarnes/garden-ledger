import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sharedWork, type SharedWork } from '../data/sharing'
import { today } from '../lib/dates'
import { DayReport } from '../components/DayReport'
import { Head } from '../components/ui'

/** All a contractor's login shows. The database sends nothing else. */
export default function ContractorHome({ client, signOut }: { client: SupabaseClient; signOut: () => void }) {
  const [rows, setRows] = useState<SharedWork[] | null>(null), [err, setErr] = useState('')
  const load = useCallback(() => { setErr(''); sharedWork(client).then(setRows).catch(e => setErr(e.message)) }, [client])
  useEffect(load, [load])
  const names = [...new Set(rows?.map(r => r.business).filter(Boolean))].join(', ')
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
      <Head title={names ? `Work by ${names}` : 'Work hours'}><button className="btn btn-quiet" onClick={load}>Refresh</button><button className="btn btn-quiet" onClick={signOut}>Sign out</button></Head>
      {err && <p role="alert" className="mb-4 font-semibold text-rust">The hours could not be loaded: {err}</p>}
      {rows ? <DayReport rows={rows} today={today()} /> : !err && <p>Loading…</p>}
    </main>
  )
}
