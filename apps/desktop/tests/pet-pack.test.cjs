const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { zipSync } = require('fflate');
const { loadPack, publicPack, bindingsFor, LIMIT } = require('../src/pet-pack.cjs');
const png = color => sharp({ create: { width: 12, height: 12, channels: 4, background: color } }).png().toBuffer();
const zip = (manifest, files = {}, prefix = '') => zipSync(Object.fromEntries(Object.entries({ 'pet.json': Buffer.from(JSON.stringify(manifest)), ...files }).map(([key, data]) => [prefix + key, data])));
const base = animations => ({ version: 1, name: '测试角色', animations });

test('shipped template contains all seven playable actions with safe image URLs', async () => {
  const pack = await loadPack(await fs.readFile(path.resolve(__dirname, '../../web/public/pet-pack-template.zip')));
  assert.equal(Object.keys(pack.clips).length, 7);
  assert.equal(pack.clips.love.durations.length, 8);
  assert.equal(pack.clips.rest.stillFrame, 6);
  assert.deepEqual(pack.warnings, []);
  const state = publicPack(pack);
  assert.equal(state.sheets, undefined, 'binary assets are not broadcast with state updates');
  assert.match(state.clips.working.src, /^moneydance:\/\/app\/pet-pack\/[a-f0-9]{64}\/working.png$/);
});
test('frame order, durations and transparent canvas survive normalization; missing actions use idle', async () => {
  const first = await png('#ff000080'), second = await png('#0000ff80');
  const pack = await loadPack(zip(base({ idle: { frames: [{ file: 'a.png', durationMs: 100 }, { file: 'b.png', durationMs: 700 }], stillFrame: 1 } }), { 'a.png': first, 'b.png': second }, 'pet/'));
  assert.deepEqual(pack.clips.idle.durations, [100, 700]);
  assert.equal(pack.bindings.overtime, 'idle');
  const raw = await sharp(pack.sheets.idle).raw().toBuffer();
  assert.deepEqual([...raw.subarray(0, 4)], [255, 0, 0, 128]);
  assert.deepEqual([...raw.subarray(12 * 4, 12 * 4 + 4)], [0, 0, 255, 128]);
  assert.equal(pack.clips.idle.frameHeight, 12);
});
test('GIF and animated WebP decode all frames with original timing, not only their cover', async () => {
  const pixels = Buffer.concat([Buffer.from([255,0,0,255]), Buffer.from([0,0,255,255])]);
  for (const format of ['gif', 'webp']) {
    const data = await sharp(pixels, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } })[format]({ delay: [120, 450], ...(format === 'webp' ? { lossless: true } : {}) }).toBuffer();
    const pack = await loadPack(zip(base({ idle: { file: `a.${format}` } }), { [`a.${format}`]: data }));
    assert.deepEqual(pack.clips.idle.durations, [120, 450]);
    assert.equal(pack.clips.idle.width, 2);
    assert.equal(pack.warnings.length, 1);
  }
});
test('rejects missing idle, missing files, invalid timing, frame sizes and bindings', async () => {
  const img = await png('#ff0000');
  const cases = [
    [base({ working: { file: 'a.png' } }), /idle/],
    [base({ idle: { file: 'gone.png' } }), /缺少素材/],
    [base({ idle: { file: 'a.png', frameDurationMs: -5 } }), /时长/],
    [base({ idle: { file: 'a.png', stillFrame: 5 } }), /越界/],
    [base({ idle: { sheet: { file: 'a.png', frameWidth: 7, frameHeight: 12, count: 2 } } }), /整齐切分/],
    [{ ...base({ idle: { file: 'a.png' } }), bindings: { love: 'missing' } }, /不存在/],
    [base({ idle: { frames: [{ file: 'a.png' }, { file: 'b.png' }] } }), /尺寸必须一致/],
  ];
  const other = await sharp(img).resize(10, 10).png().toBuffer();
  for (const [manifest, error] of cases) await assert.rejects(loadPack(zip(manifest, { 'a.png': img, 'b.png': other })), error);
  assert.throws(() => bindingsFor({ idle: {} }, { working: '__proto__' }), /不存在/);
});
test('rejects traversal, remote references, executable content, corrupt zip and excessive size before decoding', async () => {
  const img = await png('#ff0000');
  const manifest = base({ idle: { file: 'a.png' } });
  for (const name of ['../escape.png', '/escape.png', 'C:/escape.png', 'folder\\escape.png']) {
    await assert.rejects(loadPack(zipSync({ 'pet.json': Buffer.from(JSON.stringify(manifest)), [name]: img })), /不安全/);
  }
  await assert.rejects(loadPack(zip(manifest, { 'a.png': img, 'run.js': Buffer.from('script') })), /脚本/);
  await assert.rejects(loadPack(zip(base({ idle: { file: 'https://example.com/a.png' } }))), /相对路径/);
  await assert.rejects(loadPack(Buffer.from('not a zip')), /ZIP/);
  await assert.rejects(loadPack(Buffer.alloc(LIMIT + 1)), /25 MB/);
  // Forged central directory size must be rejected before decompressor allocation.
  const forged = Buffer.from(zip(manifest, { 'a.png': img }));
  const central = forged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  forged.writeUInt32LE(500_000_000, central + 24);
  await assert.rejects(loadPack(forged), /解压后的素材过大/);
});
