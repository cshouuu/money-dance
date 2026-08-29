import { calculateRates, formatDuration, slackingEarned } from '@salary-flow/core'
import { Fish, Play, Square, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FinishToast } from '../components/FinishToast'
import { getPageCount, getPageItems, Pagination } from '../components/Pagination'
import { createId } from '../lib/id'
import { loadProfile } from '../lib/profile'
import { keys, loadJSON, removeJSON, saveJSON } from '../lib/storage'
import { useNow } from '../lib/useNow'
import type { SlackingSession } from '../types'
import './Slacking.css'

type PendingDelete = { type: 'all' } | { type: 'session'; session: SlackingSession } | null

export function Slacking() {
  const profile=loadProfile(); const rate=calculateRates(profile).second; const now=useNow(1000)
  const [active,setActive]=useState<string|null>(()=>loadJSON<string|null>(keys.activeSlacking,null))
  const [sessions,setSessions]=useState<SlackingSession[]>(()=>loadJSON(keys.sessions,[]))
  const [page,setPage]=useState(1)
  const [pendingDelete,setPendingDelete]=useState<PendingDelete>(null)
  const [finishNotice,setFinishNotice]=useState<{id:string;message:string}|null>(null)
  const stoppingRef=useRef(false)
  const currentPage=Math.min(page,getPageCount(sessions.length)); const visibleSessions=getPageItems(sessions,currentPage)
  const liveSeconds=active?Math.max(0,(now.getTime()-new Date(active).getTime())/1000):0; const liveMoney=liveSeconds*rate
  const start=()=>{const s=new Date().toISOString();setActive(s);saveJSON(keys.activeSlacking,s)}
  const stop=()=>{if(!active||stoppingRef.current)return;stoppingRef.current=true;try{const end=new Date().toISOString();const duration=Math.max(0,(new Date(end).getTime()-new Date(active).getTime())/1000);const session={id:createId(),startTime:active,endTime:end,durationSeconds:duration,earnedAmount:slackingEarned(active,end,rate)};const next=[session,...sessions];setActive(null);setSessions(next);setPage(1);removeJSON(keys.activeSlacking);saveJSON(keys.sessions,next);setFinishNotice({id:session.id,message:`才赚了¥${session.earnedAmount.toFixed(2)}，这就不摸了？`})}finally{stoppingRef.current=false}}
  const closeFinishNotice=useCallback(()=>setFinishNotice(null),[])
  const confirmDelete=()=>{if(!pendingDelete)return;if(pendingDelete.type==='all'){setSessions([]);saveJSON(keys.sessions,[]);setPage(1)}else{const next=sessions.filter(session=>session.id!==pendingDelete.session.id);setSessions(next);saveJSON(keys.sessions,next)}setPendingDelete(null)}
  const total=sessions.reduce((a,s)=>a+s.earnedAmount,0)
  return <section className="page"><header className="page-header"><div><p className="eyebrow">SLACKING TIMER</p><h1>摸鱼，也要有收益感。</h1><p>计时基于真实时间戳，刷新、锁屏、切换页面都不会让时间丢失。</p></div></header>
    <div className={`timer-card ${active?'running':''}`}><div className="fish-orbit"><Fish size={34}/></div><p>{active?'正在摸鱼……':'今天准备摸一会儿？'}</p><div className="timer-number">{active?new Date(liveSeconds*1000).toISOString().slice(11,19):'00:00:00'}</div><small>老板已为这段时间支付</small><div className="timer-money">¥{liveMoney.toFixed(2)}</div>{active?<button type="button" className="stop-button" onClick={stop}><Square size={18}/>结束摸鱼</button>:<button type="button" className="primary-button big" onClick={start}><Play size={18}/>开始摸鱼</button>}<span className="timer-rate">+ ¥{rate.toFixed(5)} / 秒</span></div>
    <div className="summary-strip slacking-summary"><div><small>历史摸鱼收益</small><strong>¥{total.toFixed(2)}</strong></div><div><small>历史摸鱼时间</small><strong>{formatDuration(sessions.reduce((a,s)=>a+s.durationSeconds,0))}</strong></div><button type="button" className="text-button clear-slacking-button" disabled={sessions.length===0} onClick={()=>setPendingDelete({type:'all'})}><Trash2 size={15}/>清空历史</button></div>
    <div className="list-section"><div className="section-title"><h2>摸鱼记录</h2><span>{sessions.length} 次</span></div>{sessions.length===0?<div className="empty">还没有摸鱼记录。</div>:<><div className="item-list">{visibleSessions.map(s=><article className="list-card slacking-record" key={s.id}><div className="item-avatar fish">🐟</div><div className="item-main"><b>{new Date(s.startTime).toLocaleDateString('zh-CN')} {new Date(s.startTime).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</b><span>{formatDuration(s.durationSeconds)}</span></div><div className="item-result"><small>本次摸鱼</small><strong>¥{s.earnedAmount.toFixed(2)}</strong></div><button className="icon-button slacking-delete-button" type="button" onClick={()=>setPendingDelete({type:'session',session:s})} aria-label="删除这次摸鱼记录" title="删除"><Trash2 size={16}/></button></article>)}</div><Pagination total={sessions.length} page={currentPage} onPageChange={setPage}/></>}</div>
    <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.type==='all'?'你要悄悄的删掉全部摸鱼记录吗？':'你要悄悄的删掉这次摸鱼记录吗？'} message={pendingDelete?.type==='session'?`${new Date(pendingDelete.session.startTime).toLocaleString('zh-CN')} · ¥${pendingDelete.session.earnedAmount.toFixed(2)}`:undefined} confirmLabel="对，打枪的不要" cancelLabel="不，我光明正大" onConfirm={confirmDelete} onCancel={()=>setPendingDelete(null)}/>
    {finishNotice&&<FinishToast key={finishNotice.id} message={finishNotice.message} onClose={closeFinishNotice}/>}
  </section>
}
