import { useEffect, useState } from 'react'

export function useNow(interval = 250) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id: number | undefined
    const schedule = () => {
      if (id !== undefined) window.clearInterval(id)
      setNow(new Date())
      id = document.hidden ? undefined : window.setInterval(() => setNow(new Date()), interval)
    }

    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      if (id !== undefined) window.clearInterval(id)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [interval])
  return now
}
