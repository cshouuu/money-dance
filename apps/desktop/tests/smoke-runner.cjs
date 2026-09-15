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
  // Hosted desktops can enable Reduce Motion globally. Exercise animation with
  // a deterministic media preference; the app's reduced-motion setting is tested below.
  for (const win of [mainWindow, petWindow]) {
    console.log('Smoke display preferences:', await win.webContents.executeJavaScript("({hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})"));
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  }
  for (const win of [mainWindow, petWindow]) win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await until(() => js("document.querySelector('h1') !== null && !!window.moneyDanceDesktop"), 'main window boots');
  await until(() => petJS("document.querySelector('.pet-toolbar') !== null"), 'transparent pet boots');
  await require('./pet-layout-smoke.cjs').verifyLayout({ petWindow, js, petJS, until, output });
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
  await until(() => js("!!document.querySelector('.pet-illustrated image')"), 'illustrated pose atlas renders');
  assert.equal(await js("!!document.querySelector('.pet-prop')"), false, 'no emoji accessories on the character');
  const firstPose = await js("document.querySelector('.pet-character').dataset.pose");
  console.log('Studio animation state:', await js("window.moneyDanceDesktop.getState().then(s=>({hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,setting:s.settings.reducedMotion,pose:document.querySelector('.pet-character').dataset.pose}))"));
  await until(() => js(`document.querySelector('.pet-character').dataset.pose !== ${JSON.stringify(firstPose)}`), 'work changes its actual artwork frame');
  await js("document.querySelector('.pet-reaction-picker button:nth-child(1)').click()");
  await until(() => js("document.querySelector('.pet-character').dataset.motion === 'love'"), 'petting has its own performance');
  await js("document.querySelector('.pet-reaction-picker button:nth-child(2)').click()");
  await until(() => js("document.querySelector('.pet-character').dataset.motion === 'celebrate'"), 'celebration has different artwork');
  await js("document.querySelector('.pet-mood-picker button:nth-child(3)').click()");
  assert.equal(await js("!!document.querySelector('.stage-overtime')"), true);
  await until(() => js("document.querySelector('.pet-character').dataset.pose === '5'"), 'overtime raises a drink');
  await delay(180);
  await fs.writeFile(path.join(output, 'windows-pet-studio.png'), (await mainWindow.webContents.capturePage()).toPNG());
  await petJS("window.moneyDanceDesktop.action('pet')");
  await delay(1750);
  await fs.writeFile(path.join(output, 'windows-pet-floating.png'), (await petWindow.webContents.capturePage()).toPNG());
  await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings, hideAmounts:true, name:'测试搭子'}))");
  await petJS("window.moneyDanceDesktop.action('report')");
  await delay(250);
  assert.doesNotMatch(await petJS("document.querySelector('.pet-live-bubble').textContent"), /¥/);
  await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings,reducedMotion:true}))");
  const stillPose = await petJS("document.querySelector('.pet-character').dataset.pose");
  await delay(400);
  assert.equal(await petJS("document.querySelector('.pet-character').dataset.pose"), stillPose, 'reduced motion stops frame scheduling');
  await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings,reducedMotion:false}))");
  await mainWindow.reload();
  await until(() => js("!!document.querySelector('h1')"), 'reload preserves storage origin');
  assert.equal((await js('window.moneyDanceDesktop.getState()')).settings.name, '测试搭子');
  const { dialog } = require('electron');
  const sharp = require('sharp');
  const fixture = path.join(app.getPath('userData'), 'test-photo.png');
  await sharp(path.resolve(__dirname, 'fixtures/sample-cat.svg')).flatten({ background: '#eeeedd' }).png().toFile(fixture);
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
  const templatePath = path.resolve(__dirname, '../../web/public/pet-pack-template.zip');
  const originalSaveDialog = dialog.showSaveDialog;
  const exported = path.join(app.getPath('userData'), 'exported-template.zip');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exported });
  try { assert.equal(await js('window.moneyDanceDesktop.savePackTemplate()'), true); assert.deepEqual(await fs.readFile(exported), await fs.readFile(templatePath)); }
  finally { dialog.showSaveDialog = originalSaveDialog; }
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [templatePath] });
  try {
    openPage('/pet');
    await until(() => js("!!document.querySelector('.pet-import-pack')"), 'pack importer opens');
    await js("document.querySelector('.pet-import-pack').click()");
    await until(() => js("!!document.querySelector('.pet-pack-bindings') && !!document.querySelector('.pet-candidate-actions')"), 'ZIP renders as a draft');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).pack, null, 'preview does not replace current photo');
    assert.ok((await js('window.moneyDanceDesktop.getState()')).image);
    const src = await js("document.querySelector('.pet-imported image').getAttribute('href')");
    assert.equal(await js(`fetch(${JSON.stringify(src)}).then(r => r.headers.get('content-type'))`), 'image/png');
    await js("document.querySelector('.pet-mood-picker button:nth-child(1)').click()");
    const customPose = await js("document.querySelector('.pet-imported').dataset.pose");
    await until(() => js(`document.querySelector('.pet-imported').dataset.pose !== ${JSON.stringify(customPose)}`), 'imported frames play');
    await js("document.querySelector('.pet-candidate-actions .pet-primary').click()");
    await until(() => petJS("!!document.querySelector('.pet-imported')"), 'confirmed pack appears in floating window');
    const packState = await js('window.moneyDanceDesktop.getState()');
    assert.equal(packState.image, null);
    assert.equal(await petJS(`window.moneyDanceDesktop.savePackBindings(${JSON.stringify(packState.pack.id)},{}).then(()=>false,()=>true)`), true, 'pet window cannot mutate pack bindings');
    const mapped = { ...packState.pack.bindings, love: 'idle', working: 'idle' };
    await js(`window.moneyDanceDesktop.savePackBindings(${JSON.stringify(packState.pack.id)},${JSON.stringify(mapped)})`);
    await petJS("window.moneyDanceDesktop.action('pet')");
    await until(() => petJS("document.querySelector('.pet-imported').dataset.motion === 'love'"), 'mapped interaction starts');
    assert.equal(await petJS("document.querySelector('.pet-imported').dataset.clip"), 'idle');
    await until(() => petJS("document.querySelector('.pet-imported').dataset.motion !== 'love'"), 'interaction returns after imported duration');
    await js(`window.moneyDanceDesktop.savePackBindings(${JSON.stringify(packState.pack.id)},${JSON.stringify(packState.pack.bindings)})`);
    await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings,reducedMotion:true}))");
    await delay(180);
    const packStill = await petJS("document.querySelector('.pet-imported').dataset.pose");
    await delay(450);
    assert.equal(await petJS("document.querySelector('.pet-imported').dataset.pose"), packStill);
    await js("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings,reducedMotion:false}))");
    await fs.writeFile(path.join(output, 'windows-pet-pack-studio.png'), (await mainWindow.webContents.capturePage()).toPNG());
    await petJS("window.moneyDanceDesktop.action('pet')");
    await delay(1800);
    await fs.writeFile(path.join(output, 'windows-pet-pack-floating.png'), (await petWindow.webContents.capturePage()).toPNG());
    await js("window.moneyDanceDesktop.importPack()");
    await js("window.moneyDanceDesktop.cancelExtraction()");
    assert.equal(await js(`window.moneyDanceDesktop.usePack(${JSON.stringify(packState.pack.id)},{}).then(()=>false,()=>true)`), true, 'discarded pack cannot be adopted');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).pack.id, packState.pack.id, 'discard leaves active pack unchanged');
    await js("window.__pendingPackImport = window.moneyDanceDesktop.importPack().catch(() => null); void 0");
    await js('window.moneyDanceDesktop.cancelExtraction()');
    await js('window.__pendingPackImport');
    assert.equal(await js(`window.moneyDanceDesktop.usePack(${JSON.stringify(packState.pack.id)},{}).then(()=>false,()=>true)`), true, 'cancel during processing invalidates a late result');
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
    assert.equal(await js('window.moneyDanceDesktop.importPack().then(()=>false,()=>true)'), true, 'invalid package rejected');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).pack.id, packState.pack.id, 'failed import leaves active pack unchanged');
    await mainWindow.reload();
    await until(() => js("!!document.querySelector('h1')"), 'pack survives renderer reload');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).pack.id, packState.pack.id);
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
  console.log('WINDOWS SMOKE PASSED: routes, salary sync, IPC roles, reminders, local extraction, ZIP preview/adoption, bindings, frame playback, reduced motion, export, discard and failed import recovery.');
  app.quit();
}
module.exports = { run };
