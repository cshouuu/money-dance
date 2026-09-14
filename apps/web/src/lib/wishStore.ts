import type { LedgerEntry, WishItem } from '../types'
import { MAX_MONEY_AMOUNT } from './form'
import { keys, loadJSON, removeJSON, saveJSON } from './storage'
import { runReversibleStorageTransaction } from './storageTransaction'
import { createWishAllocationPlan, latestWishItems, reviseWishAllocationPlan, type WishAllocationPlan } from './wishAllocation'

export interface WishStore {
  items: WishItem[]
  plan: WishAllocationPlan | null
  token: string
  error: string | null
}

const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime())
function validItems(value: unknown): value is WishItem[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  return value.every(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) return false
    ids.add(item.id)
    return typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60
      && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 && item.price <= MAX_MONEY_AMOUNT
      && validTime(item.createdAt) && (item.startedAt === undefined || validTime(item.startedAt))
      && (item.purchasedAt === undefined || validTime(item.purchasedAt))
  })
}

export function loadWishStore(): WishStore {
  let token = ''
  try {
    const rawItems = localStorage.getItem(keys.wishes)
    const rawPlan = localStorage.getItem(keys.wishAllocation)
    token = JSON.stringify([rawItems, rawPlan])
    const items: unknown = rawItems ? JSON.parse(rawItems) : []
    if (!validItems(items)) throw new Error('invalid wishes')
    const plan = rawPlan ? JSON.parse(rawPlan) as WishAllocationPlan : null
    if (plan && (plan.version !== 1 || !validTime(plan.adoptedAt) || !validItems(plan.initial) || !Array.isArray(plan.revisions)
      || plan.revisions.some((revision, index) => !validTime(revision.at) || !validItems(revision.items)
        || new Date(revision.at) < new Date(index ? plan.revisions[index - 1].at : plan.adoptedAt)))) throw new Error('invalid plan')
    if (plan && JSON.stringify(latestWishItems(plan)) !== JSON.stringify(items)) throw new Error('incomplete save')
    return { items, plan, token, error: null }
  } catch {
    return { items: [], plan: null, token, error: '心愿数据暂时无法完整读取，原数据已保留。请重新打开页面后重试。' }
  }
}

export type WishChange =
  | { type: 'adopt' }
  | { type: 'save'; item: WishItem }
  | { type: 'prioritize'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'purchase'; id: string }

/** Compare inside the lock, then persist the plan, its compatibility list and
 * any purchase expense together. Failed saves leave the visible action pending. */
export async function commitWishChange(expected: WishStore, change: WishChange, now = new Date()): Promise<string | null> {
  const commit = () => {
    const current = loadWishStore()
    if (current.error) return current.error
    if (current.token !== expected.token) return '心愿已在其他页面修改，请重新打开本次操作。'
    if (current.plan && now < new Date(current.plan.revisions.at(-1)?.at ?? current.plan.adoptedAt)) return '设备时间早于上次心愿修改，请校准时间后重试。'
    const legacy = !current.plan && current.items.length > 0
    if (legacy && change.type === 'prioritize') return '请先预览并确认旧心愿的分配方式。'
    let next = current.items.map(item => ({ ...item }))
    let purchase: LedgerEntry | null = null
    if (change.type === 'save') {
      if (!validItems([change.item])) return '请检查心愿名称、价格和日期。'
      const existing = next.find(item => item.id === change.item.id)
      if (existing?.purchasedAt) return '已经购买的心愿不能再次修改。'
      next = existing ? next.map(item => item.id === change.item.id ? { ...change.item, createdAt: existing.createdAt } : item) : legacy ? [change.item, ...next] : [...next, change.item]
    } else if (change.type !== 'adopt') {
      const item = next.find(candidate => candidate.id === change.id)
      if (!item || item.purchasedAt) return '这条心愿已删除或已购买，请重新打开页面。'
      if (change.type === 'delete') next = next.filter(candidate => candidate.id !== item.id)
      if (change.type === 'prioritize') next = [item, ...next.filter(candidate => candidate.id !== item.id)]
      if (change.type === 'purchase') {
        next = next.map(candidate => candidate.id === item.id ? { ...candidate, purchasedAt: now.toISOString() } : candidate)
        purchase = {
          id: `wish-purchase-${item.id}`, kind: 'purchase', direction: 'expense', amount: item.price,
          source: `已买 · ${item.name}`, occurredAt: now.toISOString(), linkedId: item.id,
        }
      }
    }
    const plan = current.plan ? reviseWishAllocationPlan(current.plan, next, now) : legacy && change.type !== 'adopt' ? null : createWishAllocationPlan(next, now)
    if (plan) next = latestWishItems(plan)
    const writes: [string, unknown][] = plan ? [[keys.wishAllocation, plan], [keys.wishes, next]] : [[keys.wishes, next]]
    if (purchase) {
      const ledger = loadJSON<LedgerEntry[]>(keys.ledger, [])
      if (ledger.some(entry => entry.id === purchase!.id || (entry.kind === 'purchase' && entry.linkedId === purchase!.linkedId))) return '这条心愿已有购买账目，请先检查账本。'
      writes.push([keys.ledger, [purchase, ...ledger]])
    }
    const steps = writes.map(([key, value]) => {
      const original = localStorage.getItem(key)
      return { write: () => saveJSON(key, value), rollback: () => {
        if (original === null) removeJSON(key)
        else { localStorage.setItem(key, original) }
      } }
    })
    return runReversibleStorageTransaction(steps).success ? null : '心愿暂时无法保存，本次修改未完成，请重试。'
  }
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('money-dance-wishes', commit) : commit()
}
