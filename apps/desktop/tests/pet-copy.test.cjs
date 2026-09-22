const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSettings } = require('../src/contract.cjs');
const { bubbleText } = require('../src/pet-copy.cjs');
const { nextReminder, report } = require('../src/reminders.cjs');
test('old settings default to random actions, custom copy survives JSON persistence', () => {
  assert.equal(sanitizeSettings({}).randomActions, true);
  const settings = sanitizeSettings({ randomActions: false, bubbleTexts: { love: ['  你好  ', '', 42, '再抱一下'] } });
  assert.equal(settings.randomActions, false);
  assert.deepEqual(settings.bubbleTexts.love, ['你好', '再抱一下']);
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.equal(bubbleText(settings, 'love', '默认', () => 0.99), '再抱一下');
  assert.equal(bubbleText(settings, 'break', '默认'), '默认');
});
test('custom copy is bounded and unknown scenes cannot replace reports', () => {
  const settings = sanitizeSettings({ bubbleTexts: { love: Array(20).fill('😀'.repeat(130)), report: ['假收入'] } });
  assert.equal(settings.bubbleTexts.love.length, 10);
  assert.equal([...settings.bubbleTexts.love[0]].length, 120);
  assert.equal(settings.bubbleTexts.report, undefined);
  assert.doesNotThrow(() => sanitizeSettings(null));
});
test('custom reminders retain timing and quiet suppression', () => {
  const now = new Date(2026, 8, 22, 12).getTime();
  const snapshot = { state: 'working', businessDate: '2026-09-22', workAmount: 12, overtimeAmount: 0 };
  const settings = sanitizeSettings({ quietEnabled: false, breakMinutes: 30, bubbleTexts: { break: ['记得喝水呀'] } });
  const memory = { lastBreak: now - 31 * 60_000, lastReport: now };
  assert.equal(nextReminder(snapshot, settings, { ...memory }, now).text, '记得喝水呀');
  assert.equal(nextReminder(snapshot, { ...settings, quietEnabled: true, quietStart: '00:00', quietEnd: '00:00' }, { ...memory }, now), null);
  assert.match(report(snapshot, settings), /12\.00/);
  assert.doesNotMatch(report(snapshot, { ...settings, hideAmounts: true }), /12\.00/);
});
