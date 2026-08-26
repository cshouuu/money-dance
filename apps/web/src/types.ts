export interface WishItem {
  id: string
  name: string
  price: number
  createdAt: string
  purchasedAt?: string
}

export interface SlackingSession {
  id: string
  startTime: string
  endTime: string
  durationSeconds: number
  earnedAmount: number
}

export interface OwnedItem {
  id: string
  name: string
  price: number
  purchaseDate: string
  category: string
  createdAt: string
}

export type LedgerDirection = 'income' | 'expense'
export type LedgerKind = 'purchase' | 'accident'

export interface LedgerEntry {
  id: string
  kind: LedgerKind
  direction: LedgerDirection
  amount: number
  source: string
  occurredAt: string
  linkedId?: string
  note?: string
}
