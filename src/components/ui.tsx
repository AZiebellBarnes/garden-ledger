import { useEffect, useId, useRef, useState, cloneElement, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { useApp } from '../app'

export function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactElement<{ id?: string; 'aria-describedby'?: string }> }) {
  const id = useId()
  return (
    <div className={wide ? 'wide' : ''}>
      <label className="label" htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-describedby': hint ? id + 'h' : undefined })}
      {hint && <p id={id + 'h'} className="hint mt-1">{hint}</p>}
    </div>
  )
}
export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="wide flex min-h-11 items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="font-semibold">{label}{hint && <span className="hint block font-normal">{hint}</span>}</span>
    </label>
  )
}
export function Dialog({ title, onClose, children, full }: { title: string; onClose: () => void; children: ReactNode; full?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { const d = ref.current!; if (!d.open) d.showModal(); return () => d.close() }, [])
  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={e => { if (e.target === ref.current) { e.preventDefault(); onClose() } }}
      className={`m-auto rounded-xl bg-white p-0 backdrop:bg-ink/60 ${full ? 'h-dvh max-h-dvh w-dvw max-w-full rounded-none' : 'max-h-[94dvh] w-[min(96vw,600px)]'}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-5 py-3">
        <h2 id={id}>{title}</h2>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </dialog>
  )
}
/** Dialog form. `submit` returns an error message, or null once saved. */
export function FormDialog({ title, onClose, submit, save = 'Save', onDelete, children }: { title: string; onClose: () => void; submit: () => Promise<string | null>; save?: string; onDelete?: () => Promise<string | null>; children: ReactNode }) {
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [sure, setSure] = useState(false)
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setErr('')
    let m: string | null
    try { m = await fn() } catch (e) { m = e instanceof Error ? e.message : 'That did not save.' }
    setBusy(false)
    if (m) setErr(m); else onClose()
  }
  return (
    <Dialog title={title} onClose={onClose}>
      <form className="grid-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (!busy) void run(submit) }}>
        {children}
        {err && <p role="alert" className="wide font-semibold text-rust">{err}</p>}
        <div className="wide flex flex-wrap gap-2">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : save}</button>
          {onDelete && <button type="button" disabled={busy} className="btn btn-danger" onClick={() => (sure ? void run(onDelete) : setSure(true))}>{sure ? 'Delete for good?' : 'Delete'}</button>}
        </div>
      </form>
    </Dialog>
  )
}
/** A save that reports its error to the form instead of the page. */
export function useSave() {
  const { act } = useApp()
  return async (fn: () => Promise<unknown>, done: string): Promise<string | null> => {
    let msg: string | null = null
    const ok = await act(async () => { try { await fn() } catch (e) { msg = e instanceof Error ? e.message : 'That did not save.'; throw e } }, done)
    return ok ? null : msg ?? 'Saved, but the latest records could not be loaded.'
  }
}
export const Tag = ({ s }: { s: string }) => <span className={`tag tag-${s.toLowerCase()}`}>{s[0].toUpperCase() + s.slice(1)}</span>
export const Head = ({ title, children }: { title: string; children?: ReactNode }) => <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1>{title}</h1><div className="flex flex-wrap gap-2">{children}</div></div>
export function Figures({ items }: { items: [string, string][] }) {
  return <dl className="mb-5 flex flex-wrap gap-x-10 gap-y-3">{items.map(([k, v]) => <div key={k}><dt className="hint">{k}</dt><dd className="font-display text-xl font-bold">{v}</dd></div>)}</dl>
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="panel text-center text-stone">{children}</div>
export function download(b: Blob, name: string) {
  const u = URL.createObjectURL(b), a = document.createElement('a')
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 10000)
}
