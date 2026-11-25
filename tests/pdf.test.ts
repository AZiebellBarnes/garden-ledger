import { expect, test, describe } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { renderInvoice } from '../src/lib/pdf'
import type { Invoice, Settings } from '../src/lib/types'
import { defaultSettings } from '../src/lib/types'

function a85(b: Buffer): Buffer {
  const s = b.toString('latin1').replace(/\s/g, '').replace(/~>.*/, '')
  const out: number[] = []
  let g: number[] = []
  const flush = (k: number) => { while (g.length < 5) g.push(84); let v = g.reduce((a, c) => a * 85 + c, 0); const q = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) { q[i] = v % 256; v = Math.floor(v / 256) } out.push(...q.slice(0, k)); g = [] }
  for (const ch of s) { if (ch === 'z') { out.push(0, 0, 0, 0); continue } g.push(ch.charCodeAt(0) - 33); if (g.length === 5) flush(4) }
  if (g.length) flush(g.length - 1)
  return Buffer.from(out)
}
/** Drawing operations in order: each text run, filled rect and rule with its position and style. */
export function ops(pdf: Buffer) {
  const src = pdf.toString('latin1')
  const contents: string[] = []
  for (const m of src.matchAll(/<<((?:(?!>>)[\s\S])*)>>\s*stream\r?\n([\s\S]*?)\r?\n?endstream/g)) {
    if (/ObjStm|XRef/.test(m[1])) continue
    let d: Buffer = Buffer.from(m[2], 'latin1')
    if (/ASCII85/.test(m[1])) d = a85(d)
    if (/Flate/.test(m[1])) d = inflateSync(d)
    contents.push(d.toString('latin1'))
  }
  const fonts: Record<string, string> = {}
  // Each generated font resource name starts with its base font; the references use F1..F3.
  Object.assign(fonts, { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Helvetica-Oblique' })
  const fontOf = (n: string) => fonts[n] ?? n.replace(/-\d+$/, '')
  const out: unknown[] = []
  let fill = '', stroke = '', width = 0, font = '', size = 0, x = 0, y = 0
  const r = (v: string | number, p = 2) => Number(Number(v).toFixed(p))
  const t = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>|\/[^\s/]+|[^\s()<>]+/g
  const st: string[] = []
  for (const tok of contents.join('\n').match(t) ?? []) {
    const n = (k: number) => st.slice(-k).map(Number)
    const col = () => n(3).map(v => r(v, 3)).join(',')
    switch (tok) {
      case 'rg': fill = col(); break
      case 'RG': stroke = col(); break
      case 'w': width = r(st.at(-1)!); break
      case 'Tf': font = fontOf(st.at(-2)!.slice(1)); size = r(st.at(-1)!); break
      case 'Tm': [x, y] = n(2); break
      case 'Tj': { const s = st.at(-1)!; const text = s[0] === '<' ? Buffer.from(s.slice(1, -1), 'hex').toString('latin1') : s.slice(1, -1).replace(/\\(.)/g, '$1'); out.push(['text', text, r(x), r(y), font, size, fill]); break }
      case 're': out.push(['rect', ...n(4).map(v => r(v)), fill]); break
      case 'm': [x, y] = n(2); break
      case 'l': { const [a, b] = n(2); out.push(['line', r(x), r(y), r(a), r(b), width, stroke]); break }
      default: st.push(tok); continue
    }
    st.length = 0
  }
  return out
}
const root = new URL('..', import.meta.url)
const priv = new URL('private/import.json', root)
const ref = (n: string) => new URL(`Invoices/Invoice ${n}.pdf`, root)
// Personal references are git-ignored, so this comparison runs on the owner's computer only.
describe.skipIf(!existsSync(priv))('matches the original invoices', () => {
  for (const num of ['INV-001', 'INV-002']) test(num, async () => {
    const d = JSON.parse(readFileSync(priv, 'utf8')) as { settings: Settings; invoices: Invoice[] }
    const bytes = await renderInvoice(d.invoices.find(i => i.number === num)!)
    const original = ops(readFileSync(ref(num)))
    expect(original.length).toBeGreaterThan(30)
    const got = ops(Buffer.from(bytes)) as unknown[][]
    expect(got.length).toBe(original.length)
    got.forEach((op, i) => op.forEach((v, k) => {
      const want = (original as unknown[][])[i][k]
      if (typeof v === 'number') expect(Math.abs(v - (want as number)), JSON.stringify(op)).toBeLessThan(0.011)
      else expect(v).toBe(want)
    }))
  })
})
const sample = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i', number: 'INV-009', client_id: null, status: 'draft', issue_date: '2026-12-01', due_date: '2026-12-06', sent_date: null, paid_date: null, gst: false, items: [{ description: 'Gardening services', amount_cents: 125000 }], daily: [], supplier: { ...defaultSettings().business, name: 'Sam Example', bank: { account_name: 'Sam', bsb: '000-000', account_number: '1' } }, bill_to: { name: 'Client', lines: ['1 Road'] }, notes: '', ...o })
const text = (o: unknown[]) => (o as unknown[][]).filter(a => a[0] === 'text').map(a => a[1])
test('thousands separators', async () => expect(text(ops(Buffer.from(await renderInvoice(sample()))))).toContain('1,250.00'))
test('GST invoices say tax invoice and drop the not-registered note', async () => {
  const t = text(ops(Buffer.from(await renderInvoice(sample({ gst: true })))))
  expect(t).toContain('TAX INVOICE')
  expect(t).toContain('125.00')
  expect(t.join()).not.toMatch(/No GST/)
})
test('long invoices flow on to more pages inside the margins', async () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ description: `Job ${i} ` + 'hedge trimming '.repeat(9), amount_cents: 1000 }))
  const o = ops(Buffer.from(await renderInvoice(sample({ items })))) as unknown[][]
  expect(text(o).filter(t => t === 'Thank you for your business.').length).toBeGreaterThan(1)
  for (const a of o) if (a[0] === 'text') { expect(a[3] as number).toBeGreaterThan(50); expect(a[2] as number).toBeGreaterThan(50) }
  expect(text(o)).toContain('Job 59 ' + text(o).find(t => String(t).startsWith('Job 59 '))!.toString().slice(7))
})
test('characters the font cannot draw do not crash', async () =>
  expect((await renderInvoice(sample({ items: [{ description: 'Hedge 🌿 trim', amount_cents: 1 }] }))).length).toBeGreaterThan(500))
