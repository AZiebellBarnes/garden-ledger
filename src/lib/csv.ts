export type Cell = string | number | boolean | null
export const toCsv = (rows: Cell[][]) => rows.map(r => r.map(c => {
  if (c === null) return ''
  if (typeof c !== 'string') return String(c)
  const s = /^[=+\-@\t\r]/.test(c) ? "'" + c : c // stop spreadsheet apps running typed text as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}).join(',')).join('\r\n')
