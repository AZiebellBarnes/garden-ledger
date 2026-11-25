import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app'
import type { Receipt } from '../lib/types'
import { Dialog, download } from './ui'

export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
async function pdfjs() {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}
async function renderPdf(bytes: ArrayBuffer, width: number, max: number): Promise<HTMLCanvasElement[]> {
  const task = (await pdfjs()).getDocument({ data: bytes.slice(0) })
  const doc = await task.promise
  const out: HTMLCanvasElement[] = []
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvas, viewport: vp }).promise
    out.push(canvas)
  }
  await task.destroy()
  return out
}
export async function makeThumb(file: Blob): Promise<Blob> {
  let src: HTMLCanvasElement | ImageBitmap
  try { src = file.type === 'application/pdf' ? (await renderPdf(await file.arrayBuffer(), 360, 1))[0] : await createImageBitmap(file) } catch { throw new Error('That file could not be opened. Check it is a valid image or PDF.') }
  const c = document.createElement('canvas'), k = Math.min(1, 360 / Math.max(src.width, src.height))
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k))
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('No preview could be made.'))), 'image/jpeg', 0.8))
}
export function useFile(path: string | null) {
  const { store } = useApp()
  const [blob, setBlob] = useState<Blob | null>(null), [url, setUrl] = useState('')
  useEffect(() => {
    let dead = false, u = ''
    setBlob(null); setUrl('')
    if (path) store.getFile(path).then(b => { if (b && !dead) { u = URL.createObjectURL(b); setBlob(b); setUrl(u) } }).catch(() => {})
    return () => { dead = true; if (u) URL.revokeObjectURL(u) }
  }, [path, store])
  return { blob, url }
}
export function Thumb({ r }: { r: Receipt }) {
  const { url } = useFile(r.thumb)
  return <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded bg-moss text-xs text-stone">{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : 'No file'}</span>
}
export function PdfView({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let dead = false
    blob.arrayBuffer().then(b => renderPdf(b, 1400, 30)).then(cs => {
      if (dead) return
      cs.forEach((c, i) => { c.className = 'mb-3 block w-full border border-moss'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Page ${i + 1}`) })
      box.current?.replaceChildren(...cs)
    }).catch(() => !dead && setErr(true))
    return () => { dead = true }
  }, [blob])
  return err ? <p>This PDF could not be shown. Download it instead.</p> : <div ref={box} className="mx-auto max-w-3xl" />
}
export function Viewer({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const { blob, url } = useFile(r.file)
  return (
    <Dialog title={`${r.vendor} receipt`} onClose={onClose} full>
      {!blob ? <p>Loading the file…</p> : <>
        <button className="btn btn-quiet mb-4" onClick={() => download(blob, `${r.date} ${r.vendor}.${{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[r.mime ?? ''] ?? 'pdf'}`)}>Download</button>
        {r.mime === 'application/pdf' ? <PdfView blob={blob} /> : <img src={url} alt={`Receipt from ${r.vendor}`} className="mx-auto max-h-[80dvh] max-w-full" />}
      </>}
    </Dialog>
  )
}
