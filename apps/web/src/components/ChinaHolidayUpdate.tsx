import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { updateChinaHolidays } from '../lib/chinaHolidays'
import { useChinaHolidayData } from '../lib/useChinaHolidays'
import { Button } from '../ui/BeuiControls'
import './ChinaHolidayUpdate.css'

export function ChinaHolidayUpdate() {
  const data = useChinaHolidayData()
  const years = Object.keys(data.years).map(Number).sort((a, b) => a - b)
  const latestYear = years[years.length - 1]
  const pending = useRef(false)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const update = async () => {
    if (pending.current) return
    pending.current = true
    setUpdating(true)
    setMessage('')
    setError('')
    try {
      const result = await updateChinaHolidays()
      setMessage(result === 'updated' ? '官方节假日数据已更新，已保存到本机。'
        : result === 'current' ? '当前已是最新收录数据。'
          : '更新源暂未提供更高版本，已保留本机较新的数据。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新失败，请稍后重试。')
    } finally {
      pending.current = false
      setUpdating(false)
    }
  }

  return <div className="china-holiday-update">
    <div className="china-holiday-update-info">
      <span>已收录 {years.join('、')} 年 · 数据版本 {data.version}</span>
      <a href={data.years[latestYear].sourceUrl} target="_blank" rel="noreferrer">查看 {latestYear} 年官方通知</a>
    </div>
    <Button variant="secondary" size="sm" onClick={update} disabled={updating} aria-busy={updating}>
      <RefreshCw size={14}/>{updating ? '正在更新…' : '更新官方节假日数据'}
    </Button>
    <p className="china-holiday-update-hint">联网获取最新已收录安排，保存后可离线使用。</p>
    {message && <p className="china-holiday-update-status" role="status">{message}</p>}
    {error && <p className="china-holiday-update-error" role="alert">{error}</p>}
  </div>
}
