const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSettings, sanitizeSnapshot, clampPosition } = require('../src/contract.cjs');
const { nextReminder, isQuiet, report } = require('../src/reminders.cjs');
const settings = sanitizeSettings({ quietEnabled: false });
const now = new Date(2026, 8, 14, 10).getTime();
const snapshot = { updatedAt: now, businessDate: '2026-09-14', state: 'working', workAmount: 80, overtimeAmount: 0, overtimeSeconds: 0, overtimeId: '', wish: null };
test('settings and snapshots reject unsafe/invalid payloads', () => {
  assert.equal(sanitizeSettings({ name: ' ', size: 999, reportMinutes: -1 }).name, '小薪');
  assert.equal(sanitizeSettings({ quietStart: '24:00' }).quietStart, '23:00');
  assert.equal(sanitizeSnapshot({ ...snapshot, workAmount: NaN }), null);
  assert.equal(sanitizeSnapshot({ ...snapshot, state: '<script>' }), null);
  assert.deepEqual(sanitizeSnapshot(snapshot), snapshot);
});
test('positions recover after display removal including negative screen coordinates', () => {
  const displays = [{ x: -1920, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1040 }];
  assert.deepEqual(clampPosition({ x: -10, y: 9999 }, displays), { x: -320, y: 720 });
  assert.deepEqual(clampPosition({ x: -1800, y: 20 }, displays), { x: -1800, y: 20 });
});
test('quiet hours cover midnight and equal times mean all day', () => {
  assert.equal(isQuiet(sanitizeSettings(), new Date(2026, 8, 14, 23)), true);
  assert.equal(isQuiet(sanitizeSettings(), new Date(2026, 8, 15, 7, 59)), true);
  assert.equal(isQuiet(sanitizeSettings(), new Date(2026, 8, 15, 8)), false);
  assert.equal(isQuiet({ ...settings, quietEnabled: true, quietStart: '09:00', quietEnd: '09:00' }, new Date(now)), true);
});
test('opening the app does not celebrate old salary milestones', () => {
  assert.equal(nextReminder({ ...snapshot, workAmount: 500 }, settings, {}, now), null);
});
test('salary milestone triggers only on crossing once even after corrections', () => {
  const memory = {};
  nextReminder(snapshot, settings, memory, now);
  assert.equal(nextReminder({ ...snapshot, workAmount: 102 }, settings, memory, now + 1000).kind, 'celebrate');
  nextReminder(snapshot, settings, memory, now + 2000);
  assert.equal(nextReminder({ ...snapshot, workAmount: 105 }, settings, memory, now + 3000), null);
  assert.equal(nextReminder({ ...snapshot, businessDate: '2026-09-15', workAmount: 105 }, settings, memory, now + 4000), null);
});
test('overnight overtime warmth is keyed to its session, without backlog on resume', () => {
  const memory = {};
  const overtime = { ...snapshot, state: 'overtime', overtimeSeconds: 3 * 3600, overtimeId: 'session-1' };
  assert.match(nextReminder(overtime, settings, memory, now).text, /3 小时/);
  assert.equal(nextReminder({ ...overtime, businessDate: '2026-09-15' }, settings, memory, now + 1000), null);
  assert.match(nextReminder({ ...overtime, overtimeSeconds: 4 * 3600 }, settings, memory, now + 2000).text, /早点休息/);
});
test('snooze and quiet hours consume reminders without replaying them later', () => {
  const memory = { snoozedUntil: now + 60_000, focusEndsAt: now - 1 };
  const overtime = { ...snapshot, state: 'overtime', overtimeId: 'session-2', overtimeSeconds: 7200 };
  assert.equal(nextReminder(overtime, settings, memory, now), null);
  assert.equal(memory.focusEndsAt, 0);
  assert.equal(nextReminder(overtime, settings, memory, now + 61_000), null);
});
test('focus uses absolute time, completes once and no salary mutation', () => {
  const memory = { focusEndsAt: now + 25 * 60_000 };
  nextReminder(snapshot, settings, memory, now);
  assert.equal(nextReminder(snapshot, settings, memory, now + 26 * 60_000).kind, 'focus');
  assert.equal(memory.focusEndsAt, 0);
  assert.equal(nextReminder(snapshot, settings, memory, now + 26 * 60_000 + 1000), null);
  assert.equal(snapshot.workAmount, 80);
});
test('automatic work reports and breaks stop on rest days', () => {
  const memory = {};
  nextReminder({ ...snapshot, state: 'rest' }, settings, memory, now);
  assert.equal(nextReminder({ ...snapshot, state: 'rest' }, settings, memory, now + 5 * 3600_000), null);
});
test('privacy masks milestone and report amounts', () => {
  const privateSettings = { ...settings, hideAmounts: true };
  assert.doesNotMatch(report(snapshot, privateSettings), /80|¥/);
  const memory = {};
  nextReminder(snapshot, privateSettings, memory, now);
  assert.doesNotMatch(nextReminder({ ...snapshot, workAmount: 100 }, privateSettings, memory, now + 1000).text, /100|¥/);
});
test('wish completion celebrates the tracked wish only once', () => {
  const memory = {};
  nextReminder({ ...snapshot, wish: { id: 'a', name: '旅行', progress: .9 } }, settings, memory, now);
  assert.match(nextReminder({ ...snapshot, wish: { id: 'a', name: '旅行', progress: 1 } }, settings, memory, now + 1000).text, /旅行/);
  assert.equal(nextReminder({ ...snapshot, wish: { id: 'b', name: '电脑', progress: 1 } }, settings, memory, now + 2000), null);
});
