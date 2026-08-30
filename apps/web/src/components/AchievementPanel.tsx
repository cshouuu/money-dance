import { formatDuration } from '@salary-flow/core'
import { LockKeyhole, Medal, Trophy } from 'lucide-react'
import { getAchievementSnapshot, type AchievementKind, type AchievementState } from '../lib/achievements'
import './AchievementPanel.css'

interface AchievementPanelProps {
  kind: AchievementKind
  state: AchievementState
  activeSeconds?: number
}

const PANEL_COPY: Record<AchievementKind, { eyebrow: string; title: string }> = {
  slacking: { eyebrow: 'SLACKING ACHIEVEMENTS', title: '摸鱼成就' },
  overtime: { eyebrow: 'OVERTIME ACHIEVEMENTS', title: '加班成就' },
}

export function AchievementPanel({ kind, state, activeSeconds = 0 }: AchievementPanelProps) {
  const snapshot = getAchievementSnapshot(kind, state, activeSeconds)
  const copy = PANEL_COPY[kind]
  const levelLabel = snapshot.current ? `Lv.${snapshot.current.level} ${snapshot.current.name}` : '等待第一枚勋章'

  return <section className={`achievement-panel ${kind}`} aria-labelledby={`${kind}-achievement-title`}>
    <div className="achievement-heading">
      <div className="achievement-title-icon"><Trophy size={20}/></div>
      <div>
        <p>{copy.eyebrow}</p>
        <h2 id={`${kind}-achievement-title`}>{copy.title}</h2>
      </div>
      <div className="achievement-current"><small>当前等级</small><strong>{levelLabel}</strong></div>
    </div>

    <div className="achievement-progress-copy">
      <span>永久累计 {formatDuration(snapshot.lifetimeSeconds)}{snapshot.activeSeconds > 0 ? ` · 本次预览 +${formatDuration(snapshot.activeSeconds)}` : ''}</span>
      <b>{snapshot.next ? `距离「${snapshot.next.name}」还差 ${formatDuration(snapshot.remainingSeconds)}` : '所有成就均已点亮'}</b>
    </div>
    <div
      className="achievement-progress-track"
      role="progressbar"
      aria-label={snapshot.next ? `通往${snapshot.next.name}的进度` : '成就进度'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(snapshot.progress * 100)}
    >
      <span style={{ width: `${snapshot.progress * 100}%` }}/>
    </div>

    <ol className="achievement-medals">
      {snapshot.definitions.map(achievement => {
        const unlocked = achievement.level <= snapshot.highestLevel
        return <li className={unlocked ? 'unlocked' : 'locked'} data-level={achievement.level} key={achievement.id}>
          <div className="achievement-medal" aria-hidden="true">
            <Medal size={25}/>
            <span>{achievement.level}</span>
            {unlocked ? null : <i><LockKeyhole size={11}/></i>}
          </div>
          <b>{achievement.name}</b>
          <small>{achievement.description}</small>
          <em>{unlocked ? '已点亮' : '未点亮'}</em>
        </li>
      })}
    </ol>
    <p className="achievement-footnote">勋章点亮后永久保留；删除计时记录不会清除累计成就。</p>
  </section>
}
