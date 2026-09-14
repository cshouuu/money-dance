const MINUTE = 60_000;
function isQuiet(settings, now) {
  if (!settings.quietEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = text => Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  const start = parse(settings.quietStart), end = parse(settings.quietEnd);
  return start === end || (start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end);
}
const money = amount => `¥${amount.toFixed(2)}`;
function report(snapshot, settings) {
  if (!snapshot) return '正在和 MoneyDance 对表，稍等一下。';
  if (settings.hideAmounts) return '今天的付出已经记录好了。打开 MoneyDance 查看收入吧。';
  return `本工作日已计薪 ${money(snapshot.workAmount)}。${snapshot.state === 'overtime' ? `本次加班 ${money(snapshot.overtimeAmount)}。` : '每一点积累，都在让心愿更近。'}`;
}
/** Absolute timestamps survive sleep; one highest-priority reminder per tick, no catch-up queue. */
function nextReminder(snapshot, settings, memory, now = Date.now()) {
  const previous = memory.previous;
  memory.previous = snapshot;
  if (!memory.lastReport) memory.lastReport = now;
  if (!memory.lastBreak || (previous?.state === 'rest' && snapshot.state !== 'rest')) memory.lastBreak = now;
  const suppressed = !settings.enabled || now < (memory.snoozedUntil || 0) || isQuiet(settings, new Date(now));
  if (suppressed) { memory.lastReport = now; memory.lastBreak = now; }
  const seen = new Set(memory.seen || []);
  function once(key, text, kind) {
    if (seen.has(key)) return null;
    seen.add(key); memory.seen = [...seen].slice(-120);
    return suppressed ? null : { text, kind };
  }
  const candidates = [];
  if (memory.focusEndsAt && now >= memory.focusEndsAt) {
    memory.focusEndsAt = 0;
    if (!suppressed) candidates.push({ kind: 'focus', text: '这一段专注完成啦。把目光移远一点，起身放松两分钟吧。' });
  }
  if (settings.warmth && snapshot.state === 'overtime' && snapshot.overtimeSeconds >= 3600) {
    const hours = Math.floor(snapshot.overtimeSeconds / 3600);
    candidates.push(once(`overtime:${snapshot.overtimeId}:${hours}`, hours === 1
      ? '已经加班一小时了，辛苦啦。喝口水、转转肩膀，我陪你把手头这件事收好。'
      : `已经加班 ${hours} 小时了。你已经很努力了，能收工就早点休息，身体比待办更重要。`, 'warmth'));
  }
  if (previous && previous.state !== 'rest' && snapshot.state === 'rest' && settings.warmth) {
    candidates.push(once(`rest:${snapshot.businessDate}`, '先休息一下吧。今天的付出都算数，给眼睛和肩膀也放个小假。', 'rest'));
  }
  if (settings.milestones && previous?.businessDate === snapshot.businessDate) {
    const step = Math.floor(snapshot.workAmount / 100);
    if (step > Math.floor(previous.workAmount / 100)) candidates.push(once(`salary:${snapshot.businessDate}:${step}`,
      settings.hideAmounts ? '今天又走过一个小里程碑，给自己一个赞！' : `今日计薪跨过 ${money(step * 100)}，小小积累也值得开心一下！`, 'celebrate'));
    if (snapshot.wish && previous.wish && snapshot.wish.id === previous.wish.id && snapshot.wish.progress >= 1 && previous.wish.progress < 1) {
      candidates.push(once(`wish:${snapshot.wish.id}`, `「${snapshot.wish.name}」的心愿进度满啦！要不要去清单看看？`, 'celebrate'));
    }
  }
  if (!suppressed && snapshot.state !== 'rest') {
    if (settings.breakMinutes && now - memory.lastBreak >= settings.breakMinutes * MINUTE) {
      memory.lastBreak = now;
      candidates.push({ kind: 'break', text: '喝口水，让肩膀和眼睛也放个小假。照顾自己，也是今天的正事。' });
    }
    if (settings.reportMinutes && now - memory.lastReport >= settings.reportMinutes * MINUTE) {
      memory.lastReport = now;
      candidates.push({ kind: 'report', text: report(snapshot, settings) });
    }
  }
  // Discard lower priority messages, so resuming never unleashes a backlog.
  return candidates.find(Boolean) || null;
}
module.exports = { isQuiet, report, nextReminder };
