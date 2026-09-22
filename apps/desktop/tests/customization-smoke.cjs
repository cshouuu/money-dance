const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function verifyCustomization({ app, mainWindow, js, petJS, until }) {
  const initial = await js('window.moneyDanceDesktop.getState()');
  await until(() => js("!!document.querySelector('textarea[aria-label=\"自定义气泡文案\"]')"), 'custom copy editor renders');
  await js(`(() => { const field = document.querySelector('textarea[aria-label="自定义气泡文案"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '测试专属文案'); field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(() => js("document.querySelector('.pet-copy-preview').textContent === '测试专属文案'"), 'live preview uses draft');
  await js("document.querySelector('.pet-copy-settings .pet-primary').click()");
  await until(async () => (await js('window.moneyDanceDesktop.getState()')).settings.bubbleTexts.love[0] === '测试专属文案', 'copy saved through UI');
  await petJS("window.moneyDanceDesktop.action('pet')");
  await until(() => petJS("document.querySelector('.pet-live-bubble')?.textContent === '测试专属文案'"), 'custom copy reaches actual floating bubble');
  const stored = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'desktop-pet.json'), 'utf8'));
  assert.deepEqual(stored.settings.bubbleTexts.love, ['测试专属文案']);
  await mainWindow.webContents.reload();
  await until(() => js("document.querySelector('textarea')?.value === '测试专属文案'"), 'editor survives reload');
  await js("window.moneyDanceDesktop.getState().then(s=>window.moneyDanceDesktop.saveSettings({...s.settings,randomActions:true,reducedMotion:false}))");
  await until(() => petJS("document.querySelector('.pet-character')?.dataset.motion !== 'love'"), 'interaction ends');
  const first = await petJS("document.querySelector('.pet-character').dataset.motion");
  await until(() => petJS(`document.querySelector('.pet-character').dataset.motion !== ${JSON.stringify(first)}`), 'random action changes independently');
  await js(`window.moneyDanceDesktop.saveSettings(${JSON.stringify({ ...initial.settings, randomActions: false })})`);
  await until(async () => {
    const state = await js('window.moneyDanceDesktop.getState()');
    return await petJS("document.querySelector('.pet-character').dataset.motion") === state.snapshot.state;
  }, 'state mode restores actual work state');
  await js(`window.moneyDanceDesktop.saveSettings(${JSON.stringify(initial.settings)})`);
}
module.exports = { verifyCustomization };
