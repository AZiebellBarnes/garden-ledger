import { StrictMode, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { createClient, type Session } from '@supabase/supabase-js'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import './style.css'
import { AppProvider, useApp } from './app'
import { LocalStore } from './data/local'
import { SupabaseStore } from './data/supabase'
import { Field } from './components/ui'
import Home from './pages/Home'
import WorkPage from './pages/WorkPage'
import Vehicle from './pages/Vehicle'
import Receipts from './pages/Receipts'
import Invoices from './pages/Invoices'
import Tax from './pages/Tax'
import Spreadsheet from './pages/Spreadsheet'
import SettingsPage from './pages/SettingsPage'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
const client = url && key ? createClient(url, key) : null
const localStore = client ? null : new LocalStore()

const NAV = [['/', 'Today'], ['/work', 'Hours'], ['/vehicle', 'Vehicle'], ['/receipts', 'Receipts'], ['/invoices', 'Invoices'], ['/tax', 'Tax'], ['/spreadsheet', 'Spreadsheet'], ['/settings', 'Settings']] as const

function Shell() {
  const { local, signOut } = useApp()
  const link = ({ isActive }: { isActive: boolean }) => `shrink-0 rounded-md px-3 py-3 font-semibold ${isActive ? 'bg-marigold text-ink' : 'text-white hover:bg-white/10'}`
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto bg-leaf p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] md:sticky md:top-0 md:h-dvh md:flex-col md:p-4">
        <div className="hidden px-3 pb-5 pt-2 font-display text-2xl font-bold leading-none text-white md:block">Garden Ledger</div>
        {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={link}>{label}</NavLink>)}
        {signOut && <button className="shrink-0 px-3 py-3 text-left font-semibold text-white md:mt-auto" onClick={signOut}>Sign out</button>}
      </nav>
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12">
        {local && <p className="hint mb-4 border-l-4 border-marigold pl-3">Records are saved only in this browser. Download backups from Settings, or connect Supabase to use your phone and computer together.</p>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/vehicle" element={<Vehicle />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/spreadsheet" element={<Spreadsheet />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  )
}

function SignIn() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await client!.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr(error.message)
  }
  return (
    <form onSubmit={go} className="panel mx-auto mt-[12vh] grid w-[min(92%,380px)] gap-4">
      <h1>Garden Ledger</h1>
      <Field label="Email"><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
      {err && <p role="alert" className="font-semibold text-rust">{err}</p>}
      <button className="btn" disabled={busy}>Sign in</button>
    </form>
  )
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(client ? undefined : null)
  useEffect(() => {
    if (!client) return
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const uid = session?.user.id
  const store = useMemo(() => (client ? (uid ? new SupabaseStore(client, uid) : null) : localStore), [uid])
  if (session === undefined) return <p className="p-6">Loading…</p>
  if (!store) return <SignIn />
  return <AppProvider key={uid ?? 'local'} store={store} local={!client} signOut={client ? () => void client.auth.signOut() : undefined}><Shell /></AppProvider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><Root /></HashRouter></StrictMode>)
