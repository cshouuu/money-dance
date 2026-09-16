// Repack existing project artwork into a working, editable example. No network or generation.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { zipSync } = require('fflate');
async function createTemplate() {
  const root = path.resolve(__dirname, '../../..');
  const atlas = path.join(root, 'apps/web/src/pet/assets/xiaoxin-atlas-v2.png');
  const layout = JSON.parse(await fs.readFile(path.join(root, 'apps/web/src/pet/assets/xiaoxin-atlas-v2.json'), 'utf8'));
  const keys = ['working', 'slacking', 'overtime', 'rest', 'love', 'celebrate'];
  const delays = [[1100,180,180,240,140,220,240,2800], [650,650,450,400,650,850,700,4200], [950,700,500,650,800,1200,1800,6000], [850,550,600,650,650,2400,2400,3000], [250,350,450,650,850,650,500,550], [300,180,200,500,220,850,1100,900]];
  const files = {}, animations = {};
  for (let row = 0; row < 6; row++) {
    const frames = [];
    for (let column = 0; column < 8; column++) {
      const crop = layout.frames[row * 8 + column];
      const image = await sharp(atlas).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer();
      const canvas = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#00000000' } }).composite([{ input: image, left: Math.round((192 - crop.width) / 2), top: 180 - layout.baselines[row] + crop.y }]).png().toBuffer();
      if (row === 0 && column === 0) { files['idle.png'] = canvas; animations.idle = { file: 'idle.png' }; }
      frames.push({ input: canvas, left: column * 192, top: 0 });
    }
    files[`${keys[row]}.png`] = await sharp({ create: { width: 1536, height: 192, channels: 4, background: '#00000000' } }).composite(frames).png().toBuffer();
    animations[keys[row]] = { sheet: { file: `${keys[row]}.png`, frameWidth: 192, frameHeight: 192, count: 8 }, durationsMs: delays[row], stillFrame: row === 3 ? 6 : 0 };
  }
  files['pet.json'] = Buffer.from(JSON.stringify({ version: 1, name: '小薪 · 动作包示例', author: 'MoneyDance', animations }, null, 2));
  files['README.md'] = await fs.readFile(path.join(root, 'docs/PET_PACKS.md'));
  const destination = path.join(root, 'apps/web/public/pet-pack-template.zip');
  await fs.writeFile(destination, zipSync(files, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') }));
  console.log(`Pet pack template written: ${destination}`);
}
createTemplate().catch(error => { console.error(error); process.exitCode = 1; });
