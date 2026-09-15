const { app, BrowserWindow, Menu, Tray, ipcMain, protocol, net, shell, screen, dialog, Notification, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const { sanitizeSettings, sanitizeSnapshot, ROUTES } = require('./contract.cjs');
const { layoutPet, sanitizeMetrics } = require('./pet-layout.cjs');
const { nextReminder, report } = require('./reminders.cjs');
const { publicPack, bindingsFor, LIMIT: PACK_LIMIT } = require('./pet-pack.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'moneydance', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const ORIGIN = 'moneydance://app';
// A stable product directory is independent of workspace/package names and release versions.
app.setPath('userData', path.join(app.getPath('appData'), 'MoneyDance'));
const customUserData = app.commandLine.getSwitchValue('user-data-dir');
if (customUserData && path.isAbsolute(customUserData)) app.setPath('userData', customUserData);
if (!app.isPackaged && process.env.MONEY_DANCE_SMOKE === '1') app.setPath('userData', path.join(app.getPath('temp'), `moneydance-smoke-${process.pid}`));
let mainWindow, petWindow, tray, quitting = false, settings, saved = {}, snapshot = null, message = null;
let image = null, candidate = null, worker = null, extracting = false, extractionGeneration = 0, dragStart = null, positionTimer;
let memory = {}, lastMemorySave = 0;
let petMetrics = { bodyWidth: 160, bodyHeight: 189, panelWidth: 0, panelHeight: 0 }, petLayout = null;
let activePack = null, pendingPack = null, pendingPackBytes = null, packWorker = null, importingPack = false, packGeneration = 0;
const settingsPath = () => path.join(app.getPath('userData'), 'desktop-pet.json');
const imagePath = () => path.join(app.getPath('userData'), 'desktop-pet.png');
const packPath = () => path.join(app.getPath('userData'), 'desktop-pet-pack.zip');
function persist() {
  const data = { settings, position: saved.position, positionVersion: 2, petSource: saved.petSource, packBindings: saved.packBindings, memory: { ...memory, previous: undefined } };
  fs.writeFileSync(`${settingsPath()}.tmp`, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(`${settingsPath()}.tmp`, settingsPath());
}
function state() { return { settings, image: activePack ? null : image, pack: activePack ? publicPack(activePack) : null, snapshot, message, focusEndsAt: memory.focusEndsAt || 0, snoozedUntil: memory.snoozedUntil || 0 }; }
function decodePack(bytes, sender) {
  return new Promise((resolve, reject) => {
    const task = new Worker(path.join(__dirname, 'pet-pack-worker.cjs'), { workerData: { bytes }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    packWorker = task;
    const timer = setTimeout(() => { void task.terminate(); reject(new Error('动作包处理超时，请减少帧数后重试。')); }, 90_000);
    let settled = false;
    task.on('message', data => {
      if (data.progress) { if (sender && !sender.isDestroyed()) sender.send('desktop:progress', data.progress); }
      else { settled = true; clearTimeout(timer); if (data.error) reject(new Error(data.error)); else resolve(data.pack); }
    });
    task.once('error', () => reject(new Error('动作包处理失败，请检查素材。')));
    task.once('exit', () => { clearTimeout(timer); if (packWorker === task) packWorker = null; if (!settled) reject(new Error('动作包导入已取消。')); });
  });
}
function broadcast(snapshotOnly = false) {
  const update = snapshotOnly ? { snapshot, focusEndsAt: memory.focusEndsAt || 0, snoozedUntil: memory.snoozedUntil || 0 } : state();
  for (const win of [mainWindow, petWindow]) if (win && !win.isDestroyed()) win.webContents.send('desktop:state-changed', update);
}
function assertSender(event, role = 'either') {
  const win = role === 'main' ? mainWindow : role === 'pet' ? petWindow : BrowserWindow.fromWebContents(event.sender);
  if (!win || ![mainWindow, petWindow].includes(win) || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame
    || !event.senderFrame.url.startsWith(`${ORIGIN}/`)) throw new Error('无效的桌面请求');
}
function notify(text, kind = 'report', automatic = false) {
  message = { id: `${Date.now()}-${Math.random()}`, text, kind, automatic, at: Date.now() };
  if (automatic && settings.notifications && Notification.isSupported()) {
    new Notification({ title: `${settings.name} · MoneyDance`, body: text, silent: true }).show();
  }
  broadcast();
}
function openPage(route = '/') {
  if (!ROUTES.includes(route)) throw new Error('未知页面');
  mainWindow.show(); mainWindow.focus();
  mainWindow.webContents.send('desktop:navigate', route);
}
function harden(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) {
      event.preventDefault();
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
}
function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 MoneyDance', click: () => openPage('/') },
    { label: '我的桌宠', click: () => openPage('/pet') },
    { label: settings.enabled ? '隐藏桌宠' : '显示桌宠', click: () => { settings.enabled = !settings.enabled; applySettings(); } },
    { label: '桌宠回到屏幕右下角', click: () => { saved.position = null; placePet(); persist(); } },
    { label: '暂停提醒 30 分钟', click: () => { memory.snoozedUntil = Date.now() + 30 * 60_000; persist(); broadcast(); } },
    { type: 'separator' },
    { label: '退出 MoneyDance', click: () => app.quit() },
  ]));
}
function placePet() {
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays().sort((a, b) => Number(b.id === primary.id) - Number(a.id === primary.id)).map(display => display.workArea);
  petLayout = layoutPet(saved.position, displays, petMetrics);
  saved.position = petLayout.anchor;
  petWindow.setBounds(petLayout.bounds);
  petWindow.webContents.send('desktop:layout-changed', petLayout);
  return petLayout;
}
function applySettings() {
  if (settings.enabled) petWindow.showInactive(); else petWindow.hide();
  refreshTray(); persist(); broadcast();
}
function setupIPC() {
  ipcMain.handle('desktop:layout', (event, metrics) => {
    assertSender(event, 'pet'); petMetrics = sanitizeMetrics(metrics); return placePet();
  });
  ipcMain.handle('desktop:import-pack', async event => {
    assertSender(event, 'main');
    if (extracting || importingPack) throw new Error('请等待当前素材处理完成');
    importingPack = true; pendingPack = null; pendingPackBytes = null; candidate = null;
    const generation = ++packGeneration;
    try {
      const chosen = await dialog.showOpenDialog(mainWindow, { title: '导入桌宠动作包', properties: ['openFile'], filters: [{ name: 'MoneyDance 动作包（ZIP，最多 25 MB）', extensions: ['zip'] }] });
      if (chosen.canceled || generation !== packGeneration) return null;
      if (fs.statSync(chosen.filePaths[0]).size > PACK_LIMIT) throw new Error('动作包不能超过 25 MB');
      const bytes = fs.readFileSync(chosen.filePaths[0]);
      const pack = await decodePack(bytes, event.sender);
      if (generation !== packGeneration) return null;
      pendingPack = pack; pendingPackBytes = bytes;
      return publicPack(pack);
    } finally { importingPack = false; }
  });
  ipcMain.handle('desktop:use-pack', (event, id, bindings) => {
    assertSender(event, 'main');
    if (importingPack || !pendingPack || pendingPack.id !== id) throw new Error('请先导入并预览动作包');
    const validated = bindingsFor(pendingPack.clips, bindings);
    fs.writeFileSync(`${packPath()}.tmp`, pendingPackBytes); fs.renameSync(`${packPath()}.tmp`, packPath());
    activePack = { ...pendingPack, bindings: validated }; pendingPack = null; pendingPackBytes = null;
    saved.petSource = 'pack'; saved.packBindings = validated; settings.enabled = true;
    applySettings(); return state();
  });
  ipcMain.handle('desktop:pack-bindings', (event, id, bindings) => {
    assertSender(event, 'main');
    if (!activePack || activePack.id !== id) throw new Error('当前动作包已变更，请重试');
    activePack.bindings = bindingsFor(activePack.clips, bindings); saved.packBindings = activePack.bindings;
    persist(); broadcast(); return state();
  });
  ipcMain.handle('desktop:pack-template', async event => {
    assertSender(event, 'main');
    const result = await dialog.showSaveDialog(mainWindow, { title: '保存桌宠动作包模板', defaultPath: 'MoneyDance-动作包模板.zip', filters: [{ name: 'ZIP 动作包', extensions: ['zip'] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.copyFile(path.join(__dirname, '../web/pet-pack-template.zip'), result.filePath);
    return true;
  });
  ipcMain.handle('desktop:state', event => { assertSender(event); return state(); });
  ipcMain.handle('desktop:settings', (event, input) => {
    assertSender(event, 'main');
    const next = sanitizeSettings(input);
    if (next.launchAtLogin !== settings.launchAtLogin) {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
      else next.launchAtLogin = false;
    }
    settings = next;
    if (settings.hideAmounts) message = null;
    applySettings(); return state();
  });
  ipcMain.on('desktop:snapshot', (event, input) => {
    try { assertSender(event, 'main'); } catch { return; }
    const next = sanitizeSnapshot(input);
    if (!next || Math.abs(Date.now() - next.updatedAt) > 30_000) return;
    snapshot = next;
    const reminder = nextReminder(snapshot, settings, memory);
    if (reminder) notify(reminder.text, reminder.kind, true);
    else broadcast(true);
    if (Date.now() - lastMemorySave > 60_000 || reminder) { lastMemorySave = Date.now(); persist(); }
  });
  ipcMain.handle('desktop:open', (event, route) => { assertSender(event); openPage(route); });
  ipcMain.handle('desktop:action', (event, action) => {
    assertSender(event);
    switch (action) {
      case 'report': notify(snapshot && Date.now() - snapshot.updatedAt < 15_000 ? report(snapshot, settings) : '计薪数据正在刷新，打开 MoneyDance 看看吧。'); break;
      case 'pet': notify(['收到你的摸摸啦，今天也一起慢慢来。', '你值得被好好照顾，不用每一分钟都很厉害。', '我在呢。先呼吸一下，再做下一件小事。'][Math.floor(Math.random() * 3)], 'love'); break;
      case 'focus': memory.focusEndsAt = Date.now() + 25 * 60_000; notify('陪你专注 25 分钟。到点一起休息，不改变你的计薪或摸鱼记录。', 'focus'); break;
      case 'cancel-focus': memory.focusEndsAt = 0; notify('专注计时已结束，按自己的节奏来就好。', 'rest'); break;
      case 'snooze': memory.snoozedUntil = Date.now() + 30 * 60_000; notify('我会安静陪你 30 分钟，需要我时摸摸就好。', 'rest'); break;
      case 'unsnooze': memory.snoozedUntil = 0; notify('提醒恢复啦，我会轻轻提醒你。'); break;
      case 'hide': settings.enabled = false; applySettings(); break;
      default: throw new Error('未知桌宠操作');
    }
    persist(); broadcast(); return state();
  });
  ipcMain.on('desktop:interactive', (event, value) => {
    try { assertSender(event, 'pet'); } catch { return; }
    if (typeof value === 'boolean') petWindow.setIgnoreMouseEvents(!value, { forward: true });
  });
  ipcMain.on('desktop:drag', (event, phase) => {
    try { assertSender(event, 'pet'); } catch { return; }
    if (phase === 'start') dragStart = { cursor: screen.getCursorScreenPoint(), position: { ...saved.position } };
    if (phase === 'move' && dragStart) {
      const cursor = screen.getCursorScreenPoint();
      saved.position = { x: dragStart.position.x + cursor.x - dragStart.cursor.x, y: dragStart.position.y + cursor.y - dragStart.cursor.y };
      placePet();
    }
    if (phase === 'end') { dragStart = null; placePet(); persist(); }
  });
  ipcMain.handle('desktop:create-pet', async (event, mode) => {
    assertSender(event, 'main');
    if (!['extract', 'transparent'].includes(mode)) throw new Error('请选择抠图或透明图片');
    if (extracting || importingPack) throw new Error('已有素材正在处理中');
    extracting = true; candidate = null; pendingPack = null; pendingPackBytes = null;
    const generation = ++extractionGeneration;
    try {
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择桌宠照片', properties: ['openFile'], filters: [{ name: '图片（最多 15 MB）', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (result.canceled || generation !== extractionGeneration) return null;
      const selectedPath = result.filePaths[0];
      if (fs.statSync(selectedPath).size > 15 * 1024 * 1024) throw new Error('图片太大，请选择 15 MB 以内的图片');
      const bytes = fs.readFileSync(selectedPath);
      const output = await new Promise((resolve, reject) => {
        const task = new Worker(path.join(__dirname, 'extract-worker.cjs'), { workerData: { bytes, mode, modelPath: path.join(__dirname, '../assets/u2netp.onnx') } });
        worker = task;
        const timeout = setTimeout(() => { void task.terminate(); reject(new Error('处理超时，请选择主体更清晰的照片重试')); }, 90_000);
        task.on('message', data => {
          if (data.progress) event.sender.send('desktop:progress', data.progress);
          else if (data.error) reject(new Error(data.error));
          else resolve(Buffer.from(data.png));
        });
        task.once('error', () => reject(new Error('图片处理失败，请重试或使用透明 PNG')));
        task.once('exit', code => { clearTimeout(timeout); if (worker === task) worker = null; if (code !== 0) reject(new Error('图片处理已取消')); });
      });
      if (generation !== extractionGeneration) return null;
      candidate = output;
      return `data:image/png;base64,${output.toString('base64')}`;
    } finally { extracting = false; }
  });
  ipcMain.handle('desktop:cancel-extraction', async event => {
    assertSender(event, 'main'); extractionGeneration++; candidate = null;
    packGeneration++; pendingPack = null; pendingPackBytes = null;
    if (packWorker) await packWorker.terminate();
    if (worker) await worker.terminate();
  });
  ipcMain.handle('desktop:use-pet', event => {
    assertSender(event, 'main'); if (!candidate) throw new Error('请先选择图片并完成预览');
    fs.writeFileSync(`${imagePath()}.tmp`, candidate); fs.renameSync(`${imagePath()}.tmp`, imagePath());
    image = `data:image/png;base64,${candidate.toString('base64')}`; candidate = null;
    activePack = null; saved.petSource = 'photo'; saved.packBindings = undefined;
    settings.enabled = true; applySettings(); return state();
  });
  ipcMain.handle('desktop:reset-pet', event => {
    assertSender(event, 'main');
    if (extracting || importingPack) throw new Error('请先取消当前导入');
    saved.petSource = 'default'; saved.packBindings = undefined; persist();
    image = null; candidate = null; activePack = null; pendingPack = null; pendingPackBytes = null;
    fs.rmSync(imagePath(), { force: true }); fs.rmSync(packPath(), { force: true });
    broadcast(); return state();
  });
}
async function boot() {
  try { saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { saved = {}; }
  settings = sanitizeSettings(saved.settings);
  petMetrics = { bodyWidth: settings.size, bodyHeight: settings.size + 29, panelWidth: 0, panelHeight: 0 };
  if (saved.positionVersion !== 2 && Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)) {
    saved.position = { x: saved.position.x + 160, y: saved.position.y + 342 };
  }
  memory = saved.memory && typeof saved.memory === 'object' ? saved.memory : {};
  memory.previous = undefined;
  if (saved.petSource === 'pack') {
    try {
      if (fs.statSync(packPath()).size > PACK_LIMIT) throw new Error('Stored pack exceeds size limit');
      activePack = await decodePack(fs.readFileSync(packPath()));
      try { activePack.bindings = bindingsFor(activePack.clips, saved.packBindings); } catch { /* Keep manifest bindings if a saved mapping is stale. */ }
    } catch { message = { id: `pack-error-${Date.now()}`, text: '动作包无法读取，暂时由小薪陪伴。请在我的桌宠中重新导入。', kind: 'rest', at: Date.now(), automatic: false }; }
  } else if (saved.petSource !== 'default') {
    try { const bytes = fs.readFileSync(imagePath()); if (bytes.length < 5 * 1024 * 1024) image = `data:image/png;base64,${bytes.toString('base64')}`; } catch {}
  }
  const webRoot = path.resolve(__dirname, '../web');
  const inlineHashes = [...fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => `'sha256-${createHash('sha256').update(match[1].replace(/\r\n?/g, '\n')).digest('base64')}'`).join(' ');
  protocol.handle('moneydance', async request => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('', { status: 403 });
    if (url.pathname.startsWith('/pet-pack/')) {
      const match = /^\/pet-pack\/([a-f0-9]{64})\/([a-z][a-z0-9_-]{0,23})\.png$/.exec(url.pathname);
      const pack = match && [pendingPack, activePack].find(item => item?.id === match[1]);
      const bytes = pack && Object.hasOwn(pack.sheets, match[2]) && pack.sheets[match[2]];
      return bytes ? new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } }) : new Response('', { status: 404 });
    }
    let relative;
    try { relative = decodeURIComponent(url.pathname); } catch { return new Response('', { status: 400 }); }
    if (relative === '/' || ROUTES.includes(relative)) relative = '/index.html';
    const target = path.resolve(webRoot, `.${relative}`);
    if (!target.startsWith(`${webRoot}${path.sep}`)) return new Response('', { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(target).toString());
      response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' ${inlineHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'`);
      return response;
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false };
  mainWindow = new BrowserWindow({ width: 1240, height: 850, minWidth: 850, minHeight: 620, title: 'MoneyDance', show: false, icon: path.join(__dirname, '../assets/icon.png'), webPreferences });
  petWindow = new BrowserWindow({ width: settings.size, height: settings.size + 29, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, webPreferences });
  Menu.setApplicationMenu(null);
  for (const win of [mainWindow, petWindow]) harden(win);
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  petWindow.on('close', event => { if (!quitting) { event.preventDefault(); settings.enabled = false; applySettings(); } });
  mainWindow.webContents.on('render-process-gone', () => { snapshot = null; broadcast(); if (!quitting) void mainWindow.reload(); });
  petWindow.webContents.on('render-process-gone', () => { if (!quitting) void petWindow.reload(); });
  tray = new Tray(path.join(__dirname, '../assets/icon.png'));
  tray.setToolTip('MoneyDance · 桌宠陪你，时间变成钱');
  tray.on('double-click', () => openPage('/'));
  setupIPC(); placePet(); refreshTray();
  const reposition = () => { clearTimeout(positionTimer); positionTimer = setTimeout(() => { placePet(); persist(); }, 300); };
  screen.on('display-removed', reposition); screen.on('display-metrics-changed', reposition);
  powerMonitor.on('resume', () => { memory.lastReport = Date.now(); memory.lastBreak = Date.now(); });
  await Promise.all([mainWindow.loadURL(`${ORIGIN}/`), petWindow.loadURL(`${ORIGIN}/pet.html`)]);
  if (!process.argv.includes('--hidden')) mainWindow.show();
  if (settings.enabled) petWindow.showInactive();
  // Integration smoke runner is opt-in, never active in installed builds.
  if (!app.isPackaged && process.env.MONEY_DANCE_SMOKE === '1') {
    require('../tests/smoke-runner.cjs').run({ app, mainWindow, petWindow, openPage }).catch(error => { console.error(error); app.exit(1); });
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) openPage('/'); });
  app.on('before-quit', () => { quitting = true; if (settings) persist(); if (worker) void worker.terminate(); if (packWorker) void packWorker.terminate(); });
  app.whenReady().then(boot).catch(error => { dialog.showErrorBox('MoneyDance 启动失败', String(error.message)); app.quit(); });
}
