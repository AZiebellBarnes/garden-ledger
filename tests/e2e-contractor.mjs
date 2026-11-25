// Contractor login against a mocked Supabase. Serve a build made with VITE_SUPABASE_URL=http://127.0.0.1:9 and VITE_SUPABASE_KEY=test, then run this with APP_URL.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

mkdirSync('screenshots', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Melbourne' })).newPage()
p.setDefaultTimeout(8000)
const errors = [], calls = []
p.on('pageerror', e => errors.push(e.message))
const row = (id, date, start, finish, brk, site, extra = {}) => ({ ...extra, id, date, start: start + ':00', finish: finish + ':00', break_min: brk, site, rate_cents: 3000, client: 'Their business', business: 'Sam Example' })
const work = [row('1', '2026-11-24', '08:00', '12:00', 0, 'Park', { invoice: null }), row('2', '2026-11-16', '07:00', '16:30', 30, 'Beach Road', { invoice: 'INV-002' })]
let role = { status: 200, body: true }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
await p.route('http://127.0.0.1:9/**', r => {
  const u = new URL(r.request().url()).pathname
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors })
  calls.push(u)
  const json = (body, status = 200) => r.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (u.endsWith('/token')) return json({ access_token: 'a.eyJzdWIiOiJ1In0.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user: { id: 'u', email: 'boss@example.com', aud: 'authenticated' } })
  if (u.endsWith('/is_contractor')) return json(role.body, role.status)
  if (u.endsWith('/shared_work')) return json(work)
  return json([])
})
await p.goto(process.env.APP_URL)
role = { status: 500, body: { message: 'down' } }
await p.getByLabel('Email').fill('boss@example.com'); await p.getByLabel('Password').fill('x'); await p.getByRole('button', { name: 'Sign in' }).click()
// If the role check fails, nothing of the ledger is shown.
await p.getByText('could not be checked').waitFor()
assert.equal(await p.getByRole('navigation').count(), 0)
role = { status: 200, body: true }
await p.getByRole('button', { name: 'Try again' }).click()
await p.getByRole('heading', { name: 'Work by Sam Example' }).waitFor()
const t = await p.locator('main').innerText()
for (const s of ['Mon 16 Nov 2026', '07:00 to 16:30', 'Beach Road, 30 min unpaid break', '9 h, $270.00', '4 h, $120.00', '$390.00', '23 Nov 2026 to 29 Nov 2026', '16 Nov 2026 to 22 Nov 2026', 'Invoiced, INV-002', 'Not yet invoiced']) assert.ok(t.includes(s), s)
await p.getByLabel('From').fill('2026-11-17')
assert.ok(!(await p.locator('main').innerText()).includes('Beach Road'))
await p.getByRole('button', { name: 'All', exact: true }).click()
assert.equal(await p.getByRole('navigation').count(), 0)
// Typing an owner page's address changes nothing.
await p.evaluate(() => { location.hash = '#/settings' })
await p.waitForTimeout(400)
assert.equal(await p.getByText('Bank details').count(), 0)
assert.equal(calls.filter(c => /\/(work_entries|invoices|settings|receipts|viewers)$/.test(c)).length, 0)
assert.ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
await p.screenshot({ path: 'screenshots/contractor.png', fullPage: true })
// Before the database update, rows carry no invoice: show no status rather than a wrong one.
for (const x of work) delete x.invoice
await p.getByRole('button', { name: 'Refresh' }).click(); await p.getByText('Not yet invoiced').waitFor({ state: 'detached' })
assert.equal(await p.locator('main .tag').count(), 0)
await browser.close()
assert.deepEqual(errors, [])
console.log('Contractor walk-through passed')
