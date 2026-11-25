import type { Data, Invoice, RowOf, Settings, Table } from '../lib/types'
export interface Store {
  load(): Promise<Data>
  put<T extends Table>(table: T, row: RowOf[T]): Promise<void>
  remove(table: Table, id: string): Promise<void>
  saveSettings(s: Settings): Promise<void>
  /** Saves the invoice and links exactly these work entries, in one transaction. */
  saveInvoice(i: Invoice, workIds: string[]): Promise<void>
  /** Status and its dates only; contents of sent invoices never change. */
  setStatus(i: Invoice): Promise<void>
  deleteInvoice(id: string): Promise<void>
  putFile(path: string, b: Blob): Promise<void>
  getFile(path: string): Promise<Blob | null>
  removeFile(path: string): Promise<void>
}
