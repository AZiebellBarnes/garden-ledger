import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Data } from './lib/types'
import type { Store } from './data/store'
import { refreshDraft } from './lib/invoices'
import { today as now } from './lib/dates'

type Ctx = {
  data: Data; store: Store; today: string; local: boolean; signOut?: () => void
  /** Runs a change, reloads, and reports the result. Resolves to whether it worked. */
  act: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>
}
const C = createContext<Ctx | null>(null)
export const useApp = () => useContext(C)!

export function AppProvider({ store, local, signOut, children }: { store: Store; local: boolean; signOut?: () => void; children: ReactNode }) {
  const [raw, setRaw] = useState<Data | null>(null)
  const [fail, setFail] = useState('')
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  const [today, setToday] = useState(now())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reload = useCallback(async () => { setRaw(await store.load()); setFail('') }, [store])
  useEffect(() => { reload().catch(e => setFail(e.message)) }, [reload])
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') { setToday(now()); reload().catch(() => {}) } }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [reload])
  const act = useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    const say = (text: string, bad: boolean) => { clearTimeout(timer.current); setNote({ text, bad }); timer.current = setTimeout(() => setNote(null), bad ? 8000 : 3000) }
    try { await fn(); await reload(); if (done) say(done, false); return true } catch (e) { say(e instanceof Error ? e.message : 'That did not save.', true); return false }
  }, [reload])
  const data = useMemo(() => raw && { ...raw, invoices: raw.invoices.map(i => refreshDraft(i, raw.work, raw.settings, raw.clients)) }, [raw])
  if (!data) return <div className="p-6">{fail ? <><p className="mb-3">Your records could not be loaded: {fail}</p><button className="btn" onClick={() => reload().catch(e => setFail(e.message))}>Try again</button></> : 'Loading your records…'}</div>
  return (
    <C.Provider value={{ data, store, today, local, signOut, act }}>
      {children}
      <div aria-live="polite" className="fixed inset-x-4 bottom-24 z-50 flex justify-center pointer-events-none md:bottom-6">
        {/* A modal dialog covers this, so dialogs also show their own errors. */}
        {note && <div className={`rounded-md px-4 py-3 font-semibold text-white shadow-lg ${note.bad ? 'bg-rust' : 'bg-ink'}`}>{note.text}</div>}
      </div>
    </C.Provider>
  )
}
