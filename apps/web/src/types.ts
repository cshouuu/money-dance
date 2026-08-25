export interface WishItem {
  id: string
  name: string
  price: number
  createdAt: string
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
