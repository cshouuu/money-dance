const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function verifyLayout({ petWindow, js, petJS, until, output }) {
  const { screen } = require('electron');
  const initial = await js('window.moneyDanceDesktop.getState()');
  const originalCursor = screen.getCursorScreenPoint;
  const originalIgnore = petWindow.setIgnoreMouseEvents;
  let ignoring = null;
  petWindow.setIgnoreMouseEvents = function(value, options) { ignoring = value; return originalIgnore.call(this, value, options); };
  const body = () => petJS("(() => {const r=document.querySelector('.pet-floating-body').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  const anchor = async () => { const b = await body(), w = petWindow.getBounds(); return { x: w.x + b.x + b.width / 2, y: w.y + b.y + b.height }; };
  try {
    await js("window.moneyDanceDesktop.getState().then(s=>window.moneyDanceDesktop.saveSettings({...s.settings,reducedMotion:true}))");
    await petJS("window.moneyDanceDesktop.action('pet')");
    await until(() => petJS("!!document.querySelector('.pet-live-bubble') && document.querySelector('.pet-live-bubble').getBoundingClientRect().bottom + 8 <= document.querySelector('.pet-floating-body').getBoundingClientRect().top + 1"), 'bubble is adjacent above pet');
    const before = await anchor();
    await petJS("document.querySelector('[aria-label=桌宠菜单]').click()");
    await until(() => petJS("!!document.querySelector('.pet-popup') && document.querySelector('.pet-popup').style.visibility === 'visible'"), 'menu expands window');
    await delay(150);
    assert.deepEqual(await anchor(), before, 'opening menu does not move pet');
    await petJS("document.querySelector('[aria-label=桌宠菜单]').click()");
    for (const size of [120, 200, 160]) {
      await js(`window.moneyDanceDesktop.getState().then(s=>window.moneyDanceDesktop.saveSettings({...s.settings,size:${size}}))`);
      await until(async () => Math.abs((await body()).width - size) < 1, 'body follows selected size');
      await delay(100);
      const b = await body();
      assert.ok(b.height <= size + 30, 'no invisible bottom padding');
    }
    // Move through the same native drag IPC, with deterministic screen cursor coordinates.
    let cursor = { x: 0, y: 0 };
    screen.getCursorScreenPoint = () => cursor;
    await petJS("window.moneyDanceDesktop.drag('start')");
    cursor = { x: -10000, y: -10000 };
    await petJS("window.moneyDanceDesktop.drag('move'); window.moneyDanceDesktop.drag('end')");
    await delay(180);
    await petJS("window.moneyDanceDesktop.action('pet')");
    await until(() => petJS("document.querySelector('.pet-live-bubble')?.dataset.placement === 'below'"), 'top edge flips bubble below');
    const bounds = petWindow.getBounds(), b = await body();
    const area = screen.getDisplayMatching(bounds).workArea;
    assert.equal(bounds.x + b.x, area.x, 'pet body reaches left work-area edge');
    assert.equal(bounds.y + b.y, area.y, 'pet body reaches top work-area edge');
    await fs.writeFile(path.join(output, 'windows-pet-edge-top.png'), (await petWindow.webContents.capturePage()).toPNG());
    cursor = { x: 0, y: 0 };
    await petJS("window.moneyDanceDesktop.drag('start')");
    cursor = { x: 10000, y: 10000 };
    await petJS("window.moneyDanceDesktop.drag('move'); window.moneyDanceDesktop.drag('end')");
    await delay(180);
    await petJS("window.moneyDanceDesktop.action('pet')");
    await until(() => petJS("document.querySelector('.pet-live-bubble')?.dataset.placement === 'above'"), 'bottom edge keeps bubble above');
    const bottomBounds = petWindow.getBounds(), bottomBody = await body(), bottomArea = screen.getDisplayMatching(bottomBounds).workArea;
    assert.equal(bottomBounds.x + bottomBody.x + bottomBody.width, bottomArea.x + bottomArea.width);
    assert.equal(bottomBounds.y + bottomBody.y + bottomBody.height, bottomArea.y + bottomArea.height);
    await fs.writeFile(path.join(output, 'windows-pet-edge-bottom.png'), (await petWindow.webContents.capturePage()).toPNG());
    await petJS("(() => {const r=document.querySelector('.pet-drag-target').getBoundingClientRect();document.dispatchEvent(new MouseEvent('mousemove',{clientX:r.left+1,clientY:r.top+1}))})()");
    await until(() => ignoring === true, 'transparent image corner passes mouse through');
    await petJS("(() => {const s=document.querySelector('.pet-sprite > svg'),r=s.viewBox.baseVal,p=new DOMPoint(r.x+r.width/2,r.y+r.height*.45).matrixTransform(s.getScreenCTM());document.dispatchEvent(new MouseEvent('mousemove',{clientX:p.x,clientY:p.y}))})()");
    await until(() => ignoring === false, 'visible character accepts mouse interaction');
    // At 12s the bubble disappears: native window must shrink without changing the anchor.
    const endAnchor = await anchor();
    await until(() => petJS("!document.querySelector('.pet-live-bubble')"), 'speech closes');
    await delay(100);
    assert.deepEqual(await anchor(), endAnchor);
    assert.equal(petWindow.getBounds().width, (await body()).width);
    assert.equal(petWindow.getBounds().height, (await body()).height);
  } finally {
    screen.getCursorScreenPoint = originalCursor; petWindow.setIgnoreMouseEvents = originalIgnore;
    await js(`window.moneyDanceDesktop.saveSettings(${JSON.stringify(initial.settings)})`);
  }
  console.log('PET LAYOUT PASSED: screen edges, panel flipping, stable anchors, compact idle bounds and alpha hit-testing.');
}
module.exports = { verifyLayout };
