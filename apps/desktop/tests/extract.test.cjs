const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { extract } = require('../src/extract.cjs');
const fs = require('node:fs');
const path = require('node:path');
test('transparent PNG preserves alpha and crops empty space', async () => {
  const data = Buffer.alloc(100 * 100 * 4);
  for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) { const i = (y * 100 + x) * 4; data[i] = 255; data[i + 3] = 255; }
  const png = await sharp(data, { raw: { width: 100, height: 100, channels: 4 } }).png().toBuffer();
  const result = await extract(png, 'transparent', 'unused');
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 64); assert.equal(meta.height, 84); assert.equal(meta.hasAlpha, true);
  const raw = await sharp(result).raw().toBuffer(); assert.equal(raw[3], 0);
});
const model = path.resolve(__dirname, '../assets/u2netp.onnx');
test('real model removes an opaque background while preserving the subject', { skip: !fs.existsSync(model) }, async () => {
  const photo = await sharp(path.resolve(__dirname, 'fixtures/sample-cat.svg')).flatten({ background: '#ddddee' }).png().toBuffer();
  const result = await extract(photo, 'extract', model);
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.ok(info.width < 240 && info.height < 240, 'empty surrounding background cropped');
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.ok(alphaAt(15, 15) < 20, 'background transparent, no RGB mask channel duplication');
  assert.ok(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)) > 230, 'subject opaque');
});
test('invalid, all-transparent, and opaque input produce actionable errors', async () => {
  await assert.rejects(extract(Buffer.from('no image'), 'transparent', 'unused'));
  const transparent = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#00000000' } }).png().toBuffer();
  await assert.rejects(extract(transparent, 'transparent', 'unused'), /完全透明/);
  const opaque = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(extract(opaque, 'transparent', 'unused'), /背景并不透明/);
});
