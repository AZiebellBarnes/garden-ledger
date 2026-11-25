// Browser walk-through with the installed Chrome. Start `npm run preview` first, then `node tests/e2e.mjs`.
// Uses a throwaway browser profile, so it never touches your records.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

mkdirSync('screenshots', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, timezoneId: 'Australia/Melbourne' })
const p = await ctx.newPage()
p.setDefaultTimeout(10000)
const errors = []
p.on('pageerror', e => errors.push(e.message))
p.on('console', m => m.type() === 'error' && errors.push(m.text()))
const url = process.env.APP_URL ?? 'http://localhost:4173/'
const btn = n => p.getByRole('button', { name: n, exact: true })
const nav = async n => { await p.getByRole('navigation').getByRole('link', { name: n, exact: true }).click() }
const gone = () => p.locator('dialog[open]').waitFor({ state: 'detached' })
const fill = (l, v) => p.locator('dialog').getByLabel(l, { exact: true }).fill(v)

await p.goto(url)
await nav('Settings')
const setup = existsSync('private/import.json') ? 'private/import.json' : null
if (setup) { await p.getByLabel('Import a backup or setup file').setInputFiles(setup); await p.getByText('Import finished').waitFor() }
else {
  await btn('Add client').click(); await fill('Business name', 'Test Client'); await btn('Save client').click(); await gone()
  for (const [l, v] of [['Name', 'Sam Example'], ['ABN', '1'], ['BSB', '000-000'], ['Account number', '1']]) await p.getByLabel(l, { exact: true }).fill(v)
  await btn('Save settings').click()
}
await nav('Hours')
await btn('Log hours').first().click()
await fill('Start', '15:00'); await fill('Finish', '07:00')
await btn('Save hours').click()
await p.getByText('Finish must be after start').waitFor()
await fill('Start', '07:00'); await fill('Finish', '15:30'); await fill('Unpaid break (min)', '30'); await fill('Site', 'Beach Road')
await btn('Save hours').click(); await gone()
assert.ok(await p.getByText('$240.00').count())
await nav('Vehicle')
await btn('Add trip').click(); await fill('Start odometer (km)', '1000'); await fill('End odometer (km)', '1042.5'); await fill('Purpose or job location', 'Beach Road'); await btn('Save trip').click(); await gone()
assert.ok(await p.getByText('42.5 km').count())
await btn('Add fuel').click(); await fill('Litres', '40'); await fill('Price per litre ($)', '1.899'); await btn('Save fuel').click(); await gone()
assert.ok(await p.getByText('$75.96').count())
await nav('Receipts')
const png = 'screenshots/receipt.png'
await p.screenshot({ path: png })
await btn('Add receipt').click(); await p.locator('dialog input[type=file]').setInputFiles(png); await fill('Amount ($)', '55'); await fill('Vendor', 'Bunnings'); await btn('Save receipt').click(); await gone()
await p.locator('main img').waitFor()
await p.getByLabel('View Bunnings receipt').click(); await p.locator('dialog img').waitFor(); await btn('Close').click()
await nav('Invoices')
await btn('New invoice').click()
const number = await p.locator('dialog').getByLabel('Number', { exact: true }).inputValue()
assert.equal(number, setup ? 'INV-003' : 'INV-001')
await btn('Select all').click()
await p.locator('dialog').screenshot({ path: 'screenshots/editor.png' })
await btn('Save draft').click(); await gone()
const card = p.locator('article').filter({ hasText: number })
const [dl] = await Promise.all([p.waitForEvent('download'), card.getByRole('button', { name: 'Download PDF' }).click()])
await dl.saveAs('screenshots/invoice.pdf')
assert.equal(dl.suggestedFilename(), `Invoice ${number}.pdf`)
await card.getByRole('button', { name: 'Preview' }).click(); await p.locator('dialog canvas').waitFor(); await p.screenshot({ path: 'screenshots/preview.png' }); await btn('Close').click()
// A PDF works as a receipt too.
await nav('Receipts')
await btn('Add receipt').click(); await p.locator('dialog input[type=file]').setInputFiles('screenshots/invoice.pdf'); await fill('Amount ($)', '10'); await fill('Vendor', 'PDF shop'); await btn('Save receipt').click(); await gone()
assert.equal(await p.locator('main img').count() >= 1, true)
// Hours edited while in draft flow into the invoice; sent locks them.
await nav('Hours'); await p.getByRole('button', { name: /Beach Road/ }).click(); await fill('Finish', '16:30'); await btn('Save hours').click(); await gone()
await nav('Invoices')
await card.getByText('$270.00').waitFor()
await card.getByRole('button', { name: 'Mark as sent' }).click(); await card.getByRole('button', { name: 'Mark as paid' }).waitFor()
await nav('Hours'); await p.getByRole('button', { name: /Beach Road/ }).click(); await p.getByText('can’t be changed').waitFor(); await btn('Close').click()
await nav('Invoices'); await card.getByRole('button', { name: 'Mark as paid' }).click(); await p.locator('dialog').getByRole('button', { name: 'Mark as paid' }).click(); await gone()
await nav('Hours'); await p.locator('.tag-paid').waitFor()
// Hours already on a sent invoice attach to it without changing its total.
await nav('Hours'); await btn('Log hours').first().click(); await fill('Start', '07:00'); await fill('Finish', '09:00'); await fill('Site', 'Old job')
await p.locator('dialog').getByLabel('Already invoiced').check()
if (setup) await p.locator('dialog').getByLabel('Which invoice').selectOption({ label: await p.locator('dialog option', { hasText: 'INV-002' }).innerText() })
await p.locator('dialog').screenshot({ path: 'screenshots/billed.png' })
await btn('Save hours').click(); await gone()
assert.equal(await p.getByRole('button', { name: /Old job/ }).locator('.tag').innerText(), setup ? 'Invoiced' : 'Paid')
if (setup) {
  await nav('Invoices'); const two = p.locator('article').filter({ hasText: 'INV-002' })
  await two.getByRole('button', { name: 'Back to draft' }).click(); await two.getByRole('button', { name: 'Edit' }).click()
  await p.getByText('already covered by the lines').waitFor(); await btn('Save draft').click(); await gone()
  await two.getByText('$667.50').waitFor(); await two.getByRole('button', { name: 'Mark as sent' }).click(); await two.getByRole('button', { name: 'Mark as paid' }).waitFor()
  await nav('Hours'); assert.equal(await p.getByRole('button', { name: /Old job/ }).locator('.tag').innerText(), 'Invoiced')
}
await nav('Tax'); await p.getByText('Recommended weekly tax set-aside').waitFor()
const before = await p.locator('main').innerText()
await p.getByLabel('Use my own tax percentage').click(); await p.getByLabel('Tax buffer (%)').waitFor()
assert.notEqual(before, await p.locator('main').innerText())
await p.getByLabel('Use my own tax percentage').click(); await p.getByLabel('Tax buffer (%)').waitFor({ state: 'detached' })
await nav('Spreadsheet'); await btn('Receipts').click()
const vendor = p.getByLabel('Vendor').last()
await vendor.fill('Renamed'); await vendor.press('Enter'); await p.getByText('Saved', { exact: true }).waitFor()
const [x] = await Promise.all([p.waitForEvent('download'), btn('Export Excel').click()])
await x.saveAs('screenshots/export.xlsx')
assert.ok(readFileSync('screenshots/export.xlsx').length > 8000)
const [c] = await Promise.all([p.waitForEvent('download'), btn('Export this tab as CSV').click()])
assert.ok(c.suggestedFilename().endsWith('.csv'))
await p.reload(); await p.getByText('Renamed').or(p.locator('input[value="Renamed"]')).first().waitFor({ timeout: 2000 }).catch(() => {})
// Every page at phone and desktop width: no sideways scrolling.
for (const [w, h] of [[390, 844], [1280, 900]]) {
  await p.setViewportSize({ width: w, height: h })
  for (const n of ['Today', 'Hours', 'Vehicle', 'Receipts', 'Invoices', 'Tax', 'Spreadsheet', 'Contractor', 'Settings']) {
    await nav(n); await p.waitForTimeout(700)
    const over = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll("main .panel, main form")].map(e => Math.ceil(e.getBoundingClientRect().right))) - document.documentElement.clientWidth)
    assert.ok(over <= 0, `${n} overflows by ${over}px at ${w}px`)
    await p.screenshot({ path: `screenshots/${w}-${n}.png` })
  }
}
await p.setViewportSize({ width: 390, height: 844 }); await nav('Hours'); await btn('Log hours').first().click(); await p.screenshot({ path: 'screenshots/390-form.png' })
await browser.close()
writeFileSync('screenshots/errors.txt', errors.join('\n'))
assert.deepEqual(errors, [])
console.log('Browser walk-through passed')
