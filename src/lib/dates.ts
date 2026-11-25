const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p = (n: number) => String(n).padStart(2, '0')
/** Local calendar date, so early-morning entries never land on the previous UTC day. */
export const today = (d = new Date()) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
const utc = (s: string) => Date.parse(s + 'T00:00:00Z')
export const isDate = (s: string) => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(utc(s)) && new Date(utc(s)).toISOString().slice(0, 10) === s
export const addDays = (s: string, n: number) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5)
export const longDate = (s: string) => (isDate(s) ? `${p(Number(s.slice(8)))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : s)
export const weekday = (s: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(utc(s)).getUTCDay()]
export const monday = (s: string) => addDays(s, -((new Date(utc(s)).getUTCDay() + 6) % 7))
export const fyOf = (s: string) => { const y = Number(s.slice(0, 4)) - (Number(s.slice(5, 7)) < 7 ? 1 : 0); return `${y}-${p((y + 1) % 100)}` }
export const fyRange = (fy: string): [string, string] => [`${fy.slice(0, 4)}-07-01`, `${Number(fy.slice(0, 4)) + 1}-06-30`]
export const within = (d: string, [a, b]: [string, string]) => d >= a && d <= b
