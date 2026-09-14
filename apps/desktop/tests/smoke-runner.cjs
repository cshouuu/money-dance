const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (await check()) return; await delay(150); }
  throw new Error(`Timed out: ${description}`);
}
async function run({ app, mainWindow, petWindow, openPage }) {
  const output = path.resolve(__dirname, '../../../output');
  await fs.mkdir(output, { recursive: true });
  const js = code => mainWindow.webContents.executeJavaScript(code);
  const petJS = code => petWindow.webContents.executeJavaScript(code);
  const errors = [];
  for (const win of [mainWindow, petWindow]) win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await until(() => js("document.querySelector('h1') !== null && !!window.moneyDanceDesktop"), 'main window boots');
  await until(() => petJS("document.querySelector('.pet-toolbar') !== null"), 'transparent pet boots');
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await petJS('typeof process'), 'undefined');
  const before = await js('window.moneyDanceDesktop.getState()');
  assert.ok(before.snapshot);
  assert.equal(petWindow.isAlwaysOnTop(), true);
  assert.equal(petWindow.isResizable(), false);
  mainWindow.hide();
  await delay(2200);
  const hidden = await js('window.moneyDanceDesktop.getState()');
  assert.ok(hidden.snapshot.updatedAt > before.snapshot.updatedAt, 'salary continues syncing with main window hidden');
  const forged = { ...hidden.snapshot, workAmount: 12345678, updatedAt: Date.now() };
  await petJS(`window.moneyDanceDesktop.publish(${JSON.stringify(forged)})`);
  assert.notEqual((await js('window.moneyDanceDesktop.getState()')).snapshot.workAmount, 12345678, 'pet cannot forge salary');
  assert.equal(await petJS("window.moneyDanceDesktop.saveSettings({}).then(() => false, () => true)"), true, 'pet cannot write settings');
  assert.equal(await js("window.moneyDanceDesktop.openPage('https://evil.invalid').then(() => false, () => true)"), true);
  await petJS("window.moneyDanceDesktop.action('focus')");
  assert.ok((await js('window.moneyDanceDesktop.getState()')).focusEndsAt > Date.now());
  await petJS("window.moneyDanceDesktop.action('cancel-focus')");
  assert.equal((await js('window.moneyDanceDesktop.getState()')).focusEndsAt, 0);
  await petJS("window.moneyDanceDesktop.action('snooze')");
  assert.ok((await js('window.moneyDanceDesktop.getState()')).snoozedUntil > Date.now());
  await petJS("window.moneyDanceDesktop.action('unsnooze')");
  openPage('/pet');
  await until(() => js("!!document.querySelector('.pet-preview-stage')"), 'pet studio opens');
  await js("document.querySelector('.pet-mood-picker button:nth-child(3)').click()");
  assert.equal(await js("!!document.querySelector('.stage-overtime')"), true);
  await delay(600); // Wait for the compositor after React's lazy route resolves.
  await fs.writeFile(path.join(output, 'windows-pet-studio.png'), (await mainWindow.webContents.capturePage()).toPNG());
  await petJS("window.moneyDanceDesktop.action('pet')");
  await delay(250);
  await fs.writeFile(path.join(output, 'windows-pet-floating.png'), (await petWindow.webContents.capturePage()).toPNG());
  await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings, hideAmounts:true, name:'测试搭子'}))");
  await petJS("window.moneyDanceDesktop.action('report')");
  await delay(250);
  assert.doesNotMatch(await petJS("document.querySelector('.pet-live-bubble').textContent"), /¥/);
  await mainWindow.reload();
  await until(() => js("!!document.querySelector('h1')"), 'reload preserves storage origin');
  assert.equal((await js('window.moneyDanceDesktop.getState()')).settings.name, '测试搭子');
  const { dialog } = require('electron');
  const sharp = require('sharp');
  const fixture = path.join(app.getPath('userData'), 'test-photo.png');
  await sharp(path.resolve(__dirname, '../../web/public/pet-default.svg')).flatten({ background: '#eeeedd' }).png().toFile(fixture);
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
  try {
    const preview = await js("window.moneyDanceDesktop.createPet('extract')");
    assert.match(preview, /^data:image\/png;base64,/);
    await js('window.moneyDanceDesktop.usePet()');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).image, preview, 'local inference worker saves chosen pet');
    await mainWindow.reload();
    await until(() => js("!!document.querySelector('h1')"), 'custom pet survives reload');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).image, preview);
  } finally { dialog.showOpenDialog = originalDialog; }
  for (const route of ['/convert', '/summary', '/slacking', '/overtime', '/attendance', '/assets', '/journey', '/settings']) {
    mainWindow.webContents.send('desktop:navigate', route);
    await until(() => js(`location.pathname === ${JSON.stringify(route)} && document.querySelector('main').textContent.length > 30`), `route ${route}`);
    if (route === '/attendance') {
      await mainWindow.reload();
      await until(() => js("location.pathname === '/attendance' && !!document.querySelector('h1')"), 'direct nested route reload');
    }
  }
  await petJS("window.moneyDanceDesktop.action('hide')");
  assert.equal(petWindow.isVisible(), false);
  assert.deepEqual(errors, [], 'no renderer console errors');
  console.log('WINDOWS SMOKE PASSED: routes, hidden salary sync, IPC roles, focus, snooze, privacy, settings, transparent window, local image inference and persistence.');
  app.quit();
}
module.exports = { run };
