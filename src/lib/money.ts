/** Parse a decimal into an integer with `places` decimals. Null when blank, invalid or too precise. */
export function parseScaled(s: string, places: number): number | null {
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(s.trim().replace(/^\$/, '').replace(/,/g, ''))
  if (!m || (m[3] ?? '').length > places) return null
  const v = Number(m[2] + (m[3] ?? '').padEnd(places, '0'))
  return Number.isSafeInteger(v) ? (m[1] && v ? -v : v) : null
}
export const parseCents = (s: string) => parseScaled(s, 2)
export function plain(c: number): string {
  const a = Math.abs(Math.round(c))
  return `${c < 0 ? '-' : ''}${Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+$)/g, ',')}.${String(a % 100).padStart(2, '0')}`
}
export const aud = (c: number) => (c < 0 ? '-$' + plain(-c) : '$' + plain(c))
export const whole = (c: number) => aud(Math.round(c / 100) * 100).replace('.00', '')
