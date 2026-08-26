import { ChevronLeft, ChevronRight } from 'lucide-react'
import './Pagination.css'

export const RECORD_PAGE_SIZE = 10

export function getPageCount(total: number, pageSize = RECORD_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function getPageItems<T>(items: T[], page: number, pageSize = RECORD_PAGE_SIZE) {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

interface PaginationProps {
  total: number
  page: number
  onPageChange: (page: number) => void
  pageSize?: number
}

function visiblePages(current: number, total: number) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, 4, total]
  if (current >= total - 2) return [1, total - 3, total - 2, total - 1, total]
  return [1, current - 1, current, current + 1, total]
}

export function Pagination({ total, page, onPageChange, pageSize = RECORD_PAGE_SIZE }: PaginationProps) {
  const totalPages = getPageCount(total, pageSize)
  if (totalPages <= 1) return null
  const pages = visiblePages(page, totalPages)

  return <nav className="pagination" aria-label="分页">
    <button type="button" className="pagination-nav" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="上一页"><ChevronLeft size={16}/><span>上一页</span></button>
    <div className="pagination-pages">{pages.map((item, index) => <span key={`${item}-${index}`} className="pagination-slot">{index > 0 && item - pages[index - 1] > 1 && <i>…</i>}<button type="button" className={item === page ? 'active' : ''} onClick={() => onPageChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button></span>)}</div>
    <span className="pagination-summary">第 {page} / {totalPages} 页</span>
    <button type="button" className="pagination-nav" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="下一页"><span>下一页</span><ChevronRight size={16}/></button>
  </nav>
}
