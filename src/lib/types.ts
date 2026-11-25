export type Work = { id: string; date: string; start: string; finish: string; break_min: number; client_id: string | null; site: string; rate_cents: number; notes: string; invoice_id: string | null }
export type Trip = { id: string; date: string; start_tenths: number; end_tenths: number; purpose: string; business: boolean }
export type Fuel = { id: string; date: string; litres_ml: number; cost_cents: number; odo_tenths: number | null; receipt_id: string | null }
export const CATEGORIES = ['Fuel', 'Equipment', 'Supplies', 'Vehicle Maintenance', 'PPE/Workwear', 'Insurance/Admin', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]
export type Receipt = { id: string; date: string; vendor: string; amount_cents: number; category: Category; gst_included: boolean; notes: string; file: string | null; thumb: string | null; mime: string | null; business_pct: number; is_asset: boolean; is_vehicle: boolean }
export type Client = { id: string; name: string; lines: string[]; rate_cents: number | null }
export type Item = { description: string; amount_cents: number; source?: 'work' }
export type Day = { date: string; minutes: number; cents: number }
export type Bank = { account_name: string; bsb: string; account_number: string }
export type Business = { name: string; abn: string; phone: string; email: string; address: string[] }
export type Supplier = Business & { bank: Bank }
export type Status = 'draft' | 'sent' | 'paid'
export type Invoice = { id: string; number: string; client_id: string | null; status: Status; issue_date: string; due_date: string; sent_date: string | null; paid_date: string | null; gst: boolean; items: Item[]; daily: Day[]; supplier: Supplier | null; bill_to: { name: string; lines: string[] } | null; notes: string }
export type Rates = { brackets: [number, number][]; medicare_threshold: number; help: { from: number; mid: number; top: number }; cents_per_km: number; super_cap: number }
export type YearSettings = { gross_cents: number; withheld_cents: number; method: 'cents_per_km' | 'logbook'; logbook_pct: number }
export type Settings = {
  business: Business; bank: Bank; default_rate_cents: number; invoice_prefix: string; invoice_pad: number; terms_days: number
  gst_registered: boolean; vehicle: { description: string; plate: string }; help_debt: boolean
  income_basis: 'all' | 'paid'; window: '4' | '8' | 'ytd'; super_on: boolean; super_pct: number; buffer_on: boolean; buffer_pct: number
  by_fy: Record<string, YearSettings>; rates: Record<string, Rates>
}
export type Data = { settings: Settings; clients: Client[]; work: Work[]; trips: Trip[]; fuel: Fuel[]; receipts: Receipt[]; invoices: Invoice[] }
export type RowOf = { clients: Client; work: Work; trips: Trip; fuel: Fuel; receipts: Receipt }
export type Table = keyof RowOf
export const TABLES: Table[] = ['clients', 'work', 'trips', 'fuel', 'receipts']
export const defaultSettings = (): Settings => ({
  business: { name: '', abn: '', phone: '', email: '', address: [] }, bank: { account_name: '', bsb: '', account_number: '' },
  default_rate_cents: 3000, invoice_prefix: 'INV-', invoice_pad: 3, terms_days: 5, gst_registered: false,
  vehicle: { description: '', plate: '' }, help_debt: false, income_basis: 'all', window: '4', super_on: false, super_pct: 12,
  buffer_on: false, buffer_pct: 25, by_fy: {}, rates: {}
})
export const defaultYear = (): YearSettings => ({ gross_cents: 0, withheld_cents: 0, method: 'cents_per_km', logbook_pct: 0 })
export const emptyData = (): Data => ({ settings: defaultSettings(), clients: [], work: [], trips: [], fuel: [], receipts: [], invoices: [] })
