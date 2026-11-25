import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setFillingRgbColor, setStrokingRgbColor, setLineWidth, rectangle, fill, moveTo, lineTo, stroke, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Invoice } from './types'
import { totals } from './invoices'
import { plain } from './money'
import { longDate } from './dates'

/** Every position below is in millimetres from the bottom left, as measured from the original invoices. */
const mm = 72 / 25.4
const W = 595.2756, H = 841.8898
type C = [number, number, number]
const GREEN: C = [0x2f / 255, 0x5d / 255, 0x3a / 255]
const INK: C = [0x1f / 255, 0x1f / 255, 0x1f / 255]
const MUTED: C = [0x6b / 255, 0x6b / 255, 0x6b / 255]
const RULE: C = [0xcf / 255, 0xcf / 255, 0xcf / 255]
const LEFT = 20, RIGHT = 190, FLOOR = 27

export async function renderInvoice(inv: Invoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique)
  const s = inv.supplier
  const name = s?.name ?? '', abn = s?.abn ? `ABN ${s.abn}` : ''
  doc.setTitle(`Invoice ${inv.number}`)
  doc.setAuthor(name)

  const clean = (t: string, f: PDFFont) => [...t.replace(/[\t\r\n]+/g, ' ')].map(ch => { try { f.encodeText(ch); return ch } catch { return '?' } }).join('')
  // Text is drawn without kerning, so measure it that way too.
  const width = (t: string, f: PDFFont, size: number) => [...t].reduce((a, ch) => a + f.widthOfTextAtSize(ch, size), 0)
  let page!: PDFPage
  let y = 0
  const text = (raw: string, x: number, at: number, f = reg, size = 10, c: C = INK) => {
    const t = clean(raw, f)
    if (t) page.drawText(t, { x: x * mm, y: at * mm, font: f, size, color: rgb(...c) })
  }
  const right = (raw: string, x: number, at: number, f = reg, size = 10, c: C = INK) =>
    text(raw, x - width(clean(raw, f), f, size) / mm, at, f, size, c)
  const line = (x1: number, x2: number, at: number, w: number, c: C) =>
    page.pushOperators(pushGraphicsState(), setStrokingRgbColor(...c), setLineWidth(w), moveTo(x1 * mm, at * mm), lineTo(x2 * mm, at * mm), stroke(), popGraphicsState())
  const wrap = (raw: string, max: number) => {
    const out: string[] = []
    let cur = ''
    const fits = (t: string) => width(t, reg, 10) <= max * mm
    for (let word of clean(raw, reg).split(' ')) {
      while (!fits(word)) { // break a single over-long word
        let n = word.length
        while (n > 1 && !fits(word.slice(0, n))) n--
        if (cur) { out.push(cur); cur = '' }
        out.push(word.slice(0, n)); word = word.slice(n)
      }
      const next = cur ? `${cur} ${word}` : word
      if (fits(next)) cur = next
      else { out.push(cur); cur = word }
    }
    out.push(cur)
    return out
  }
  const footer = () => {
    text('Thank you for your business.', LEFT, 18, reg, 9, MUTED)
    right([name, abn].filter(Boolean).join('  |  '), RIGHT, 18, reg, 9, MUTED)
  }
  const newPage = () => {
    if (page) footer()
    page = doc.addPage([W, H])
    page.pushOperators(pushGraphicsState(), setFillingRgbColor(...GREEN), rectangle(0, H - 8 * mm, W, 8 * mm), fill(), popGraphicsState())
  }
  const columns = (at: number) => {
    text('Description', 21, at, bold)
    right('Amount AUD', 189, at, bold)
    line(LEFT, RIGHT, at - 3, 0.9, INK)
    y = at - 3
  }

  newPage()
  text(inv.gst ? 'TAX INVOICE' : 'INVOICE', LEFT, 265, bold, 26)
  text(name, LEFT, 255, bold)
  let ly = 255
  for (const l of [abn, s?.phone ? `Phone ${s.phone}` : '', s?.email ?? '', ...(s?.address ?? [])].filter(Boolean)) text(l, LEFT, (ly -= 5), reg, 10, MUTED)
  const meta = (label: string, value: string, at: number) => { text(label, 125, at, bold, 9.5); text(value, 125, at - 4.6) }
  meta('Invoice Number', inv.number, 271)
  meta('Invoice Date', longDate(inv.issue_date), 260)
  meta('Due Date', longDate(inv.due_date), 249)

  y = Math.min(225, ly - 12)
  text('BILL TO', LEFT, y, bold, 8.5, MUTED)
  text(inv.bill_to?.name ?? '', LEFT, (y -= 5.5), bold)
  for (const l of inv.bill_to?.lines ?? []) text(l, LEFT, (y -= 5))
  columns(y - 19.5)

  for (const item of inv.items) {
    const lines = wrap(item.description, 132)
    // Keep short rows whole; a row longer than a page still splits line by line.
    if (y - 7 - (lines.length - 1) * 5 - 4 < FLOOR && lines.length < 40) { newPage(); columns(270) }
    let first = true
    y -= 7
    for (const l of lines) {
      if (!first) y -= 5
      if (y - 4 < FLOOR) { newPage(); columns(270); y -= 7 }
      text(l, 21, y)
      if (first) right(plain(item.amount_cents), 189, y)
      first = false
    }
    y -= 4
    line(LEFT, RIGHT, y, 0.6, RULE)
  }

  // Totals and payment details stay together, ending 82 mm below the last row.
  if (y - 82 < FLOOR) { newPage(); y = 262 }
  const t = totals(inv)
  right('Subtotal', 160, y - 8); right(plain(t.subtotal), 189, y - 8)
  right('GST', 160, y - 14.5); right(plain(t.gst), 189, y - 14.5)
  line(120, RIGHT, y - 18, 0.9, INK)
  right('TOTAL AUD', 160, y - 24, bold, 11); right(plain(t.total), 189, y - 24, bold, 11)
  if (!inv.gst) text('No GST has been charged. The supplier is not registered for GST.', LEFT, y - 38, ital, 9, MUTED)
  text(`Due Date: ${longDate(inv.due_date)}`, LEFT, y - 54, bold, 11)
  text('Please pay by bank transfer to the account below:', LEFT, y - 60)
  const pay: [string, string][] = [['Account name', s?.bank.account_name ?? ''], ['BSB', s?.bank.bsb ?? ''], ['Account number', s?.bank.account_number ?? ''], ['Reference', inv.number]]
  pay.forEach(([k, v], i) => { text(k, LEFT, y - 65.5 - i * 5.5, reg, 10, MUTED); text(v, 52, y - 65.5 - i * 5.5) })
  footer()
  return doc.save({ useObjectStreams: false })
}
