// Tests the actual packaged app, including its ASAR/native inference runtime.
// Both debuggers bind only to loopback and are enabled only by this test launch.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function debuggerTarget(port, predicate) {
  for (let i = 0; i < 150; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = pages.find(predicate);
      if (target) return target.webSocketDebuggerUrl;
    } catch {}
    await delay(200);
  }
  throw new Error('Packaged app debugger did not become ready');
}
async function connect(url) {
  const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const value = JSON.parse(event.data);
    if (pending.has(value.id)) { const { resolve, reject, timeout } = pending.get(value.id); clearTimeout(timeout); pending.delete(value.id); value.error ? reject(new Error(value.error.message)) : resolve(value.result); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger request timed out: ${method}`)); }, 30_000);
    pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }));
  });
  return { call, close: () => ws.close(), evaluate: async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  } };
}
async function verify() {
  const appDir = process.platform === 'darwin' ? `mac${process.arch === 'arm64' ? '-arm64' : ''}/MoneyDance.app/Contents/MacOS/MoneyDance` : `win${process.arch === 'arm64' ? '-arm64' : ''}-unpacked/MoneyDance.exe`;
  const executable = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../release', appDir);
  await fs.access(executable);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'moneydance-package-'));
  const fixture = path.join(profile, 'photo.png');
  await require('sharp')(path.resolve(__dirname, '../tests/fixtures/sample-cat.svg')).flatten({ background: '#eeddcc' }).png().toFile(fixture);
  let expectedImage, expectedPack;
  for (let run = 0; run < 3; run++) {
    const rendererPort = await port(), mainPort = await port();
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.MONEY_DANCE_SMOKE;
    const child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${rendererPort}`, `--inspect=127.0.0.1:${mainPort}`, '--hidden'], { windowsHide: true, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let main, renderer, stderr = '';
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-12000); });
    try {
      main = await connect(await debuggerTarget(mainPort, () => true));
      assert.deepEqual(await main.evaluate('({platform:process.platform,arch:process.arch})'), { platform: process.platform, arch: process.arch }, 'packaged executable runs natively on the target architecture');
      renderer = await connect(await debuggerTarget(rendererPort, target => target.url === 'moneydance://app/'));
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        try { ready = await renderer.evaluate("!!document.querySelector('h1') && !!window.moneyDanceDesktop && window.moneyDanceDesktop.getState().then(s => !!s.snapshot)"); } catch {}
        if (!ready) await delay(150);
      }
      assert.ok(ready, 'packaged renderer becomes ready');
      const state = await renderer.evaluate('window.moneyDanceDesktop.getState()');
      assert.ok(state.snapshot, 'packaged app publishes salary');
      if (!run) {
        await main.evaluate(`process.mainModule.require('electron').dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[${JSON.stringify(fixture)}] })`);
        expectedImage = await renderer.evaluate("window.moneyDanceDesktop.createPet('extract')");
        assert.match(expectedImage, /^data:image\/png;base64,/, 'native worker loads packaged model and ONNX/sharp libraries');
        await renderer.evaluate('window.moneyDanceDesktop.usePet()');
        await renderer.evaluate("window.moneyDanceDesktop.getState().then(s => window.moneyDanceDesktop.saveSettings({...s.settings,name:'打包验证',hideAmounts:true}))");
        const packFile = path.resolve(__dirname, '../../web/public/pet-pack-template.zip');
        await main.evaluate(`process.mainModule.require('electron').dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[${JSON.stringify(packFile)}] })`);
        expectedPack = await renderer.evaluate('window.moneyDanceDesktop.importPack()');
        expectedPack.bindings.working = 'idle';
        await renderer.evaluate(`window.moneyDanceDesktop.usePack(${JSON.stringify(expectedPack.id)},${JSON.stringify(expectedPack.bindings)})`);
      } else if (run === 1) {
        assert.equal(state.image, null, 'pack replaces legacy photo across process restarts');
        assert.equal(state.pack.id, expectedPack.id, 'ZIP and decoded assets survive actual process restart');
        assert.equal(state.pack.bindings.working, 'idle', 'edited bindings persist');
        const src = state.pack.clips.love.src;
        assert.equal(await renderer.evaluate(`fetch(${JSON.stringify(src)}).then(r => r.ok && r.headers.get('content-type'))`), 'image/png');
        assert.equal(state.settings.name, '打包验证');
        assert.equal(state.settings.hideAmounts, true);
        await renderer.evaluate("window.moneyDanceDesktop.resetPet('mili')");
      } else {
        assert.equal(state.pack, null, 'preset replaces imported pack across process restarts');
        assert.equal(state.image, null);
        assert.equal(state.settings.presetId, 'mili', 'built-in preset survives a full process restart');
        assert.equal(state.settings.name, '打包验证', 'switching preserves custom name');
        await renderer.evaluate("window.moneyDanceDesktop.openPage('/pet')");
        let source;
        for (let attempt = 0; attempt < 100 && !source; attempt++) {
          source = await renderer.evaluate("document.querySelector('.pet-preview-stage [data-preset=mili] image')?.getAttribute('href')");
          if (!source) await delay(100);
        }
        assert.ok(source, 'saved preset rendered in packaged app');
        assert.equal(await renderer.evaluate(`fetch(${JSON.stringify(source)}).then(r=>r.ok && r.headers.get('content-type'))`), 'image/png', 'preset image included in ASAR');
      }
      if (process.platform === 'darwin') {
        assert.equal(await main.evaluate("!!process.mainModule.require('electron').Menu.getApplicationMenu()"), true, 'macOS application menu exists');
        await main.evaluate("process.mainModule.require('electron').app.emit('activate')");
        assert.equal(await main.evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='moneydance://app/' && w.isVisible())"), true, 'Dock activation restores the main window');
      }
      console.log(`Packaged ${process.platform}-${process.arch} test ${run + 1}/3 passed.`);
      await main.call('Runtime.evaluate', { expression: "setTimeout(() => process.mainModule.require('electron').app.quit(), 100)" });
      main.close(); renderer.close();
      await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('App did not exit')), 8000); child.once('exit', () => { clearTimeout(timeout); resolve(); }); });
    } catch (error) { console.error(stderr); throw error; }
    finally { main?.close(); renderer?.close(); if (child.exitCode === null) child.kill(); }
  }
  console.log(`PACKAGED ${process.platform}-${process.arch} PASSED: local inference, imported packs and built-in preset selection persist after restart.`);
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
