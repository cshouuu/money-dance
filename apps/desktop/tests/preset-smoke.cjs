const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function verifyPresets({ app, mainWindow, js, petJS, until, output }) {
  const initial = await js('window.moneyDanceDesktop.getState()');
  const ids = ['xiaoxin', 'mili', 'huanhuan'];
  assert.equal(await js("document.querySelectorAll('.pet-preset-card').length"), 3);
  assert.equal(await js("window.moneyDanceDesktop.resetPet('../invalid').then(()=>false,()=>true)"), true);
  for (const [index, id] of ids.entries()) {
    await js(`document.querySelectorAll('.pet-preset-card')[${index}].click()`);
    await until(() => js(`document.querySelector('.pet-preview-stage .pet-character')?.dataset.preset === '${id}'`), 'preview uses selected atlas');
    assert.equal((await js('window.moneyDanceDesktop.getState()')).settings.presetId, index < 2 ? 'xiaoxin' : 'mili', 'preview alone never replaces desktop pet');
    await js("document.querySelector('.pet-preset-adopt .pet-primary').click()");
    await until(() => petJS(`document.querySelector('.pet-character')?.dataset.preset === '${id}'`), 'desktop receives selected preset');
    await until(() => js("!document.querySelector('.pet-preset-adopt')"), 'selection persisted');
    const stored = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'desktop-pet.json'), 'utf8'));
    assert.equal(stored.settings.presetId, id);
    assert.equal(stored.petSource, 'default');
    // Check all six drawn sequences in both new atlases, not only the card portrait.
    for (const [button, motion] of ['working', 'slacking', 'overtime', 'rest'].entries()) {
      await js(`document.querySelectorAll('.pet-mood-picker button')[${button}].click()`);
      await until(() => js(`document.querySelector('.pet-preview-stage .pet-character')?.dataset.motion === '${motion}'`), `${id} ${motion}`);
    }
    for (const [button, motion] of ['love', 'celebrate'].entries()) {
      await js(`document.querySelectorAll('.pet-reaction-picker button')[${button}].click()`);
      await until(() => js(`document.querySelector('.pet-preview-stage .pet-character')?.dataset.motion === '${motion}'`), `${id} ${motion}`);
    }
  }
  await mainWindow.webContents.reload();
  await until(() => js("document.querySelector('.pet-preview-stage .pet-character')?.dataset.preset === 'huanhuan'"), 'preset survives reload');
  await js("document.querySelector('.pet-mood-picker button:nth-child(2)').click()");
  await until(() => js("document.querySelector('.pet-preview-stage .pet-character')?.dataset.pose === '5'"), 'capybara orange pose');
  await fs.writeFile(path.join(output, 'windows-pet-three-presets.png'), (await mainWindow.webContents.capturePage()).toPNG());
  await js("window.moneyDanceDesktop.getState().then(s=>window.moneyDanceDesktop.saveSettings({...s.settings,name:'我的搭子'}))");
  const result = await js("window.moneyDanceDesktop.resetPet('mili')");
  assert.equal(result.settings.name, '我的搭子', 'custom nickname survives switching');
  await js("window.moneyDanceDesktop.resetPet('xiaoxin')");
  await js(`window.moneyDanceDesktop.saveSettings(${JSON.stringify(initial.settings)})`);
  await js("document.querySelector('.pet-mood-picker button:nth-child(1)').click()");
  await until(() => js("document.querySelector('.pet-preview-stage .pet-character')?.dataset.preset === 'xiaoxin'"), 'restore original for following checks');
}
module.exports = { verifyPresets };
