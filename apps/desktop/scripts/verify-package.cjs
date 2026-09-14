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
  const executable = path.resolve(__dirname, '../release/win-unpacked/MoneyDance.exe');
  await fs.access(executable);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'moneydance-package-'));
  const fixture = path.join(profile, 'photo.png');
  await require('sharp')(path.resolve(__dirname, '../../web/public/pet-default.svg')).flatten({ background: '#eeddcc' }).png().toFile(fixture);
  let expectedImage;
  for (let run = 0; run < 2; run++) {
    const rendererPort = await port(), mainPort = await port();
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.MONEY_DANCE_SMOKE;
    const child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${rendererPort}`, `--inspect=127.0.0.1:${mainPort}`, '--hidden'], { windowsHide: true, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let main, renderer;
    try {
      main = await connect(await debuggerTarget(mainPort, () => true));
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
      } else {
        assert.equal(state.image, expectedImage, 'chosen image persists across process restarts');
        assert.equal(state.settings.name, '打包验证');
        assert.equal(state.settings.hideAmounts, true);
      }
      console.log(`Packaged Windows test ${run + 1}/2 passed.`);
      await main.call('Runtime.evaluate', { expression: "setTimeout(() => process.mainModule.require('electron').app.quit(), 100)" });
      main.close(); renderer.close();
      await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('App did not exit')), 8000); child.once('exit', () => { clearTimeout(timeout); resolve(); }); });
    } finally { main?.close(); renderer?.close(); if (child.exitCode === null) child.kill(); }
  }
  console.log('PACKAGED WINDOWS PASSED: local model inference, native dependencies, image and settings persistence after restart.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
