const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, name: '小薪', presetId: 'xiaoxin', size: 160, reducedMotion: false,
  reportMinutes: 60, breakMinutes: 50, warmth: true, milestones: true,
  quietEnabled: true, quietStart: '23:00', quietEnd: '08:00',
  hideAmounts: false, speech: false, notifications: false, launchAtLogin: false,
});
const STATES = ['working', 'slacking', 'overtime', 'rest'];
const ROUTES = ['/', '/pet', '/slacking', '/overtime', '/convert', '/settings', '/summary', '/attendance', '/assets', '/journey', '/roster', '/accidents'];
function sanitizeSettings(input = {}) {
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'boolean' && typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (typeof input.name === 'string' && input.name.trim()) result.name = input.name.trim().slice(0, 20);
  if (['xiaoxin', 'mili', 'huanhuan'].includes(input.presetId)) result.presetId = input.presetId;
  if ([120, 160, 200].includes(input.size)) result.size = input.size;
  if ([0, 15, 30, 60, 120].includes(input.reportMinutes)) result.reportMinutes = input.reportMinutes;
  if ([0, 30, 50, 60, 90].includes(input.breakMinutes)) result.breakMinutes = input.breakMinutes;
  for (const key of ['quietStart', 'quietEnd']) {
    if (typeof input[key] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input[key])) result[key] = input[key];
  }
  return result;
}
function sanitizeSnapshot(value) {
  if (!value || !STATES.includes(value.state) || !/^\d{4}-\d{2}-\d{2}$/.test(value.businessDate)) return null;
  for (const key of ['updatedAt', 'workAmount', 'overtimeAmount', 'overtimeSeconds']) {
    if (!Number.isFinite(value[key]) || value[key] < 0) return null;
  }
  return { updatedAt: value.updatedAt, businessDate: value.businessDate, state: value.state,
    workAmount: value.workAmount, overtimeAmount: value.overtimeAmount, overtimeSeconds: value.overtimeSeconds,
    overtimeId: typeof value.overtimeId === 'string' ? value.overtimeId.slice(0, 80) : '',
    wish: value.wish && typeof value.wish.name === 'string' && Number.isFinite(value.wish.progress)
      ? { id: String(value.wish.id).slice(0, 100), name: value.wish.name.slice(0, 40), progress: Math.max(0, Math.min(1, value.wish.progress)) } : null,
  };
}
function clampPosition(position, displays, width = 320, height = 360) {
  const x = Number.isFinite(position?.x) ? position.x : Infinity;
  const y = Number.isFinite(position?.y) ? position.y : Infinity;
  const area = displays.find(a => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height) || displays[0];
  return { x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))) };
}
module.exports = { DEFAULT_SETTINGS, STATES, ROUTES, sanitizeSettings, sanitizeSnapshot, clampPosition };
