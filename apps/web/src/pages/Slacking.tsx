import { calculateRates, formatDuration, slackingEarned } from '@salary-flow/core'
import { Fish, Play, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import type { SlackingSession } from '../types'

export function Slacking() {
  const profile=loadProfile(); const rate=calculateRates(profile).second; const now=useNow(250)
  const [active,setActive]=useState<string|null>(()=>loadJSON<string|null>(keys.activeSlacking,null))
  const [sessions,setSessions]=useState<SlackingSession[]>(()=>loadJSON(keys.sessions,[]))
  const liveSeconds=active?Math.max(0,(now.getTime()-new Date(active).getTime())/1000):0; const liveMoney=liveSeconds*rate
  const start=()=>{const s=new Date().toISOString();setActive(s);saveJSON(keys.activeSlacking,s)}
  const stop=()=>{if(!active)return;const end=new Date().toISOString();const duration=Math.max(0,(new Date(end).getTime()-new Date(active).getTime())/1000);const next=[{id:crypto.randomUUID(),startTime:active,endTime:end,durationSeconds:duration,earnedAmount:slackingEarned(active,end,rate)},...sessions];setSessions(next);saveJSON(keys.sessions,next);setActive(null);saveJSON(keys.activeSlacking,null)}
  const clear=()=>{setSessions([]);saveJSON(keys.sessions,[])}
  const total=sessions.reduce((a,s)=>a+s.earnedAmount,0)
  return <section className="page"><header className="page-header"><div><p className="eyebrow">SLACKING TIMER</p><h1>摸鱼，也要有收益感。</h1><p>计时基于真实时间戳，刷新、锁屏、切换页面都不会让时间丢失。</p></div></header>
    <div className={`timer-card ${active?'running':''}`}><div className="fish-orbit"><Fish size={34}/></div><p>{active?'正在摸鱼……':'今天准备摸一会儿？'}</p><div className="timer-number">{active?new Date(liveSeconds*1000).toISOString().slice(11,19):'00:00:00'}</div><small>老板已为这段时间支付</small><div className="timer-money">¥{liveMoney.toFixed(2)}</div>{active?<button className="stop-button" onClick={stop}><Square size={18}/>结束摸鱼</button>:<button className="primary-button big" onClick={start}><Play size={18}/>开始摸鱼</button>}<span className="timer-rate">+ ¥{rate.toFixed(5)} / 秒</span></div>
    <div className="summary-strip"><div><small>历史摸鱼收益</small><strong>¥{total.toFixed(2)}</strong></div><div><small>历史摸鱼时间</small><strong>{formatDuration(sessions.reduce((a,s)=>a+s.durationSeconds,0))}</strong></div><button className="text-button" onClick={clear}><Trash2 size={15}/>清空历史</button></div>
    <div className="list-section"><div className="section-title"><h2>最近记录</h2><span>{sessions.length} 次</span></div><div className="item-list">{sessions.slice(0,20).map(s=><article className="list-card" key={s.id}><div className="item-avatar fish">🐟</div><div className="item-main"><b>{new Date(s.startTime).toLocaleDateString('zh-CN')} {new Date(s.startTime).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</b><span>{formatDuration(s.durationSeconds)}</span></div><div className="item-result"><small>本次摸鱼</small><strong>¥{s.earnedAmount.toFixed(2)}</strong></div></article>)}</div></div>
  </section>
}
